/**
 * Subset of the Capacitor configuration (`capacitor.config.*`) that this
 * platform consumes. Provided by the Capacitor CLI via the
 * `CAPACITOR_CONFIG` environment variable and embedded at sync time.
 */
export interface CapacitorAppConfig {
  appId?: string;
  appName?: string;
  webDir?: string;
  server?: {
    url?: string;
    cleartext?: boolean;
  };
  [key: string]: unknown;
}

export interface PluginPackageManifest {
  packageName: string;
  /**
   * Module specifier of the plugin's compiled electron implementation
   * (an ES module), resolvable from the app's root `node_modules`.
   */
  specifier: string;
}

/**
 * Generated at sync time by statically scanning the app's dependencies for
 * `capacitor.electron` package.json entries. No plugin code is executed at
 * sync time; classes and methods are enumerated at boot, inside Electron.
 */
export interface PluginManifest {
  platformVersion: string;
  plugins: PluginPackageManifest[];
}

export interface BridgePluginDescriptor {
  /**
   * Capacitor plugin registration name (the first argument the plugin
   * passes to `registerPlugin`), declared via the plugin's static
   * `__capacitorElectronPlugin` metadata.
   */
  pluginName: string;
  /**
   * The plugin's declared public API. Only these methods are bridged.
   */
  methods: string[];
}

/**
 * Data handed to the preload (and from there to the main world) via a
 * synchronous IPC call before any page script runs.
 */
export interface BridgeBootstrap {
  platformName: string;
  plugins: BridgePluginDescriptor[];
}

export interface BridgeCallResult {
  data?: unknown;
  error?: BridgeError;
}

export interface BridgeError {
  message: string;
  code?: string;
}
