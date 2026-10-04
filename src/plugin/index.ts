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
   * Serve the given bundle directory and reload all app windows. Pass `null`
   * to revert to the packaged app bundle. Throws if the directory does not
   * contain an `index.html`.
   *
   * The switch is in-memory only: the platform does not persist the active
   * bundle, and it does not roll back. A consumer that keeps a bundle active
   * across restarts re-applies it in its `load()` hook and owns rollback.
   */
  setActiveBundle(bundleDirectory: string | null): void;
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
   * `notifyListeners`. With `retain`, an event that finds no listener is
   * buffered until the first listener registers for it (mirroring native
   * `retainUntilConsumed`).
   */
  notifyListeners: (
    eventName: string,
    data?: unknown,
    options?: { retain?: boolean },
  ) => void;
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
   * the class prototype (validated at boot). `load` is reserved (see
   * {@link ElectronPluginLifecycle.load}).
   */
  methods: string[];
}

/**
 * Optional lifecycle contract a plugin instance may implement — the
 * structural counterpart of the {@link ElectronPlugin} base class.
 */
export interface ElectronPluginLifecycle {
  /**
   * Runs once after all plugins have been constructed and is awaited by the
   * platform before the first application window loads, so async setup
   * (e.g. repointing the active bundle via `services.bundles`) takes effect
   * on first paint. Hooks run sequentially: built-ins first, then manifest
   * order.
   *
   * `load` is a reserved lifecycle hook, NOT a bridged method: listing it in
   * the metadata's `methods` is rejected at boot, because bridging it would
   * let the renderer invoke it arbitrarily. A rejected/thrown `load` fails
   * the app boot loudly.
   */
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
 * stores the {@link ElectronPluginContext} and
 * {@link ElectronPluginLifecycle.load} is overridable with a no-op default.
 *
 * To adopt it, add `@capawesome/capacitor-electron` as a devDependency (for
 * the types) and an optional peerDependency (for the runtime value).
 */
export class ElectronPlugin implements ElectronPluginLifecycle {
  protected readonly context: ElectronPluginContext;

  constructor(context: ElectronPluginContext) {
    this.context = context;
  }

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
