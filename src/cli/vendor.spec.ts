import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { vendorCommand } from './vendor';

const writeJson = (filePath: string, value: unknown): void => {
  mkdirSync(join(filePath, '..'), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value));
};

const setUpApp = (): string => {
  const rootDir = mkdtempSync(join(tmpdir(), 'capacitor-electron-vendor-'));
  writeJson(join(rootDir, 'package.json'), {
    dependencies: { 'my-plugin': '1.0.0' },
  });
  // plugin with an electron implementation, a prod dep, and a peer dep
  const pluginDir = join(rootDir, 'node_modules', 'my-plugin');
  writeJson(join(pluginDir, 'package.json'), {
    name: 'my-plugin',
    version: '1.0.0',
    capacitor: { electron: { src: 'electron' } },
    dependencies: { 'some-dep': '1.0.0' },
    peerDependencies: { '@capacitor/core': '>=8.0.0' },
    optionalDependencies: {
      'installed-optional': '1.0.0',
      'missing-optional': '1.0.0',
    },
  });
  mkdirSync(join(pluginDir, 'electron', 'dist'), { recursive: true });
  writeFileSync(join(pluginDir, 'electron', 'dist', 'plugin.mjs'), '// impl');
  mkdirSync(join(pluginDir, 'android'), { recursive: true });
  writeFileSync(join(pluginDir, 'android', 'bloat.txt'), 'not needed');
  // prod dep with its own nested node_modules (must not be copied verbatim)
  const depDir = join(rootDir, 'node_modules', 'some-dep');
  writeJson(join(depDir, 'package.json'), {
    name: 'some-dep',
    version: '1.0.0',
  });
  writeFileSync(join(depDir, 'index.js'), 'module.exports = 1;');
  writeJson(join(depDir, 'node_modules', 'nested', 'package.json'), {
    name: 'nested',
    version: '9.9.9',
  });
  // peer dep resolvable from the root
  writeJson(
    join(rootDir, 'node_modules', '@capacitor', 'core', 'package.json'),
    {
      name: '@capacitor/core',
      version: '8.0.0',
    },
  );
  // optional dep that is installed ('missing-optional' deliberately is not)
  writeJson(
    join(rootDir, 'node_modules', 'installed-optional', 'package.json'),
    {
      name: 'installed-optional',
      version: '1.0.0',
    },
  );
  // synced platform dir with manifest
  const electronDir = join(rootDir, 'electron');
  writeJson(join(electronDir, 'generated', 'plugin-manifest.json'), {
    platformVersion: '0.0.1',
    plugins: [
      {
        packageName: 'my-plugin',
        specifier: 'my-plugin/electron/dist/plugin.mjs',
      },
    ],
  });
  return rootDir;
};

const originalCwd = process.cwd();
afterEach(() => process.chdir(originalCwd));

describe('vendorCommand', () => {
  it('vendors the runtime, plugins, and the dependency closure', () => {
    const rootDir = setUpApp();
    process.chdir(join(rootDir, 'electron'));

    vendorCommand();

    const vendorRoot = join(rootDir, 'electron', 'vendor', 'node_modules');
    expect(
      existsSync(
        join(vendorRoot, '@capawesome/capacitor-electron/package.json'),
      ),
    ).toBe(true);
    expect(
      existsSync(join(vendorRoot, 'my-plugin/electron/dist/plugin.mjs')),
    ).toBe(true);
    // plugin subset: no android bloat
    expect(existsSync(join(vendorRoot, 'my-plugin/android'))).toBe(false);
    // prod dep copied with its files, without nested node_modules
    expect(existsSync(join(vendorRoot, 'some-dep/index.js'))).toBe(true);
    expect(existsSync(join(vendorRoot, 'some-dep/node_modules'))).toBe(false);
    // peer dep vendored from the root
    expect(existsSync(join(vendorRoot, '@capacitor/core/package.json'))).toBe(
      true,
    );
    // installed optional dep vendored; missing optional dep skipped silently
    expect(
      existsSync(join(vendorRoot, 'installed-optional/package.json')),
    ).toBe(true);
    expect(existsSync(join(vendorRoot, 'missing-optional'))).toBe(false);
  });
});
