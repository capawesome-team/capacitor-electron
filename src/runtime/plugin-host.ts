import { ipcMain } from 'electron';
import type { IpcMainEvent, IpcMainInvokeEvent, WebContents } from 'electron';

import type { ElectronPluginContext, PlatformServices } from '../plugin/index';
import { ELECTRON_PLUGIN_MARKER } from '../plugin/index';
import type {
  BridgeBootstrap,
  BridgeCallResult,
  BridgePluginDescriptor,
  CapacitorAppConfig,
  PluginManifest,
} from '../shared/definitions';
import {
  BOOTSTRAP_CHANNEL,
  EVENT_CHANNEL,
  addListenerChannel,
  methodChannel,
  removeAllListenersChannel,
  removeListenerChannel,
} from '../shared/ipc';

type PluginInstance = Record<string, unknown>;

type PluginModule = Record<string, unknown>;

interface EventSubscription {
  pluginName: string;
  eventName: string;
  sender: WebContents;
}

export interface PluginHostOptions {
  platformName: string;
  capacitorConfig: CapacitorAppConfig;
  services: PlatformServices;
  /**
   * Imports the sync-time registrar (`generated/plugins.mjs`): a map from
   * package name to a loader of the plugin's ES module.
   */
  loadRegistrar: () => Promise<Record<string, () => Promise<PluginModule>>>;
  manifest: PluginManifest;
  /**
   * Only calls from frames whose URL matches one of these origins (prefix
   * match) are served.
   */
  isTrustedFrameUrl: (url: string) => boolean;
}

interface HostedPlugin {
  descriptor: BridgePluginDescriptor;
  instance: PluginInstance;
}

export class PluginHost {
  private readonly options: PluginHostOptions;
  private readonly plugins = new Map<string, HostedPlugin>();
  private readonly subscriptions = new Map<string, EventSubscription>();
  private readonly retainedEvents = new Map<string, unknown[]>();
  private readonly cleanedUpWebContents = new WeakSet<WebContents>();
  private readonly builtInFactories: {
    pluginName: string;
    create: (context: ElectronPluginContext) => PluginInstance;
    methods: string[];
  }[] = [];

  constructor(options: PluginHostOptions) {
    this.options = options;
  }

  /**
   * Registers a runtime-provided plugin (e.g. the built-in `@capacitor/app`
   * bridge) that is not discovered via the sync-time manifest. Must be
   * called before `start()`.
   */
  registerBuiltInPlugin(
    pluginName: string,
    methods: string[],
    create: (context: ElectronPluginContext) => PluginInstance,
  ): void {
    this.builtInFactories.push({ pluginName, create, methods });
  }

  async start(): Promise<void> {
    await this.instantiatePlugins();
    await this.initializePlugins();
    ipcMain.on(BOOTSTRAP_CHANNEL, event => {
      if (!this.isTrustedSender(event)) {
        event.returnValue = {
          platformName: this.options.platformName,
          plugins: [],
        };
        return;
      }
      event.returnValue = this.getBootstrap();
    });
    for (const [pluginName, plugin] of this.plugins) {
      this.registerMethodHandlers(pluginName, plugin);
      this.registerEventHandlers(pluginName);
    }
  }

  getBootstrap(): BridgeBootstrap {
    return {
      platformName: this.options.platformName,
      plugins: [...this.plugins.values()].map(plugin => plugin.descriptor),
    };
  }

  /**
   * Emits a plugin event to all web listeners registered for it. Exposed to
   * plugins as `context.notifyListeners`. With `retain`, an event that finds
   * no listener is buffered and delivered to the first listener registered
   * for it (mirroring native `retainUntilConsumed`) — required for
   * cold-start events like `appUrlOpen` that fire before the page has
   * registered its listeners.
   */
  notifyListeners(
    pluginName: string,
    eventName: string,
    data?: unknown,
    options?: { retain?: boolean },
  ): void {
    let delivered = false;
    for (const [key, subscription] of this.subscriptions) {
      if (
        subscription.pluginName === pluginName &&
        subscription.eventName === eventName &&
        !subscription.sender.isDestroyed()
      ) {
        const listenerId = Number(key.split(':').pop());
        subscription.sender.send(EVENT_CHANNEL, {
          pluginName,
          listenerId,
          data,
        });
        delivered = true;
      }
    }
    if (!delivered && options?.retain) {
      const key = `${pluginName}:${eventName}`;
      const buffered = this.retainedEvents.get(key) ?? [];
      buffered.push(data);
      this.retainedEvents.set(key, buffered);
    }
  }

