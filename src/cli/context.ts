import { existsSync } from 'fs';
import { join } from 'path';

import type { CapacitorAppConfig } from '../shared/definitions';

import { fail } from './log';

export interface CliContext {
  /** Absolute path of the Capacitor app project. */
  rootDir: string;
  /** Absolute path of the built web assets. */
  webDir: string;
  /** Parsed Capacitor configuration. */
  config: CapacitorAppConfig;
  /** Absolute path of the user-owned `electron/` project. */
  platformDir: string;
  /** Absolute path of `electron/generated/`. */
  generatedDir: string;
  /** Absolute path of `electron/app/` (the served web assets copy). */
  appDir: string;
}

export function readCliContext(): CliContext {
  const rootDir = process.env.CAPACITOR_ROOT_DIR;
  if (!rootDir) {
    return fail(
      'CAPACITOR_ROOT_DIR is not set. This command must be invoked by the Capacitor CLI, e.g. `npx cap sync @capawesome/capacitor-electron`.',
    );
  }
  const webDir = process.env.CAPACITOR_WEB_DIR ?? '';
  let config: CapacitorAppConfig = {};
  const rawConfig = process.env.CAPACITOR_CONFIG;
  if (rawConfig) {
    try {
      config = JSON.parse(rawConfig) as CapacitorAppConfig;
    } catch {
      return fail('CAPACITOR_CONFIG contains invalid JSON.');
    }
  }
  const platformDir = join(rootDir, 'electron');
  return {
    rootDir,
    webDir,
    config,
    platformDir,
    generatedDir: join(platformDir, 'generated'),
    appDir: join(platformDir, 'app'),
  };
}

export function requirePlatformDir(context: CliContext): void {
  if (!existsSync(context.platformDir)) {
    fail(
      `No electron platform found at ${context.platformDir}. Run \`npx cap add @capawesome/capacitor-electron\` first.`,
    );
  }
}
