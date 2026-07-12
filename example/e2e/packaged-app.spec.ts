import { existsSync } from 'fs';
import { join } from 'path';
import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';

/**
 * Drives the PACKAGED app (electron-builder --dir output), not a dev
 * instance: launch, plugin round-trip, and a deep-link event.
 */

const PRODUCT_NAME = 'Capacitor Electron Example';

function findPackagedExecutable(): string {
  const distDir = join(__dirname, '..', 'electron', 'dist');
  const candidates =
    process.platform === 'darwin'
      ? ['mac-arm64', 'mac', 'mac-x64'].map(dir =>
          join(
            distDir,
            dir,
            `${PRODUCT_NAME}.app`,
            'Contents',
            'MacOS',
            PRODUCT_NAME,
          ),
        )
      : process.platform === 'win32'
        ? [join(distDir, 'win-unpacked', `${PRODUCT_NAME}.exe`)]
        : [
            join(distDir, 'linux-unpacked', PRODUCT_NAME.toLowerCase()),
            join(
              distDir,
              'linux-unpacked',
              'capacitor-electron-example-electron',
            ),
            join(distDir, 'linux-arm64-unpacked', PRODUCT_NAME.toLowerCase()),
          ];
  const executablePath = candidates.find(candidate => existsSync(candidate));
  if (!executablePath) {
    throw new Error(
      `Packaged app not found (looked at: ${candidates.join(', ')}). Run \`npm run e2e:prepare\` first.`,
    );
  }
  return executablePath;
}

test('packaged app: launch, plugin round-trip, deep-link event', async () => {
  const app = await electron.launch({
    executablePath: findPackagedExecutable(),
  });
  const page = await app.firstWindow();

  // Launch: platform injection through the real @capacitor/core.
  await expect(page.getByTestId('status')).toHaveText('ready');
  await expect(page.getByTestId('platform')).toHaveText('electron');
  await expect(page.getByTestId('native')).toHaveText('true');
  await expect(page.getByTestId('app-info')).toHaveText(
    `${PRODUCT_NAME} (io.capawesome.example)`,
  );

  // Plugin round-trip through real @capacitor/core `registerPlugin` calls:
  // method result, event via notifyListeners, and error-code fidelity.
  await expect(page.getByTestId('plugin-status')).toHaveText('ok');
  await expect(page.getByTestId('plugin-result')).toHaveText('round-trip');
  await expect(page.getByTestId('plugin-event')).toHaveText('event-round-trip');
  await expect(page.getByTestId('plugin-error-code')).toHaveText('UNAVAILABLE');

  // Deep link delivered as the standard appUrlOpen event. Emitted on the
  // app object in the MAIN process — the same entry point the OS handlers
  // (open-url / second-instance argv) feed into.
  await app.evaluate(({ app: electronApp }) => {
    electronApp.emit(
      'open-url',
      { preventDefault: () => undefined },
      'capacitor-electron-example://e2e?x=1',
    );
  });
  await expect(page.getByTestId('deep-link')).toHaveText(
    'capacitor-electron-example://e2e?x=1',
  );

  await app.close();
});
