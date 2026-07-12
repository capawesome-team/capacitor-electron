import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import type { CliContext } from './context';
import { generatePluginManifest } from './update';

const writeJson = (filePath: string, value: unknown): void => {
  mkdirSync(join(filePath, '..'), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value));
};

const setUpApp = (): CliContext => {
  const rootDir = mkdtempSync(join(tmpdir(), 'capacitor-electron-test-'));
  writeJson(join(rootDir, 'package.json'), {
    dependencies: {
      'with-electron': '1.0.0',
      'without-electron': '1.0.0',
      'with-missing-dist': '1.0.0',
    },
  });
  writeJson(join(rootDir, 'node_modules', 'with-electron', 'package.json'), {
    name: 'with-electron',
    capacitor: { electron: { src: 'electron' } },
  });
  writeFileSync(
    (() => {
      const dist = join(
        rootDir,
        'node_modules',
        'with-electron',
        'electron',
        'dist',
      );
      mkdirSync(dist, { recursive: true });
      return join(dist, 'plugin.mjs');
    })(),
    'export class X {}',
  );
  writeJson(join(rootDir, 'node_modules', 'without-electron', 'package.json'), {
    name: 'without-electron',
    capacitor: { ios: { src: 'ios' } },
  });
  writeJson(
    join(rootDir, 'node_modules', 'with-missing-dist', 'package.json'),
    { name: 'with-missing-dist', capacitor: { electron: { src: 'electron' } } },
  );
  return {
    rootDir,
    webDir: join(rootDir, 'www'),
    config: {},
    platformDir: join(rootDir, 'electron'),
    generatedDir: join(rootDir, 'electron', 'generated'),
    appDir: join(rootDir, 'electron', 'app'),
  };
};

describe('generatePluginManifest', () => {
  it('includes only dependencies with an existing ES module implementation', async () => {
    const context = setUpApp();

    const manifest = await generatePluginManifest(context);

    expect(manifest.plugins).toEqual([
      {
        packageName: 'with-electron',
        specifier: 'with-electron/electron/dist/plugin.mjs',
      },
    ]);
    expect(manifest.platformVersion).toMatch(/^\d+\.\d+\.\d+/);
  });
});
