import { join, sep } from 'path';
import { describe, expect, it, vi } from 'vitest';

import {
  buildImageDataUri,
  buildImageWrapperHtml,
  classifySplashType,
  computeRemainingDelay,
  resolveSplashScreen,
} from './splash';

vi.mock('electron', () => ({ BrowserWindow: vi.fn() }));

const appPath = join(sep, 'srv', 'app');
const htmlPath = join(appPath, 'assets', 'splash.html');
const imagePath = join(appPath, 'assets', 'splash.png');

const existsOnly =
  (...existing: string[]) =>
  (filePath: string): boolean =>
    existing.includes(filePath);

describe('resolveSplashScreen', () => {
  it('returns null when disabled explicitly, even if a file exists', () => {
    expect(
      resolveSplashScreen({ enabled: false }, appPath, existsOnly(htmlPath)),
    ).toBeNull();
  });

  it('prefers assets/splash.html over assets/splash.png', () => {
    const resolved = resolveSplashScreen(
      undefined,
      appPath,
      existsOnly(htmlPath, imagePath),
    );
    expect(resolved).toMatchObject({ type: 'html', filePath: htmlPath });
  });

  it('falls back to assets/splash.png when assets/splash.html is missing', () => {
    const resolved = resolveSplashScreen(
      undefined,
      appPath,
      existsOnly(imagePath),
    );
    expect(resolved).toMatchObject({ type: 'image', filePath: imagePath });
  });

  it('returns null silently when enabled is unset and nothing resolves', () => {
    expect(resolveSplashScreen(undefined, appPath, existsOnly())).toBeNull();
  });

  it('throws when enabled is true but nothing resolves', () => {
    expect(() =>
      resolveSplashScreen({ enabled: true }, appPath, existsOnly()),
    ).toThrow(/no splash file was found/);
  });

  it('resolves an explicit path relative to the app directory', () => {
    const custom = join(appPath, 'branding', 'intro.gif');
    const resolved = resolveSplashScreen(
      { path: join('branding', 'intro.gif') },
      appPath,
      existsOnly(custom),
    );
    expect(resolved).toMatchObject({ type: 'image', filePath: custom });
  });

  it('throws for an unknown file extension', () => {
    expect(() =>
      resolveSplashScreen(
        { path: 'splash.txt' },
        appPath,
        existsOnly(join(appPath, 'splash.txt')),
      ),
    ).toThrow(/Unsupported splash screen file type/);
  });

  it('applies defaults for dimensions, color and minimum duration', () => {
    const resolved = resolveSplashScreen(
      undefined,
      appPath,
      existsOnly(htmlPath),
    );
    expect(resolved).toMatchObject({
      width: 400,
      height: 300,
      backgroundColor: '#ffffff',
      minimumDurationMs: 0,
    });
  });

  it('carries through configured dimensions, color and minimum duration', () => {
    const resolved = resolveSplashScreen(
      {
        width: 600,
        height: 400,
        backgroundColor: '#000000',
        minimumDurationMs: 1500,
      },
      appPath,
      existsOnly(htmlPath),
    );
    expect(resolved).toMatchObject({
      width: 600,
      height: 400,
      backgroundColor: '#000000',
      minimumDurationMs: 1500,
    });
  });
});

describe('classifySplashType', () => {
  it('classifies .html as html', () => {
    expect(classifySplashType('.html')).toBe('html');
  });

  it('classifies image extensions as image', () => {
    for (const ext of ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']) {
      expect(classifySplashType(ext)).toBe('image');
    }
  });

  it('throws for unknown extensions', () => {
    expect(() => classifySplashType('.txt')).toThrow(
      /Unsupported splash screen file type/,
    );
  });
});

describe('buildImageDataUri', () => {
  it('builds a data URI with the matching mime type', () => {
    expect(buildImageDataUri('.png', 'QUJD')).toBe(
      'data:image/png;base64,QUJD',
    );
    expect(buildImageDataUri('.svg', 'QUJD')).toBe(
      'data:image/svg+xml;base64,QUJD',
    );
  });

  it('throws for unsupported extensions', () => {
    expect(() => buildImageDataUri('.txt', 'QUJD')).toThrow(
      /Unsupported splash screen image type/,
    );
  });
});

describe('buildImageWrapperHtml', () => {
  it('embeds the image and background color, and hides overflow', () => {
    const html = buildImageWrapperHtml('data:image/png;base64,QUJD', '#123456');
    expect(html).toContain('src="data:image/png;base64,QUJD"');
    expect(html).toContain('background: #123456');
    expect(html).toContain('overflow: hidden');
    expect(html).toContain('object-fit: contain');
  });
});

describe('computeRemainingDelay', () => {
  it('returns 0 when no minimum duration is configured', () => {
    expect(computeRemainingDelay(1000, 0, 1000)).toBe(0);
  });

  it('returns 0 once the minimum duration has elapsed', () => {
    expect(computeRemainingDelay(1000, 500, 2000)).toBe(0);
  });

  it('returns the remaining time when the minimum duration has not elapsed', () => {
    expect(computeRemainingDelay(1000, 2000, 1500)).toBe(1500);
  });
});
