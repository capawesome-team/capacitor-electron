import { BrowserWindow, app } from 'electron';

export interface AppStateOptions {
  notify: (eventName: string, data?: unknown) => void;
}

export interface AppState {
  isActive: () => boolean;
}

/**
 * Tracks whether any app window is focused and bridges the transitions to
 * the `@capacitor/app` events `appStateChange`, `pause`, and `resume`.
 */
export function installAppState(options: AppStateOptions): AppState {
  let active = BrowserWindow.getFocusedWindow() !== null;

  const setActive = (nextActive: boolean): void => {
    if (nextActive === active) {
      return;
    }
    active = nextActive;
    options.notify('appStateChange', { isActive: nextActive });
    options.notify(nextActive ? 'resume' : 'pause');
  };

  app.on('browser-window-focus', () => setActive(true));
  app.on('browser-window-blur', () => {
    // Focus may be moving between two of the app's own windows; only report
    // inactive when no window has focus after the switch settles.
    setTimeout(() => {
      if (BrowserWindow.getFocusedWindow() === null) {
        setActive(false);
      }
    }, 50);
  });

  return { isActive: () => active };
}
