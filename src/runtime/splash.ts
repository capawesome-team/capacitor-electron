import { BrowserWindow } from 'electron';
import { readFileSync } from 'fs';
import { extname, join } from 'path';

import type { ElectronSplashScreenOptions } from '../config/index';

const DEFAULT_WIDTH = 400;
const DEFAULT_HEIGHT = 300;
const DEFAULT_BACKGROUND_COLOR = '#ffffff';
const DEFAULT_MINIMUM_DURATION_MS = 0;

const DEFAULT_CANDIDATES = [
  join('assets', 'splash.html'),
  join('assets', 'splash.png'),
];

const IMAGE_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

export type SplashScreenType = 'html' | 'image';

export interface ResolvedSplashScreen {
  type: SplashScreenType;
  filePath: string;
  ext: string;
  width: number;
  height: number;
  backgroundColor: string;
  minimumDurationMs: number;
}

export interface SplashScreenController {
  window: BrowserWindow;
  /**
   * Timestamp (`Date.now()`) at which the splash screen became visible.
   */
  shownAt: number;
  /**
   * Closes the splash screen. Safe to call multiple times.
   */
  close(): void;
}

/**
 * Classifies a splash screen file by extension. Throws for unknown
 * extensions so misconfigurations fail loudly at boot.
 */
export function classifySplashType(ext: string): SplashScreenType {
  if (ext === '.html') {
    return 'html';
  }
  if (ext in IMAGE_MIME_TYPES) {
    return 'image';
  }
  throw new Error(
    `[capacitor-electron] Unsupported splash screen file type "${ext}". Use an .html file or an image (${Object.keys(
      IMAGE_MIME_TYPES,
    ).join(', ')}).`,
  );
}

/**
 * Resolves the splash screen configuration into a concrete descriptor, or
 * `null` when no splash screen should be shown.
 *
 * Resolution semantics:
 * - `enabled: false` disables the splash screen entirely.
 * - When `path` is set it is used; otherwise `assets/splash.html` then
 *   `assets/splash.png` are tried (relative to `appPath`).
 * - When nothing resolves and `enabled: true` was set explicitly, a config
 *   error is thrown; when `enabled` is unset, `null` is returned silently.
 * - Unknown file extensions always throw.
 */
export function resolveSplashScreen(
  options: ElectronSplashScreenOptions | undefined,
  appPath: string,
  fileExists: (filePath: string) => boolean,
): ResolvedSplashScreen | null {
  const config = options ?? {};
  if (config.enabled === false) {
    return null;
  }
  const candidates =
    config.path !== undefined ? [config.path] : DEFAULT_CANDIDATES;
  for (const candidate of candidates) {
    const filePath = join(appPath, candidate);
    const ext = extname(candidate).toLowerCase();
    // Validate the extension eagerly so a mistyped `path` fails loudly even
    // before the file check.
    const type = classifySplashType(ext);
    if (fileExists(filePath)) {
      return {
        type,
        filePath,
        ext,
        width: config.width ?? DEFAULT_WIDTH,
        height: config.height ?? DEFAULT_HEIGHT,
        backgroundColor: config.backgroundColor ?? DEFAULT_BACKGROUND_COLOR,
        minimumDurationMs:
          config.minimumDurationMs ?? DEFAULT_MINIMUM_DURATION_MS,
      };
    }
  }
  if (config.enabled === true) {
    throw new Error(
      `[capacitor-electron] Splash screen is enabled but no splash file was found (looked for ${candidates
        .map(candidate => join(appPath, candidate))
        .join(', ')}).`,
    );
  }
  return null;
}

/**
 * Builds a `data:` image URI for an embedded splash image.
 */
export function buildImageDataUri(ext: string, base64Content: string): string {
  const mimeType = IMAGE_MIME_TYPES[ext];
  if (mimeType === undefined) {
    throw new Error(
      `[capacitor-electron] Unsupported splash screen image type "${ext}".`,
    );
  }
  return `data:${mimeType};base64,${base64Content}`;
}

/**
 * Builds a minimal HTML document that centers a splash image on a solid
 * background, without scrollbars.
 */
export function buildImageWrapperHtml(
  imageDataUri: string,
  backgroundColor: string,
): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html,
      body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
      }
      body {
        background: ${backgroundColor};
        display: flex;
        align-items: center;
        justify-content: center;
      }
      img {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
    </style>
  </head>
  <body>
    <img src="${imageDataUri}" alt="" />
  </body>
</html>`;
}

/**
 * Computes how much longer the splash screen must remain visible to honor
 * `minimumDurationMs`, given when it was shown and the current time.
 */
export function computeRemainingDelay(
  shownAt: number,
  minimumDurationMs: number,
  now: number,
): number {
  if (minimumDurationMs <= 0) {
    return 0;
  }
  return Math.max(0, minimumDurationMs - (now - shownAt));
}

/**
 * Creates and shows the splash screen window. The window is intentionally
 * kept outside the plugin bridge/trust model: no preload, no custom scheme,
 * and navigation is blocked.
 */
export function createSplashScreen(
  descriptor: ResolvedSplashScreen,
): SplashScreenController {
  const window = new BrowserWindow({
    width: descriptor.width,
    height: descriptor.height,
    backgroundColor: descriptor.backgroundColor,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    center: true,
    alwaysOnTop: false,
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // `will-navigate` only fires for page-initiated navigation, never for the
  // programmatic `loadFile`/`loadURL` below, so blocking unconditionally is
  // safe and pins the splash to its initial document.
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (descriptor.type === 'html') {
    void window.loadFile(descriptor.filePath).catch(() => {
      // Splash rendering is best-effort; the background color still covers
      // the boot gap.
    });
  } else {
    const base64Content = readFileSync(descriptor.filePath).toString('base64');
    const imageDataUri = buildImageDataUri(descriptor.ext, base64Content);
    const html = buildImageWrapperHtml(
      imageDataUri,
      descriptor.backgroundColor,
    );
    const htmlDataUrl = `data:text/html;base64,${Buffer.from(html).toString(
      'base64',
    )}`;
    void window.loadURL(htmlDataUrl).catch(() => {
      // Best-effort; see above.
    });
  }

  window.show();

  let closed = false;
  return {
    window,
    shownAt: Date.now(),
    close: () => {
      if (closed || window.isDestroyed()) {
        return;
      }
      closed = true;
      window.close();
    },
  };
}
