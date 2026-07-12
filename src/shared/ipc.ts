export const BOOTSTRAP_CHANNEL = 'capacitor-electron:bootstrap';
export const EVENT_CHANNEL = 'capacitor-electron:event';

export const methodChannel = (pluginName: string, methodName: string): string =>
  `capacitor:${pluginName}:${methodName}`;

export const addListenerChannel = (pluginName: string): string =>
  `capacitor:${pluginName}:addListener`;

export const removeListenerChannel = (pluginName: string): string =>
  `capacitor:${pluginName}:removeListener`;

export const removeAllListenersChannel = (pluginName: string): string =>
  `capacitor:${pluginName}:removeAllListeners`;

export interface EventPayload {
  pluginName: string;
  listenerId: number;
  data: unknown;
}
