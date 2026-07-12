import type {
  BrowserWindow,
  BrowserWindowConstructorOptions,
  App,
} from 'electron';

export interface ElectronWindowOptions {
  /**
   * @default 1200
   */
  width?: number;
  /**
   * @default 800
   */
  height?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  backgroundColor?: string;
  fullscreen?: boolean;
  /**
   * Persist and restore window size and position across app launches.
   *
   * @default true
   */
  statePersistence?: boolean;
  titleBarStyle?: 'default' | 'hidden' | 'hiddenInset';
}

export interface ElectronContentSecurityPolicyOptions {
  /**
   * Content-Security-Policy header value applied to documents served from
   * the app bundle. Replaces the default policy entirely.
   */
  policy?: string;
  /**
   * Policy applied in dev-server mode. Dev servers need relaxations for
   * HMR (inline scripts, websockets). Replaces the default dev policy.
   */
  devPolicy?: string;
}

export interface ElectronDeepLinksOptions {
  /**
   * Custom URL scheme to register with the operating system, e.g. `myapp`
   * for `myapp://` links. Delivered to the web app via the `@capacitor/app`
   * plugin's `appUrlOpen` event.
   */
  scheme: string;
}

export interface ElectronHooks {
  /**
   * Called synchronously before `app.whenReady()` resolves handlers are
   * installed. Use for low-level Electron configuration.
   */
  beforeReady?: (app: App) => void;
  /**
   * Replaces the built-in window construction. Receives the fully composed
   * `BrowserWindowConstructorOptions` (including the mandatory security
   * options, which must not be weakened).
   */
  windowFactory?: (options: BrowserWindowConstructorOptions) => BrowserWindow;
  /**
   * Called after the main window has been created.
   */
  onWindowCreated?: (window: BrowserWindow) => void | Promise<void>;
}

export interface CapacitorElectronConfig {
  /**
   * Custom scheme used to serve the web app.
   *
   * @default 'capacitor-electron'
   */
  scheme?: string;
  /**
   * Hostname of the served origin.
   *
   * @default 'localhost'
   */
  hostname?: string;
  window?: ElectronWindowOptions;
  csp?: ElectronContentSecurityPolicyOptions;
  deepLinks?: ElectronDeepLinksOptions;
  /**
   * Enforce a single running instance of the app. Required for deep links
   * on Windows and Linux.
   *
   * @default true
   */
  singleInstance?: boolean;
  hooks?: ElectronHooks;
}

export function defineConfig(
  config: CapacitorElectronConfig,
): CapacitorElectronConfig {
  return config;
}
