import { describe, expect, it, vi } from 'vitest';

import type {
  BundlesService,
  ElectronPluginContext,
  ElectronPluginMetadata,
} from '../plugin/index';
import { ElectronPlugin, defineElectronPlugin } from '../plugin/index';
import type { PluginManifest } from '../shared/definitions';

import { PluginHost, validateDeclaredMethods } from './plugin-host';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn(), on: vi.fn() } }));

const instance = {
  async open(): Promise<void> {
    // noop
  },
  async query(): Promise<void> {
    // noop
  },
};

describe('validateDeclaredMethods', () => {
  it('accepts declared methods that exist on the instance', () => {
    expect(() =>
      validateDeclaredMethods('Sqlite', ['open', 'query'], instance, 'pkg'),
    ).not.toThrow();
  });

  it('rejects declared methods that are not implemented', () => {
    expect(() =>
      validateDeclaredMethods('Sqlite', ['open', 'missing'], instance, 'pkg'),
    ).toThrow(/declares method "missing" but does not implement it/);
  });

  it('rejects the reserved "load" lifecycle hook in methods', () => {
    expect(() =>
      validateDeclaredMethods(
        'Sqlite',
        ['open', 'load'],
        {
          ...instance,
          async load(): Promise<void> {
            // noop
          },
        },
        'pkg',
      ),
    ).toThrow(
      /lists "load" in `methods`, but `load` is a reserved lifecycle hook/,
    );
  });
});

const flushMicrotasks = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const createBundlesStub = (): BundlesService => ({
  getActiveBundlePath: vi.fn(() => null),
  setActiveBundle: vi.fn(async () => {
    // noop
  }),
  notifyBootReady: vi.fn(),
});

const createHostWithPlugin = (
  metadata: ElectronPluginMetadata,
  pluginClass: new (context: ElectronPluginContext) => unknown,
  bundles: BundlesService = createBundlesStub(),
): PluginHost => {
  const packageName = 'pkg';
  const manifest: PluginManifest = {
    platformVersion: '0.0.0',
    plugins: [{ packageName, specifier: './plugin.mjs' }],
  };
  return new PluginHost({
    platformName: 'electron',
    capacitorConfig: {},
    services: { bundles },
    manifest,
    loadRegistrar: async () => ({
      [packageName]: async () => ({
        Plugin: defineElectronPlugin(metadata, pluginClass),
      }),
    }),
    isTrustedFrameUrl: () => true,
  });
};

describe('PluginHost load lifecycle hook', () => {
  it('resolves start() when a plugin has no load hook', async () => {
    const host = createHostWithPlugin(
      { name: 'NoHook', methods: [] },
      class {},
    );

    await expect(host.start()).resolves.toBeUndefined();
  });

  it('awaits a synchronous load hook before start() resolves', async () => {
    let loaded = false;
    const host = createHostWithPlugin(
      { name: 'Sync', methods: [] },
      class {
        load(): void {
          loaded = true;
        }
      },
    );

    await host.start();

    expect(loaded).toBe(true);
  });

  it('awaits an async load hook before start() resolves', async () => {
    let resolveLoad!: () => void;
    const gate = new Promise<void>(resolve => {
      resolveLoad = resolve;
    });
    let loaded = false;
    const host = createHostWithPlugin(
      { name: 'Async', methods: [] },
      class {
        async load(): Promise<void> {
          await gate;
          loaded = true;
        }
      },
    );

    let started = false;
    const startPromise = host.start().then(() => {
      started = true;
    });

    await flushMicrotasks();
    expect(started).toBe(false);
    expect(loaded).toBe(false);

    resolveLoad();
    await startPromise;
    expect(started).toBe(true);
    expect(loaded).toBe(true);
  });

  it('provides the plugin context so load can repoint the active bundle before start() resolves', async () => {
    const bundles = createBundlesStub();
    const host = createHostWithPlugin(
      { name: 'Repoint', methods: [] },
      class {
        constructor(private readonly context: ElectronPluginContext) {}
        async load(): Promise<void> {
          await this.context.services.bundles.setActiveBundle('/bundle', {
            bootWatchdog: false,
          });
        }
      },
      bundles,
    );

    await host.start();

    expect(bundles.setActiveBundle).toHaveBeenCalledWith('/bundle', {
      bootWatchdog: false,
    });
  });

  it('awaits an overridden async load() on an ElectronPlugin subclass, passing the context via the base constructor', async () => {
    const bundles = createBundlesStub();
    let loaded = false;
    const host = createHostWithPlugin(
      { name: 'Subclass', methods: [] },
      class extends ElectronPlugin {
        async load(): Promise<void> {
          await this.context.services.bundles.setActiveBundle('/bundle', {
            bootWatchdog: false,
          });
          loaded = true;
        }
      },
      bundles,
    );

    await host.start();

    expect(loaded).toBe(true);
    expect(bundles.setActiveBundle).toHaveBeenCalledWith('/bundle', {
      bootWatchdog: false,
    });
  });

  it('resolves start() with the base ElectronPlugin no-op load() when not overridden', async () => {
    const host = createHostWithPlugin(
      { name: 'BaseNoop', methods: [] },
      class extends ElectronPlugin {},
    );

    await expect(host.start()).resolves.toBeUndefined();
  });

  it('fails boot loudly when load rejects', async () => {
    const host = createHostWithPlugin(
      { name: 'Rejecting', methods: [] },
      class {
        async load(): Promise<void> {
          throw new Error('boom');
        }
      },
    );

    await expect(host.start()).rejects.toThrow(
      /Plugin "Rejecting" failed to load: boom/,
    );
  });

  it('runs the structural load() hook of a marker-only plugin', async () => {
    let loaded = false;
    const host = createHostWithPlugin(
      { name: 'MarkerOnly', methods: [] },
      class {
        async load(): Promise<void> {
          loaded = true;
        }
      },
    );

    await expect(host.start()).resolves.toBeUndefined();
    expect(loaded).toBe(true);
  });

  it('rejects boot when load is listed in methods', async () => {
    let loaded = false;
    const host = createHostWithPlugin(
      { name: 'Listed', methods: ['load'] },
      class {
        async load(): Promise<void> {
          loaded = true;
        }
      },
    );

    await expect(host.start()).rejects.toThrow(
      /lists "load" in `methods`, but `load` is a reserved lifecycle hook/,
    );
    expect(loaded).toBe(false);
  });
});
