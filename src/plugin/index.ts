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
   * The renderer must call `notifyBootReady()` within the watchdog timeout,
   * otherwise the previous bundle is restored.
   */
  setActiveBundle(bundleDirectory: string | null): Promise<void>;
  /**
   * Signal that the newly served bundle booted successfully, cancelling the
   * failed-boot rollback watchdog.
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
   */
  methods: string[];
}

export type ElectronPluginClass = (new (
  context: ElectronPluginContext,
) => unknown) & {
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
