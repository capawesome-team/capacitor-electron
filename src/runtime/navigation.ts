import { shell } from 'electron';
import type { BrowserWindow } from 'electron';

/**
 * App content is served from the app origin or, in development, from the
 * dev server origin.
 */
export function createTrustedUrlMatcher(
  appOrigin: string,
  devServerUrl: string | undefined,
): (url: string) => boolean {
  const devServerOrigin = devServerUrl ? originOf(devServerUrl) : null;
  return url =>
    url === appOrigin ||
    url.startsWith(`${appOrigin}/`) ||
    (devServerOrigin !== null && originOf(url) === devServerOrigin);
}

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

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
