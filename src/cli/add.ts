import { existsSync } from 'fs';
import { cp, mkdir, readFile, readdir, writeFile } from 'fs/promises';
import { join } from 'path';

import type { CliContext } from './context';
import { logInfo, fail } from './log';

const TEXT_EXTENSIONS = ['.ts', '.js', '.json', '.md'];

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'app';

export async function addCommand(context: CliContext): Promise<void> {
  if (existsSync(context.platformDir)) {
    fail(
      `${context.platformDir} already exists. Delete it first if you want to re-add the electron platform.`,
    );
  }
  const templatesDir = join(__dirname, '../../templates/scaffold');
  const variables: Record<string, string> = {
    APP_ID: context.config.appId ?? 'com.example.app',
    APP_NAME: context.config.appName ?? 'App',
    APP_NAME_SLUG: slugify(context.config.appName ?? 'app'),
  };
  await copyTemplates(templatesDir, context.platformDir, variables);
  logInfo(`Created ${context.platformDir}.`);
  logInfo('Next steps:');
  logInfo('  1. cd electron && npm install');
  logInfo('  2. npx cap sync @capawesome/capacitor-electron');
  logInfo('  3. npx cap run @capawesome/capacitor-electron');
}

async function copyTemplates(
  sourceDir: string,
  targetDir: string,
  variables: Record<string, string>,
): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = join(sourceDir, entry.name);
    // npm strips `.gitignore` files from published packages, so templates
    // ship them with a `gitignore` name.
    const targetName = entry.name === 'gitignore' ? '.gitignore' : entry.name;
    const targetPath = join(targetDir, targetName);
    if (entry.isDirectory()) {
      await copyTemplates(sourcePath, targetPath, variables);
    } else if (
      TEXT_EXTENSIONS.some(extension => entry.name.endsWith(extension)) ||
      entry.name === 'gitignore'
    ) {
      const content = await readFile(sourcePath, 'utf8');
      await writeFile(targetPath, substitute(content, variables));
    } else {
      await cp(sourcePath, targetPath);
    }
  }
}

const substitute = (
  content: string,
  variables: Record<string, string>,
): string =>
  content.replace(
    /{{(\w+)}}/g,
    (match, name: string) => variables[name] ?? match,
  );
