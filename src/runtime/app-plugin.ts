import type { BrowserWindow } from 'electron';
import { app } from 'electron';

import type { CapacitorAppConfig } from '../shared/definitions';

export const APP_PLUGIN_NAME = 'App';

export const APP_PLUGIN_METHODS = [
  'exitApp',
  'getInfo',
  'getLaunchUrl',
  'getState',
  'minimizeApp',
];

export interface AppPluginDependencies {
  config: CapacitorAppConfig;
  getMainWindow: () => BrowserWindow | null;
  getLaunchUrl: () => string | null;
  isActive: () => boolean;
}

/**
 * Built-in bridge for the `@capacitor/app` plugin, so `App.getInfo()`,
 * `App.addListener('appUrlOpen', ...)` etc. behave like on iOS/Android.
 * Events (`appUrlOpen`, `appStateChange`, `pause`, `resume`) are emitted by
 * the deep-links and app-state modules through the plugin host.
 */
export class AppPlugin {
  private readonly dependencies: AppPluginDependencies;

  constructor(dependencies: AppPluginDependencies) {
    this.dependencies = dependencies;
  }

  async exitApp(): Promise<void> {
    app.quit();
  }

  async getInfo(): Promise<{
    name: string;
    id: string;
    build: string;
    version: string;
  }> {
    return {
      name: this.dependencies.config.appName ?? app.getName(),
      id: this.dependencies.config.appId ?? '',
      build: app.getVersion(),
      version: app.getVersion(),
    };
  }

  async getLaunchUrl(): Promise<{ url: string } | undefined> {
    const url = this.dependencies.getLaunchUrl();
    return url ? { url } : undefined;
  }

  async getState(): Promise<{ isActive: boolean }> {
    return { isActive: this.dependencies.isActive() };
  }

  async minimizeApp(): Promise<void> {
    this.dependencies.getMainWindow()?.minimize();
  }
}
