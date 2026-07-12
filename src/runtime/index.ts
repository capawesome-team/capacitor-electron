import { BrowserWindow, app, session } from 'electron';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';

import type { CapacitorElectronConfig } from '../config/index';
import type { PlatformServices } from '../plugin/index';
import type { CapacitorAppConfig, PluginManifest } from '../shared/definitions';

import { APP_PLUGIN_METHODS, APP_PLUGIN_NAME, AppPlugin } from './app-plugin';
import { installAppState } from './app-state';
import { Bundles } from './bundles';
import { DEFAULT_CSP, DEFAULT_DEV_CSP, installDevServerCsp } from './csp';
import { installDeepLinks } from './deep-links';
import { installNavigationGuards } from './navigation';
import { PluginHost } from './plugin-host';
import { installProtocolHandler, registerPrivilegedScheme } from './serving';
import { createMainWindow } from './window';

export type { CapacitorElectronConfig } from '../config/index';
export { defineConfig } from '../config/index';
export type {
  BundlesService,
  ElectronPluginContext,
  PlatformServices,
} from '../plugin/index';
export { defineElectronPlugin } from '../plugin/index';

export interface CapacitorElectronApp {
  /**
   * Resolves once the app is ready and the main window has been created.
   */
  whenReady: Promise<void>;
  getMainWindow(): BrowserWindow | null;
  services: PlatformServices;
}

export function createCapacitorElectronApp(
  config: CapacitorElectronConfig = {},
): CapacitorElectronApp {
  const appPath = app.getAppPath();
  const capacitorConfig = readGeneratedJson<CapacitorAppConfig>(
    appPath,
    'capacitor.config.json',
  );
  const manifest = readGeneratedJson<PluginManifest>(
    appPath,
    'plugin-manifest.json',
    { platformVersion: '0.0.0', plugins: [] },
  );
  const scheme = config.scheme ?? 'capacitor-electron';
  const hostname = config.hostname ?? 'localhost';
  const appOrigin = `${scheme}://${hostname}`;
  const devServerUrl = process.env.CAPACITOR_ELECTRON_DEV_SERVER_URL;
  const isTrustedUrl = (url: string): boolean =>
    url === appOrigin ||
    url.startsWith(`${appOrigin}/`) ||
    (devServerUrl !== undefined && url.startsWith(devServerUrl));

  let mainWindow: BrowserWindow | null = null;
  const reloadWindows = (): void => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.reload();
    }
  };
  const bundles = new Bundles({ reloadWindows });
  const services: PlatformServices = { bundles };
  const pluginHost = new PluginHost({
    platformName: 'electron',
    capacitorConfig,
    services,
    manifest,
    loadRegistrar: () => loadRegistrar(appPath),
    isTrustedFrameUrl: isTrustedUrl,
  });

  config.hooks?.beforeReady?.(app);

  if (config.singleInstance !== false) {
    if (!app.requestSingleInstanceLock()) {
      app.quit();
      return {
        whenReady: new Promise<void>(() => {
          // Never resolves; the app is quitting.
        }),
        getMainWindow: () => null,
        services,
      };
    }
    app.on('second-instance', (_event, argv) => {
      const window = mainWindow;
      if (window) {
        if (window.isMinimized()) {
          window.restore();
        }
        window.focus();
      }
      deepLinks?.handleArgv(argv);
    });
  } else if (config.deepLinks) {
    console.warn(
      '[capacitor-electron] Deep links on Windows/Linux require singleInstance; links opened while the app is running will start a second instance instead of firing appUrlOpen.',
    );
  }

  const deepLinks = config.deepLinks
    ? installDeepLinks({
        scheme: config.deepLinks.scheme,
        onUrl: url =>
          pluginHost.notifyListeners(
            APP_PLUGIN_NAME,
            'appUrlOpen',
            { url },
            { retain: true },
          ),
      })
    : null;
  const appState = installAppState({
    notify: (eventName, data) =>
      pluginHost.notifyListeners(APP_PLUGIN_NAME, eventName, data),
  });
  pluginHost.registerBuiltInPlugin(
    APP_PLUGIN_NAME,
    APP_PLUGIN_METHODS,
    () =>
      new AppPlugin({
        config: capacitorConfig,
        getMainWindow: () => mainWindow,
        getLaunchUrl: () => deepLinks?.getLaunchUrl() ?? null,
        isActive: () => appState.isActive(),
      }) as unknown as Record<string, unknown>,
  );

  registerPrivilegedScheme(scheme);

  const whenReady = app.whenReady().then(async () => {
    await pluginHost.start();
    installProtocolHandler(session.defaultSession, {
      scheme,
      hostname,
      getRootDirectory: () =>
        bundles.getActiveBundlePath() ?? join(appPath, 'app'),
      getContentSecurityPolicy: () => config.csp?.policy ?? DEFAULT_CSP,
    });
    if (devServerUrl) {
      installDevServerCsp(
        session.defaultSession,
        devServerUrl,
        config.csp?.devPolicy ?? DEFAULT_DEV_CSP,
      );
    }
    mainWindow = createMainWindow(
      config,
      join(__dirname, '../preload/index.js'),
    );
    installNavigationGuards(mainWindow, isTrustedUrl);
    await config.hooks?.onWindowCreated?.(mainWindow);
    if (devServerUrl) {
      installDevServerRetry(mainWindow, devServerUrl);
    }
    await mainWindow.loadURL(devServerUrl ?? `${appOrigin}/`);
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  return {
    whenReady,
    getMainWindow: () => mainWindow,
    services,
  };
}

/**
 * Dev servers restart during development; instead of stranding the window
 * on a Chromium error page, keep retrying until the server is back.
 */
function installDevServerRetry(
  window: BrowserWindow,
  devServerUrl: string,
): void {
  window.webContents.on(
    'did-fail-load',
    (_event, _errorCode, _errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame || !validatedURL.startsWith(devServerUrl)) {
        return;
      }
      console.warn(
        `[capacitor-electron] Failed to load ${devServerUrl}, retrying in 1s...`,
      );
      setTimeout(() => {
        if (!window.isDestroyed()) {
          void window.loadURL(devServerUrl);
        }
      }, 1000);
    },
  );
}

function readGeneratedJson<T>(
  appPath: string,
  fileName: string,
  fallback?: T,
): T {
  const filePath = join(appPath, 'generated', fileName);
  if (!existsSync(filePath)) {
    if (fallback !== undefined) {
      return fallback;
    }
    throw new Error(
      `${filePath} is missing. Run \`npx cap sync @capawesome/capacitor-electron\` first.`,
    );
  }
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

async function loadRegistrar(
  appPath: string,
): Promise<Record<string, () => Promise<Record<string, unknown>>>> {
  const registrarPath = join(appPath, 'generated', 'plugins.mjs');
  if (!existsSync(registrarPath)) {
    return {};
  }
  const registrarModule = (await import(pathToFileURL(registrarPath).href)) as {
    plugins: Record<string, () => Promise<Record<string, unknown>>>;
  };
  return registrarModule.plugins;
}
