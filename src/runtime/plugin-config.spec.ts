import { describe, expect, it } from 'vitest';

import type { CapacitorAppConfig } from '../shared/definitions';

import { mergePluginConfig } from './plugin-config';

describe('mergePluginConfig', () => {
  it('lets a platform override win per key', () => {
    const capacitorConfig: CapacitorAppConfig = {
      plugins: { LiveUpdate: { defaultChannel: 'production', enabled: true } },
    };

    const merged = mergePluginConfig(capacitorConfig, {
      LiveUpdate: { defaultChannel: 'production-1.2.3' },
    });

    expect(merged.plugins).toEqual({
      LiveUpdate: { defaultChannel: 'production-1.2.3', enabled: true },
    });
  });

  it('keeps static keys that are not overridden', () => {
    const capacitorConfig: CapacitorAppConfig = {
      plugins: { LiveUpdate: { defaultChannel: 'production', enabled: true } },
    };

    const merged = mergePluginConfig(capacitorConfig, {
      LiveUpdate: { readyTimeout: 10000 },
    });

    expect(merged.plugins).toEqual({
      LiveUpdate: {
        defaultChannel: 'production',
        enabled: true,
        readyTimeout: 10000,
      },
    });
  });

  it('passes through a plugin present only in the Capacitor config', () => {
    const capacitorConfig: CapacitorAppConfig = {
      plugins: { StaticOnly: { foo: 'bar' } },
    };

    const merged = mergePluginConfig(capacitorConfig, {
      ElectronOnly: { baz: 'qux' },
    });

    expect(merged.plugins).toEqual({
      StaticOnly: { foo: 'bar' },
      ElectronOnly: { baz: 'qux' },
    });
  });

  it('adds a plugin present only in the Electron config', () => {
    const capacitorConfig: CapacitorAppConfig = { plugins: {} };

    const merged = mergePluginConfig(capacitorConfig, {
      ElectronOnly: { baz: 'qux' },
    });

    expect(merged.plugins).toEqual({ ElectronOnly: { baz: 'qux' } });
  });

  it('merges into a config that has no plugins section', () => {
    const capacitorConfig: CapacitorAppConfig = { appId: 'com.example.app' };

    const merged = mergePluginConfig(capacitorConfig, {
      LiveUpdate: { defaultChannel: 'production-1.2.3' },
    });

    expect(merged).toEqual({
      appId: 'com.example.app',
      plugins: { LiveUpdate: { defaultChannel: 'production-1.2.3' } },
    });
  });

  it('passes everything outside plugins through untouched', () => {
    const capacitorConfig: CapacitorAppConfig = {
      appId: 'com.example.app',
      appName: 'Example',
      server: { url: 'http://localhost:5173' },
      plugins: { LiveUpdate: { defaultChannel: 'production' } },
    };

    const merged = mergePluginConfig(capacitorConfig, {
      LiveUpdate: { defaultChannel: 'production-1.2.3' },
    });

    expect(merged.appId).toBe('com.example.app');
    expect(merged.appName).toBe('Example');
    expect(merged.server).toEqual({ url: 'http://localhost:5173' });
  });

  it('returns the original config unchanged when there are no overrides', () => {
    const capacitorConfig: CapacitorAppConfig = {
      plugins: { LiveUpdate: { defaultChannel: 'production' } },
    };

    expect(mergePluginConfig(capacitorConfig, undefined)).toBe(capacitorConfig);
  });

  it('does not mutate the inputs', () => {
    const capacitorConfig: CapacitorAppConfig = {
      plugins: { LiveUpdate: { defaultChannel: 'production', enabled: true } },
    };
    const overrides = { LiveUpdate: { defaultChannel: 'production-1.2.3' } };

    mergePluginConfig(capacitorConfig, overrides);

    expect(capacitorConfig.plugins).toEqual({
      LiveUpdate: { defaultChannel: 'production', enabled: true },
    });
    expect(overrides).toEqual({
      LiveUpdate: { defaultChannel: 'production-1.2.3' },
    });
  });
});
