import type { CapacitorAppConfig } from '../shared/definitions';

/**
 * Static property carrying a plugin class's metadata. This property IS the
 * contract: any class exposing it is picked up by the platform, so plugin
 * authors don't need a build-time dependency on this package —
 * {@link defineElectronPlugin} is optional sugar.
 */
export const ELECTRON_PLUGIN_MARKER = '__capacitorElectronPlugin';

export interface BundlesService {
  /**
   * Absolute path of the currently active web bundle directory, or `null`
   * when the packaged app bundle is active.
   */
  getActiveBundlePath(): string | null;
  /**
   * Repoint the serving protocol to the given bundle directory and reload
   * all app windows. Pass `null` to revert to the packaged app bundle.
   *
   * By default the failed-boot rollback watchdog is armed: the renderer must
   * call `notifyBootReady()` within the watchdog timeout, otherwise the
   * previous bundle is restored.
   *
   * Pass `{ bootWatchdog: false }` to opt out of the watchdog for this
   * activation. No pending marker is persisted (so the startup pending-check
   * never reverts the bundle), the watchdog timer is not armed, and
   * `notifyBootReady()` becomes a no-op for this activation. Use this when
   * the caller owns rollback itself (e.g. a live-update engine with its own
   * kill-safe state machine); running both watchdogs would drift the two
   * persisted states.
   */
  setActiveBundle(
    bundleDirectory: string | null,
    options?: { bootWatchdog?: boolean },
  ): Promise<void>;
  /**
   * Signal that the newly served bundle booted successfully, cancelling the
   * failed-boot rollback watchdog. A no-op for activations made with
   * `{ bootWatchdog: false }`.
   */
  notifyBootReady(): void;
}

/**
 * Platform primitives exposed to plugins.
 */
export interface PlatformServices {
  bundles: BundlesService;
}

export interface ElectronPluginContext {
  config: CapacitorAppConfig;
  services: PlatformServices;
  /**
   * Emits a plugin event to all web listeners registered via
   * `addListener(eventName, ...)`, mirroring Capacitor's native
   * `notifyListeners`.
   */
  notifyListeners: (eventName: string, data?: unknown) => void;
}

export interface ElectronPluginMetadata {
  /**
   * Capacitor plugin registration name (the first argument the plugin
   * passes to `registerPlugin`), e.g. `Sqlite`. The platform exposes the
   * plugin under this name through Capacitor's native plugin path, so no
   * `electron` key in the plugin's `registerPlugin` wiring is needed.
   */
  name: string;
  /**
   * The plugin's public API: the methods exposed to the web app. Methods
   * not listed here are never bridged. Each declared method must exist on
   * the class prototype (validated at boot).
   *
   * `load` is reserved for the lifecycle hook (see
   * {@link ElectronPluginLifecycle}) and must NOT be listed here — doing so
   * is rejected at boot, because bridging it would let the renderer invoke
   * the lifecycle hook arbitrarily.
   */
  methods: string[];
}

/**
 * Optional lifecycle contract a plugin instance may implement — the
 * structural counterpart of the {@link ElectronPlugin} base class.
 *
 * `load` runs once after the plugin is constructed and is awaited by the
 * platform before the first application window loads, so a plugin can
 * perform async setup (e.g. repointing the active bundle via
 * `services.bundles`) and have it take effect on first paint. It is a
 * lifecycle hook, NOT a bridged method: `load` is reserved and is never
 * bridged to the renderer. It must NOT be listed in the static metadata's
 * `methods` — doing so is rejected at boot. A rejected/thrown `load` fails
 * the app boot loudly.
 */
export interface ElectronPluginLifecycle {
  load?(): Promise<void> | void;
}

/**
 * Recommended base class for electron plugin implementations, mirroring how
 * Android/iOS plugins extend Capacitor's `Plugin` and override `load()`.
 *
 * Extending it is optional — the discovery contract is the static
 * {@link ELECTRON_PLUGIN_MARKER} metadata (see {@link defineElectronPlugin}),
 * not this class, and the platform never uses `instanceof` to detect plugins
 * (that would break across duplicated copies of this package in
 * `node_modules`). It provides the ergonomic, typed path: the constructor
 * stores the {@link ElectronPluginContext} and {@link load} is an overridable
 * lifecycle hook with a no-op default.
 *
 * To adopt it, add `@capawesome/capacitor-electron` as a devDependency (for
 * the types) and an optional peerDependency (for the runtime value).
 */
export class ElectronPlugin implements ElectronPluginLifecycle {
  protected readonly context: ElectronPluginContext;

  constructor(context: ElectronPluginContext) {
    this.context = context;
  }

  /**
   * Lifecycle hook, overridable by subclasses. Runs once after all plugins
   * have been constructed and is awaited by the platform before the first
   * application window loads, so async setup (e.g. repointing the active
   * bundle via `context.services.bundles`) takes effect on first paint. A
   * throwing/rejecting `load` aborts app boot. `load` is reserved and is
   * never bridged to the renderer. The default implementation is a no-op.
   */
  load(): Promise<void> | void {
    // no-op default
  }
}

export type ElectronPluginClass = (new (
  context: ElectronPluginContext,
) => ElectronPluginLifecycle | unknown) & {
  [ELECTRON_PLUGIN_MARKER]?: ElectronPluginMetadata;
};

/**
 * Marks a class as an electron plugin implementation. Equivalent to
 * declaring `static __capacitorElectronPlugin = metadata` on the class.
 *
 * @example
 * export const Sqlite = defineElectronPlugin(
 *   { name: 'Sqlite', methods: ['open', 'query'] },
 *   SqliteImpl,
 * );
 */
export function defineElectronPlugin<
  T extends new (context: ElectronPluginContext) => unknown,
>(metadata: ElectronPluginMetadata, pluginClass: T): T {
  Object.defineProperty(pluginClass, ELECTRON_PLUGIN_MARKER, {
    value: metadata,
    enumerable: false,
  });
  return pluginClass;
}