  private async instantiatePlugins(): Promise<void> {
    for (const factory of this.builtInFactories) {
      const instance = factory.create(this.createContext(factory.pluginName));
      this.plugins.set(factory.pluginName, {
        descriptor: {
          pluginName: factory.pluginName,
          methods: factory.methods,
        },
        instance,
      });
    }
    const registrar = await this.options.loadRegistrar();
    for (const packageManifest of this.options.manifest.plugins) {
      const load = registrar[packageManifest.packageName];
      if (!load) {
        throw new Error(
          `Plugin ${packageManifest.packageName} is missing from the generated registrar. Re-run \`npx cap sync @capawesome/capacitor-electron\`.`,
        );
      }
      const pluginModule = await load();
      const classes = markedPluginClasses(pluginModule);
      if (classes.length === 0) {
        throw new Error(
          `${packageManifest.packageName} exports no plugin classes (a class with static ${ELECTRON_PLUGIN_MARKER} metadata declaring { name, methods }).`,
        );
      }
      for (const { metadata, klass } of classes) {
        if (this.plugins.has(metadata.name)) {
          throw new Error(
            `Duplicate plugin name "${metadata.name}" (from ${packageManifest.packageName}).`,
          );
        }
        const instance = new klass(
          this.createContext(metadata.name),
        ) as PluginInstance;
        validateDeclaredMethods(
          metadata.name,
          metadata.methods,
          instance,
          packageManifest.packageName,
        );
        this.plugins.set(metadata.name, {
          descriptor: {
            pluginName: metadata.name,
            methods: metadata.methods,
          },
          instance,
        });
      }
    }
  }

