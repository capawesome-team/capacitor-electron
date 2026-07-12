import { shell } from 'electron';
import type { BrowserWindow } from 'electron';

/**
 * Navigation is locked to the app origins; external links open in the
 * system browser. Guards check the DESTINATION URL of each navigation.
 */
export function installNavigationGuards(
  window: BrowserWindow,
  isTrustedUrl: (url: string) => boolean,
): void {
  window.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedUrl(url)) {
      event.preventDefault();
      openExternalIfSafe(url);
    }
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalIfSafe(url);
    return { action: 'deny' };
  });
}

function openExternalIfSafe(url: string): void {
  if (
    url.startsWith('https://') ||
    url.startsWith('http://') ||
    url.startsWith('mailto:')
  ) {
    void shell.openExternal(url);
  }
}
