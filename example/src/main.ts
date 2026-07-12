import { App } from '@capacitor/app';
import { Capacitor, registerPlugin } from '@capacitor/core';

interface EchoPlugin {
  echo(options: { value: string }): Promise<{ value: string }>;
  ping(options: { value: string }): Promise<{ ok: boolean }>;
  fail(): Promise<void>;
  addListener(
    eventName: 'ping',
    callback: (data: { echoed: string }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

// Committed test fixture (local-plugins/echo); resolved through the
// platform's native plugin path — no `electron` key needed.
const Echo = registerPlugin<EchoPlugin>('Echo');

const set = (testId: string, value: string): void => {
  const element = document.querySelector(`[data-testid="${testId}"]`);
  if (element) {
    element.textContent = value;
  }
};

void App.addListener('appUrlOpen', ({ url }) => set('deep-link', url));

const runPluginCheck = async (): Promise<void> => {
  try {
    await Echo.addListener('ping', data => set('plugin-event', data.echoed));
    const result = await Echo.echo({ value: 'round-trip' });
    set('plugin-result', result.value);
    await Echo.ping({ value: 'event-round-trip' });
    try {
      await Echo.fail();
      set('plugin-error-code', 'missing');
    } catch (error) {
      set('plugin-error-code', (error as { code?: string }).code ?? 'none');
    }
    set('plugin-status', 'ok');
  } catch (error) {
    set('plugin-status', (error as Error).message);
  }
};

const bootstrap = async (): Promise<void> => {
  set('platform', Capacitor.getPlatform());
  set('native', String(Capacitor.isNativePlatform()));
  const info = await App.getInfo();
  set('app-info', `${info.name} (${info.id})`);
  await runPluginCheck();
  set('status', 'ready');
};

void bootstrap();