  /**
   * Runs the optional `initialize()` lifecycle hook on every plugin instance
   * that declares one, after all plugins have been constructed and before
   * `start()` resolves (i.e. before the first window loads — see
   * `runtime/index.ts`). This is a lifecycle hook, not a bridged method: it
   * is detected directly on the instance and runs whether or not it appears
   * in the plugin's declared `methods`.
   *
   * Hooks run sequentially, not concurrently: a plugin may repoint the
   * active bundle here, so a deterministic order (built-ins first, then
   * manifest order) avoids interleaved repointing, and fail-fast on the
   * first rejection gives a clean boot failure with the offending plugin
   * named. A throwing/rejecting hook aborts boot, consistent with how a
   * declared-but-missing method fails.
   */
  private async initializePlugins(): Promise<void> {
    for (const [pluginName, plugin] of this.plugins) {
      const initialize = plugin.instance['initialize'];
      if (typeof initialize !== 'function') {
        continue;
      }
      try {
        await (initialize as () => Promise<void> | void).call(plugin.instance);
      } catch (error) {
        throw new Error(
          `Plugin "${pluginName}" failed to initialize: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { cause: error },
        );
      }
    }
  }

  private createContext(pluginName: string): ElectronPluginContext {
    return {
      config: this.options.capacitorConfig,
      services: this.options.services,
      notifyListeners: (eventName, data) =>
        this.notifyListeners(pluginName, eventName, data),
    };
  }

  private registerMethodHandlers(
    pluginName: string,
    plugin: HostedPlugin,
  ): void {
    for (const methodName of plugin.descriptor.methods) {
      ipcMain.handle(
        methodChannel(pluginName, methodName),
        async (event, args: unknown[]): Promise<BridgeCallResult> => {
          if (!this.isTrustedSender(event)) {
            return { error: { message: 'Untrusted sender.' } };
          }
          try {
            const method = plugin.instance[methodName] as (
              ...methodArgs: unknown[]
            ) => unknown;
            const data = await method.apply(plugin.instance, args);
            return { data };
          } catch (error) {
            return { error: toBridgeError(error) };
          }
        },
      );
    }
  }

  private registerEventHandlers(pluginName: string): void {
    ipcMain.handle(
      addListenerChannel(pluginName),
      (event, listenerId: number, eventName: string): BridgeCallResult => {
        if (!this.isTrustedSender(event)) {
          return { error: { message: 'Untrusted sender.' } };
        }
        this.subscriptions.set(
          subscriptionKey(event.sender, pluginName, listenerId),
          { pluginName, eventName, sender: event.sender },
        );
        if (!this.cleanedUpWebContents.has(event.sender)) {
          this.cleanedUpWebContents.add(event.sender);
          const webContentsId = event.sender.id;
          event.sender.once('destroyed', () =>
            this.removeSubscriptionsOfSender(webContentsId),
          );
        }
        const retainedKey = `${pluginName}:${eventName}`;
        const retained = this.retainedEvents.get(retainedKey);
        if (retained) {
          this.retainedEvents.delete(retainedKey);
          for (const data of retained) {
            event.sender.send(EVENT_CHANNEL, { pluginName, listenerId, data });
          }
        }
        return { data: listenerId };
      },
    );
    ipcMain.handle(
      removeListenerChannel(pluginName),
      (event, listenerId: number): BridgeCallResult => {
        if (!this.isTrustedSender(event)) {
          return { error: { message: 'Untrusted sender.' } };
        }
        this.subscriptions.delete(
          subscriptionKey(event.sender, pluginName, listenerId),
        );
        return {};
      },
    );
    ipcMain.handle(
      removeAllListenersChannel(pluginName),
      (event, eventName?: string): BridgeCallResult => {
        if (!this.isTrustedSender(event)) {
          return { error: { message: 'Untrusted sender.' } };
        }
        const prefix = `${event.sender.id}:${pluginName}:`;
        for (const [key, subscription] of [...this.subscriptions]) {
          if (
            key.startsWith(prefix) &&
            (eventName === undefined || subscription.eventName === eventName)
          ) {
            this.subscriptions.delete(key);
          }
        }
        return {};
      },
    );
  }

  private removeSubscriptionsOfSender(webContentsId: number): void {
    const prefix = `${webContentsId}:`;
    for (const key of [...this.subscriptions.keys()]) {
      if (key.startsWith(prefix)) {
        this.subscriptions.delete(key);
      }
    }
  }

  private isTrustedSender(event: IpcMainInvokeEvent | IpcMainEvent): boolean {
    const frame = event.senderFrame;
    if (!frame || frame !== event.sender.mainFrame) {
      return false;
    }
    return this.options.isTrustedFrameUrl(frame.url);
  }
}

const subscriptionKey = (
  sender: WebContents,
  pluginName: string,
  listenerId: number,
): string => `${sender.id}:${pluginName}:${listenerId}`;

interface MarkedPluginClass {
  metadata: { name: string; methods: string[] };
  klass: new (context: ElectronPluginContext) => unknown;
}

function markedPluginClasses(pluginModule: PluginModule): MarkedPluginClass[] {
  const classes: MarkedPluginClass[] = [];
  for (const [exportName, exported] of Object.entries(pluginModule)) {
    if (typeof exported !== 'function' || !exported.prototype) {
      continue;
    }
    const metadata = (exported as unknown as Record<string, unknown>)[
      ELECTRON_PLUGIN_MARKER
    ] as { name?: string; methods?: unknown } | undefined;
    if (!metadata) {
      continue;
    }
    if (
      typeof metadata.name !== 'string' ||
      !Array.isArray(metadata.methods) ||
      metadata.methods.some(method => typeof method !== 'string')
    ) {
      throw new Error(
        `Export "${exportName}" declares invalid ${ELECTRON_PLUGIN_MARKER} metadata: expected { name: string, methods: string[] }.`,
      );
    }
    classes.push({
      metadata: { name: metadata.name, methods: metadata.methods as string[] },
      klass: exported as MarkedPluginClass['klass'],
    });
  }
  return classes;
}

/**
 * The declared methods are the contract; a declared method missing on the
 * instance is a plugin bug surfaced at boot instead of at call time.
 */
export function validateDeclaredMethods(
  pluginName: string,
  methods: string[],
  instance: PluginInstance,
  packageName: string,
): void {
  for (const methodName of methods) {
    if (typeof instance[methodName] !== 'function') {
      throw new Error(
        `Plugin "${pluginName}" (from ${packageName}) declares method "${methodName}" but does not implement it.`,
      );
    }
  }
}

function toBridgeError(error: unknown): { message: string; code?: string } {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return {
      message: error.message,
      ...(typeof code === 'string' ? { code } : {}),
    };
  }
  return { message: String(error) };
}
