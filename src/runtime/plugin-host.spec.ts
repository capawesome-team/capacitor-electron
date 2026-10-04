import { ipcMain } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import type {
  BundlesService,
  ElectronPluginContext,
  ElectronPluginMetadata,
} from '../plugin/index';
import { ElectronPlugin, defineElectronPlugin } from '../plugin/index';
import type { PluginManifest } from '../shared/definitions';
import {
  BOOTSTRAP_CHANNEL,
  EVENT_CHANNEL,
  addListenerChannel,
} from '../shared/ipc';

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
  setActiveBundle: vi.fn(),
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
          this.context.services.bundles.setActiveBundle('/bundle');
        }
      },
      bundles,
    );

    await host.start();

    expect(bundles.setActiveBundle).toHaveBeenCalledWith('/bundle');
  });

  it('awaits an overridden async load() on an ElectronPlugin subclass, passing the context via the base constructor', async () => {
    const bundles = createBundlesStub();
    let loaded = false;
    const host = createHostWithPlugin(
      { name: 'Subclass', methods: [] },
      class extends ElectronPlugin {
        async load(): Promise<void> {
          this.context.services.bundles.setActiveBundle('/bundle');
          loaded = true;
        }
      },
      bundles,
    );

    await host.start();

    expect(loaded).toBe(true);
    expect(bundles.setActiveBundle).toHaveBeenCalledWith('/bundle');
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

describe('PluginHost event subscriptions', () => {
  const createPage = () => {
    const mainFrame = { url: 'capacitor-electron://localhost/' };
    const sender = {
      id: 1,
      mainFrame,
      isDestroyed: () => false,
      once: vi.fn(),
      send: vi.fn(),
    };
    return { sender, senderFrame: mainFrame, returnValue: undefined };
  };

  const startHost = async () => {
    const host = createHostWithPlugin(
      { name: 'Events', methods: [] },
      class {},
    );
    vi.mocked(ipcMain.on).mockClear();
    vi.mocked(ipcMain.handle).mockClear();
    await host.start();
    const bootstrap = vi
      .mocked(ipcMain.on)
      .mock.calls.find(([channel]) => channel === BOOTSTRAP_CHANNEL)?.[1];
    const addListener = vi
      .mocked(ipcMain.handle)
      .mock.calls.find(
        ([channel]) => channel === addListenerChannel('Events'),
      )?.[1];
    return {
      host,
      loadPage: (page: ReturnType<typeof createPage>) =>
        (bootstrap as (event: unknown) => void)(page),
      addListener: (
        page: ReturnType<typeof createPage>,
        listenerId: number,
        eventName: string,
      ) =>
        (
          addListener as (
            event: unknown,
            listenerId: number,
            eventName: string,
          ) => unknown
        )(page, listenerId, eventName),
    };
  };

  it('delivers events with the listener id they were registered with', async () => {
    const { host, loadPage, addListener } = await startHost();
    const page = createPage();
    loadPage(page);
    addListener(page, 7, 'changed');

    host.notifyListeners('Events', 'changed', { value: 1 });

    expect(page.sender.send).toHaveBeenCalledWith(EVENT_CHANNEL, {
      pluginName: 'Events',
      listenerId: 7,
      data: { value: 1 },
    });
  });

  it('drops the subscriptions of the previous page load on reload', async () => {
    const { host, loadPage, addListener } = await startHost();
    const page = createPage();
    loadPage(page);
    addListener(page, 1, 'changed');

    loadPage(page);
    host.notifyListeners('Events', 'changed', 'stale');

    expect(page.sender.send).not.toHaveBeenCalled();
  });

  it('retains an event emitted after a reload until the new page subscribes', async () => {
    const { host, loadPage, addListener } = await startHost();
    const page = createPage();
    loadPage(page);
    addListener(page, 1, 'appUrlOpen');

    loadPage(page);
    host.notifyListeners('Events', 'appUrlOpen', 'url', { retain: true });
    addListener(page, 2, 'appUrlOpen');

    expect(page.sender.send).toHaveBeenCalledTimes(1);
    expect(page.sender.send).toHaveBeenCalledWith(EVENT_CHANNEL, {
      pluginName: 'Events',
      listenerId: 2,
      data: 'url',
    });
  });

  it('retains an event emitted right after the platform drops a page', async () => {
    const { host, loadPage, addListener } = await startHost();
    const page = createPage();
    loadPage(page);
    addListener(page, 1, 'reloaded');

    host.dropSubscriptions(page.sender.id);
    host.notifyListeners('Events', 'reloaded', {}, { retain: true });
    loadPage(page);
    addListener(page, 1, 'reloaded');

    expect(page.sender.send).toHaveBeenCalledExactlyOnceWith(EVENT_CHANNEL, {
      pluginName: 'Events',
      listenerId: 1,
      data: {},
    });
  });
});
