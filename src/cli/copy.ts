import { existsSync } from 'fs';
import { cp, mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';

import type { CliContext } from './context';
import { requirePlatformDir } from './context';
import { fail, logInfo } from './log';

export async function copyCommand(context: CliContext): Promise<void> {
  requirePlatformDir(context);
  await embedConfig(context);
  if (!context.webDir || !existsSync(context.webDir)) {
    fail(
      `Web assets directory ${context.webDir || '(unset)'} does not exist. Build your web app first.`,
    );
  }
  await rm(context.appDir, { recursive: true, force: true });
  await cp(context.webDir, context.appDir, { recursive: true });
  logInfo(`Copied web assets to ${context.appDir}.`);
}

export async function embedConfig(context: CliContext): Promise<void> {
  await mkdir(context.generatedDir, { recursive: true });
  await writeFile(
    join(context.generatedDir, 'capacitor.config.json'),
    `${JSON.stringify(context.config, null, 2)}\n`,
  );
}
