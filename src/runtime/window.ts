import { BrowserWindow, app } from 'electron';
import type { BrowserWindowConstructorOptions } from 'electron';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import type { CapacitorElectronConfig } from '../config/index';

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
}

export function createMainWindow(
  config: CapacitorElectronConfig,
  preloadPath: string,
  onReadyToShow?: (window: BrowserWindow) => void,
): BrowserWindow {
  const windowConfig = config.window ?? {};
  const persistState = windowConfig.statePersistence !== false;
  const showOnLaunch = windowConfig.showOnLaunch !== false;
  const state = persistState ? readWindowState() : null;
  const options: BrowserWindowConstructorOptions = {
    width: state?.width ?? windowConfig.width ?? 1200,
    height: state?.height ?? windowConfig.height ?? 800,
    x: state?.x,
    y: state?.y,
    minWidth: windowConfig.minWidth,
    minHeight: windowConfig.minHeight,
    maxWidth: windowConfig.maxWidth,
    maxHeight: windowConfig.maxHeight,
    backgroundColor: windowConfig.backgroundColor,
    fullscreen: windowConfig.fullscreen,
    titleBarStyle: windowConfig.titleBarStyle,
    show: false,
    webPreferences: {
      // Security defaults. Non-negotiable; not configurable.
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
    },
  };
  const window = config.hooks?.windowFactory
    ? config.hooks.windowFactory(options)
    : new BrowserWindow(options);
  if (state?.maximized) {
    window.maximize();
  }
  window.once('ready-to-show', () => {
    if (onReadyToShow) {
      onReadyToShow(window);
    } else if (showOnLaunch) {
      window.show();
    }
  });
  if (persistState) {
    window.on('close', () => saveWindowState(window));
  }
  return window;
}

const windowStateFilePath = (): string =>
  join(app.getPath('userData'), 'capacitor-electron-window-state.json');

function readWindowState(): WindowState | null {
  try {
    return JSON.parse(
      readFileSync(windowStateFilePath(), 'utf8'),
    ) as WindowState;
  } catch {
    return null;
  }
}

function saveWindowState(window: BrowserWindow): void {
  try {
    const bounds = window.getNormalBounds();
    const state: WindowState = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      maximized: window.isMaximized(),
    };
    writeFileSync(windowStateFilePath(), JSON.stringify(state));
  } catch {
    // Window state persistence is best-effort.
  }
}
