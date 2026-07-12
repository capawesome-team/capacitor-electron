import { spawn } from 'child_process';
import { existsSync } from 'fs';

import type { CliContext } from './context';
import { requirePlatformDir } from './context';
import { copyCommand } from './copy';
import { fail, logInfo } from './log';
import { updateCommand } from './update';

export async function runCommand(context: CliContext): Promise<void> {
  const devServerUrl = context.config.server?.url;
  await prepare(context, { requireWebAssets: !devServerUrl });
  if (devServerUrl) {
    await assertDevServerReachable(devServerUrl);
    logInfo(`Using dev server at ${devServerUrl}.`);
  }
  await launchElectron(context, devServerUrl);
}

async function assertDevServerReachable(devServerUrl: string): Promise<void> {
  try {
    await fetch(devServerUrl, { signal: AbortSignal.timeout(3000) });
  } catch {
    fail(
      `The dev server configured in the Capacitor config (server.url = ${devServerUrl}) is not reachable. Start it first, or remove server.url to serve the built web assets instead.`,
    );
  }
}

export async function openCommand(context: CliContext): Promise<void> {
  await prepare(context, { requireWebAssets: true });
  await launchElectron(context, undefined);
}

async function prepare(
  context: CliContext,
  options: { requireWebAssets: boolean },
): Promise<void> {
  requirePlatformDir(context);
  if (options.requireWebAssets) {
    await copyCommand(context);
  }
  await updateCommand(context);
  await runInPlatformDir(context, 'npx tsc', 'Compiling electron/main.ts');
}

async function launchElectron(
  context: CliContext,
  devServerUrl: string | undefined,
): Promise<void> {
  if (!existsSync(`${context.platformDir}/node_modules`)) {
    fail(
      `Dependencies are not installed in ${context.platformDir}. Run \`npm install\` there first.`,
    );
  }
  await runInPlatformDir(context, 'npx electron .', 'Launching Electron', {
    ...(devServerUrl
      ? { CAPACITOR_ELECTRON_DEV_SERVER_URL: devServerUrl }
      : {}),
  });
}

function runInPlatformDir(
  context: CliContext,
  command: string,
  description: string,
  env: Record<string, string> = {},
): Promise<void> {
  logInfo(`${description}...`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd: context.platformDir,
      shell: true,
      stdio: 'inherit',
      env: { ...process.env, ...env },
    });
    child.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(`\`${command}\` failed with exit code ${code ?? 'null'}.`),
        );
      }
    });
    child.on('error', reject);
  });
}
