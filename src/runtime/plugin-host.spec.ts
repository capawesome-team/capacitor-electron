import { describe, expect, it, vi } from 'vitest';

import type {
  BundlesService,
  ElectronPluginContext,
  ElectronPluginMetadata,
} from '../plugin/index';
import { defineElectronPlugin } from '../plugin/index';
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

  it('rejects the reserved "initialize" lifecycle hook in methods', () => {
    expect(() =>
      validateDeclaredMethods(
        'Sqlite',
        ['open', 'initialize'],
        {
          ...instance,
          async initialize(): Promise<void> {
            // noop
          },
        },
        'pkg',
      ),
    ).toThrow(
      /lists "initialize" in `methods`, but `initialize` is a reserved lifecycle hook/,
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

describe('PluginHost initialize lifecycle hook', () => {
  it('resolves start() when a plugin has no initialize hook', async () => {
    const host = createHostWithPlugin(
      { name: 'NoHook', methods: [] },
      class {},
    );

    await expect(host.start()).resolves.toBeUndefined();
  });

  it('awaits a synchronous initialize hook before start() resolves', async () => {
    let initialized = false;
    const host = createHostWithPlugin(
      { name: 'Sync', methods: [] },
      class {
        initialize(): void {
          initialized = true;
        }
      },
    );

    await host.start();

    expect(initialized).toBe(true);
  });

  it('awaits an async initialize hook before start() resolves', async () => {
    let resolveInit!: () => void;
    const gate = new Promise<void>(resolve => {
      resolveInit = resolve;
    });
    let initialized = false;
    const host = createHostWithPlugin(
      { name: 'Async', methods: [] },
      class {
        async initialize(): Promise<void> {
          await gate;
          initialized = true;
        }
      },
    );

    let started = false;
    const startPromise = host.start().then(() => {
      started = true;
    });

    await flushMicrotasks();
    expect(started).toBe(false);
    expect(initialized).toBe(false);

    resolveInit();
    await startPromise;
    expect(started).toBe(true);
    expect(initialized).toBe(true);
  });

  it('provides the plugin context so initialize can repoint the active bundle before start() resolves', async () => {
    const bundles = createBundlesStub();
    const host = createHostWithPlugin(
      { name: 'Repoint', methods: [] },
      class {
        constructor(private readonly context: ElectronPluginContext) {}
        async initialize(): Promise<void> {
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

  it('fails boot loudly when initialize rejects', async () => {
    const host = createHostWithPlugin(
      { name: 'Rejecting', methods: [] },
      class {
        async initialize(): Promise<void> {
          throw new Error('boom');
        }
      },
    );

    await expect(host.start()).rejects.toThrow(
      /Plugin "Rejecting" failed to initialize: boom/,
    );
  });

  it('runs the hook when initialize is not listed in methods', async () => {
    let initialized = false;
    const host = createHostWithPlugin(
      { name: 'Unlisted', methods: [] },
      class {
        async initialize(): Promise<void> {
          initialized = true;
        }
      },
    );

    await expect(host.start()).resolves.toBeUndefined();
    expect(initialized).toBe(true);
  });

  it('rejects boot when initialize is listed in methods', async () => {
    let initialized = false;
    const host = createHostWithPlugin(
      { name: 'Listed', methods: ['initialize'] },
      class {
        async initialize(): Promise<void> {
          initialized = true;
        }
      },
    );

    await expect(host.start()).rejects.toThrow(
      /lists "initialize" in `methods`, but `initialize` is a reserved lifecycle hook/,
    );
    expect(initialized).toBe(false);
  });
});
