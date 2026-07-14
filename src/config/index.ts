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

export interface ElectronSplashScreenOptions {
  /**
   * Whether the splash screen is shown while the app boots.
   *
   * When unset, the splash screen is shown only if a splash file is found
   * (`assets/splash.html` or `assets/splash.png` relative to the electron app
   * directory, or the file referenced by `path`). Set to `true` to require a
   * splash file — boot fails loudly if none resolves. Set to `false` to
   * disable the splash screen entirely.
   */
  enabled?: boolean;
  /**
   * Path to the splash screen file, relative to the electron app directory.
   * Either an HTML file (`.html`) or an image
   * (`.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`). Images are centered
   * on a `backgroundColor` canvas.
   *
   * When unset, `assets/splash.html` and then `assets/splash.png` are tried.
   */
  path?: string;
  /**
   * Width of the splash screen window in pixels.
   *
   * @default 400
   */
  width?: number;
  /**
   * Height of the splash screen window in pixels.
   *
   * @default 300
   */
  height?: number;
  /**
   * Background color of the splash screen window (and the image canvas).
   *
   * @default '#ffffff'
   */
  backgroundColor?: string;
  /**
   * Minimum duration in milliseconds the splash screen stays visible, even
   * if the app finishes booting sooner. Prevents a jarring flash on fast
   * startups.
   *
   * @default 0
   */
  minimumDurationMs?: number;
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
  splashScreen?: ElectronSplashScreenOptions;
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
