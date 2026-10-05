import { BrowserWindow } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import type { CapacitorElectronConfig } from '../config/index';

import { createMainWindow, reloadAppWindows } from './window';

vi.mock('electron', () => ({
  BrowserWindow: Object.assign(vi.fn(), { getAllWindows: vi.fn() }),
  app: { getPath: () => '/tmp' },
}));

interface FakeWindow {
  show: ReturnType<typeof vi.fn>;
  maximize: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
  emitReadyToShow(): void;
}

function createFakeWindow(): FakeWindow {
  const handlers: Record<string, () => void> = {};
  return {
    show: vi.fn(),
    maximize: vi.fn(),
    on: vi.fn(),
    once: vi.fn((event: string, callback: () => void) => {
      handlers[event] = callback;
    }),
    emitReadyToShow: () => handlers['ready-to-show']?.(),
  };
}

function build(
  config: CapacitorElectronConfig,
  onReadyToShow?: (window: BrowserWindow) => void,
): FakeWindow {
  const fakeWindow = createFakeWindow();
  const fullConfig: CapacitorElectronConfig = {
    ...config,
    window: { statePersistence: false, ...config.window },
    hooks: {
      ...config.hooks,
      windowFactory: () => fakeWindow as unknown as BrowserWindow,
    },
  };
  createMainWindow(fullConfig, '/preload.js', onReadyToShow);
  return fakeWindow;
}

describe('createMainWindow', () => {
  it('shows the window on ready-to-show by default', () => {
    const window = build({});

    window.emitReadyToShow();

    expect(window.show).toHaveBeenCalledTimes(1);
  });

  it('does not show the window on ready-to-show when showOnLaunch is false', () => {
    const window = build({ window: { showOnLaunch: false } });

    window.emitReadyToShow();

    expect(window.show).not.toHaveBeenCalled();
  });

  it('delegates to the ready-to-show coordinator when provided', () => {
    const onReadyToShow = vi.fn();
    const window = build({}, onReadyToShow);

    window.emitReadyToShow();

    expect(onReadyToShow).toHaveBeenCalledTimes(1);
    // The coordinator owns showing the window; createMainWindow must not.
    expect(window.show).not.toHaveBeenCalled();
  });

  it('delegates to the coordinator even when showOnLaunch is false', () => {
    const onReadyToShow = vi.fn();
    const window = build({ window: { showOnLaunch: false } }, onReadyToShow);

    window.emitReadyToShow();

    expect(onReadyToShow).toHaveBeenCalledTimes(1);
    expect(window.show).not.toHaveBeenCalled();
  });
});

describe('reloadAppWindows', () => {
  it('reloads only windows showing trusted app content', () => {
    const createWindow = (url: string) => ({
      webContents: { getURL: () => url, reloadIgnoringCache: vi.fn() },
    });
    const appWindow = createWindow('capacitor-electron://localhost/');
    const splashWindow = createWindow('data:text/html,splash');
    const popupWindow = createWindow('https://accounts.example.com/');
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([
      appWindow,
      splashWindow,
      popupWindow,
    ] as unknown as BrowserWindow[]);

    const beforeReload = vi.fn();
    reloadAppWindows(
      url => url.startsWith('capacitor-electron://localhost/'),
      beforeReload,
    );

    expect(beforeReload).toHaveBeenCalledExactlyOnceWith(appWindow.webContents);
    expect(appWindow.webContents.reloadIgnoringCache).toHaveBeenCalledTimes(1);
    expect(splashWindow.webContents.reloadIgnoringCache).not.toHaveBeenCalled();
    expect(popupWindow.webContents.reloadIgnoringCache).not.toHaveBeenCalled();
  });
});
