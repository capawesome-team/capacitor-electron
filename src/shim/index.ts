// Main-world shim. Injected by the preload via `webFrame.executeJavaScript`
// before any page script runs. Must not use imports/exports (it is compiled
// as a standalone script) — the types below are file-local declarations.
//
// Builds, from the transport exposed by the preload via the context bridge:
//   1. `window.CapacitorCustomPlatform` with plugin-name-keyed proxies.
//   2. A `window.Capacitor` pre-seed with `PluginHeaders`, so
//      `registerPlugin` routes every hosted plugin through the native path
//      without any per-plugin wiring. `@capacitor/core` merges itself into
//      this object when it loads.

interface ShimPluginDescriptor {
  pluginName: string;
  methods: string[];
}

interface ShimCallResult {
  data?: unknown;
  error?: { message: string; code?: string };
}

interface ShimTransport {
  getBootstrap(): { platformName: string; plugins: ShimPluginDescriptor[] };
  invoke(
    pluginName: string,
    methodName: string,
    args: unknown[],
  ): Promise<ShimCallResult>;
  addListener(
    pluginName: string,
    eventName: string,
    callback: (data: unknown) => void,
  ): number;
  removeListener(pluginName: string, listenerId: number): Promise<void>;
  removeAllListeners(pluginName: string, eventName?: string): Promise<void>;
}

(() => {
  const globalWindow = window as unknown as Record<string, unknown>;
  const transport = globalWindow.__capacitorElectronBridge as
    | ShimTransport
    | undefined;
  if (!transport || globalWindow.CapacitorCustomPlatform) {
    return;
  }
  const bootstrap = transport.getBootstrap();

  const toError = (bridgeError: { message: string; code?: string }): Error => {
    const error = new Error(bridgeError.message) as Error & { code?: string };
    if (bridgeError.code !== undefined) {
      error.code = bridgeError.code;
    }
    return error;
  };

  const unwrap = async (
    resultPromise: Promise<ShimCallResult>,
  ): Promise<unknown> => {
    const result = await resultPromise;
    if (result.error) {
      throw toError(result.error);
    }
    return result.data;
  };

  interface ListenerHandle {
    listenerId: number;
    remove: () => Promise<void>;
  }

  const buildPluginProxy = (
    descriptor: ShimPluginDescriptor,
  ): Record<string, unknown> => {
    const pluginName = descriptor.pluginName;
    const proxy: Record<string, unknown> = {};
    for (const methodName of descriptor.methods) {
      proxy[methodName] = (...args: unknown[]) =>
        unwrap(transport.invoke(pluginName, methodName, args));
    }
    const removeListener = (
      listenerIdOrHandle: number | ListenerHandle,
    ): Promise<void> => {
      const listenerId =
        typeof listenerIdOrHandle === 'number'
          ? listenerIdOrHandle
          : listenerIdOrHandle.listenerId;
      return transport.removeListener(pluginName, listenerId);
    };
    proxy.addListener = (
      eventName: string,
      callback: (data: unknown) => void,
    ) => {
      const listenerId = transport.addListener(pluginName, eventName, callback);
      const handle: ListenerHandle = {
        listenerId,
        remove: () => removeListener(listenerId),
      };
      // Returned synchronously AND awaitable to a `PluginListenerHandle`
      // (Capacitor contract).
      return {
        ...handle,
        then: (
          onFulfilled?: (value: ListenerHandle) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) => Promise.resolve(handle).then(onFulfilled, onRejected),
      };
    };
    proxy.removeListener = removeListener;
    proxy.removeAllListeners = (eventName?: string) =>
      transport.removeAllListeners(pluginName, eventName);
    return proxy;
  };

  const plugins: Record<string, Record<string, unknown>> = {};
  for (const descriptor of bootstrap.plugins) {
    plugins[descriptor.pluginName] = buildPluginProxy(descriptor);
  }
  globalWindow.CapacitorCustomPlatform = {
    name: bootstrap.platformName,
    plugins,
  };

  const capacitor = (globalWindow.Capacitor ?? {}) as Record<
    string,
    unknown
  > & {
    PluginHeaders?: unknown[];
  };
  capacitor.PluginHeaders = [
    ...(capacitor.PluginHeaders ?? []),
    ...bootstrap.plugins.map(descriptor => ({
      name: descriptor.pluginName,
      methods: [
        ...descriptor.methods.map(methodName => ({
          name: methodName,
          rtype: 'promise',
        })),
        { name: 'addListener', rtype: 'callback' },
        { name: 'removeListener', rtype: 'promise' },
        { name: 'removeAllListeners', rtype: 'promise' },
      ],
    })),
  ];
  capacitor.nativePromise = (
    pluginName: string,
    methodName: string,
    options?: unknown,
  ): Promise<unknown> => {
    const plugin = plugins[pluginName];
    if (!plugin) {
      return Promise.reject(new Error(`Unknown plugin "${pluginName}".`));
    }
    if (methodName === 'removeListener') {
      const removeOptions = options as { callbackId?: number } | undefined;
      return transport.removeListener(
        pluginName,
        removeOptions?.callbackId ?? -1,
      );
    }
    if (methodName === 'removeAllListeners') {
      const removeOptions = options as { eventName?: string } | undefined;
      return transport.removeAllListeners(pluginName, removeOptions?.eventName);
    }
    return unwrap(transport.invoke(pluginName, methodName, [options]));
  };
  capacitor.nativeCallback = (
    pluginName: string,
    methodName: string,
    options?: unknown,
    callback?: (data: unknown) => void,
  ): number => {
    if (!plugins[pluginName] || methodName !== 'addListener' || !callback) {
      throw new Error(
        `"${pluginName}.${methodName}()" is not supported as a callback method on electron.`,
      );
    }
    const addOptions = options as { eventName: string };
    return transport.addListener(pluginName, addOptions.eventName, callback);
  };
  globalWindow.Capacitor = capacitor;
})();
