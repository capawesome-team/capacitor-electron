import { contextBridge, ipcRenderer, webFrame } from 'electron';

import type { BridgeBootstrap, BridgeCallResult } from '../shared/definitions';
import {
  BOOTSTRAP_CHANNEL,
  EVENT_CHANNEL,
  addListenerChannel,
  methodChannel,
  removeAllListenersChannel,
  removeListenerChannel,
} from '../shared/ipc';
import type { EventPayload } from '../shared/ipc';

// Inlined at build time; see rollup.config.mjs. Contains the compiled
// main-world shim that builds `window.CapacitorCustomPlatform` and the
// `Capacitor.PluginHeaders` pre-seed on top of the transport below.
declare const __SHIM_SOURCE__: string;

const bootstrap = ipcRenderer.sendSync(BOOTSTRAP_CHANNEL) as BridgeBootstrap;

const plugins = new Map(
  bootstrap.plugins.map(descriptor => [descriptor.pluginName, descriptor]),
);

interface RegisteredCallback {
  eventName: string;
  callback: (data: unknown) => void;
}

let nextListenerId = 1;
const callbacks = new Map<string, RegisteredCallback>();
const callbackKey = (pluginName: string, listenerId: number): string =>
  `${pluginName}:${listenerId}`;

ipcRenderer.on(EVENT_CHANNEL, (_event, payload: EventPayload) => {
  callbacks
    .get(callbackKey(payload.pluginName, payload.listenerId))
    ?.callback(payload.data);
});

/**
 * Channel names are always derived from manifest entries, never from
 * page-provided strings, so the page cannot address arbitrary IPC channels.
 */
function requirePlugin(pluginName: string, methodName?: string): void {
  const descriptor = plugins.get(pluginName);
  if (!descriptor) {
    throw new Error(`Unknown plugin "${pluginName}".`);
  }
  if (methodName !== undefined && !descriptor.methods.includes(methodName)) {
    throw new Error(`Unknown method "${pluginName}.${methodName}()".`);
  }
}

const transport = {
  getBootstrap(): BridgeBootstrap {
    return bootstrap;
  },
  invoke(
    pluginName: string,
    methodName: string,
    args: unknown[],
  ): Promise<BridgeCallResult> {
    try {
      requirePlugin(pluginName, methodName);
    } catch (error) {
      return Promise.resolve({
        error: { message: (error as Error).message },
      });
    }
    return ipcRenderer.invoke(methodChannel(pluginName, methodName), args);
  },
  addListener(
    pluginName: string,
    eventName: string,
    callback: (data: unknown) => void,
  ): number {
    requirePlugin(pluginName);
    const listenerId = nextListenerId++;
    callbacks.set(callbackKey(pluginName, listenerId), {
      eventName,
      callback,
    });
    void ipcRenderer.invoke(
      addListenerChannel(pluginName),
      listenerId,
      eventName,
    );
    return listenerId;
  },
  removeListener(pluginName: string, listenerId: number): Promise<void> {
    requirePlugin(pluginName);
    callbacks.delete(callbackKey(pluginName, listenerId));
    return ipcRenderer
      .invoke(removeListenerChannel(pluginName), listenerId)
      .then(() => undefined);
  },
  removeAllListeners(pluginName: string, eventName?: string): Promise<void> {
    requirePlugin(pluginName);
    for (const [key, registered] of [...callbacks]) {
      if (
        key.startsWith(`${pluginName}:`) &&
        (eventName === undefined || registered.eventName === eventName)
      ) {
        callbacks.delete(key);
      }
    }
    return ipcRenderer
      .invoke(removeAllListenersChannel(pluginName), eventName)
      .then(() => undefined);
  },
};

export type BridgeTransport = typeof transport;

contextBridge.exposeInMainWorld('__capacitorElectronBridge', transport);

// Runs synchronously in the main world, before any page script.
void webFrame.executeJavaScript(__SHIM_SOURCE__);
