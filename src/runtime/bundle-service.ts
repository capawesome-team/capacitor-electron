import { existsSync } from 'fs';
import { join } from 'path';

import type { BundleService } from '../plugin/index';

export interface BundleServiceOptions {
  reloadWindows: () => void;
}

/**
 * The serving primitive for web-bundle updates: an in-memory switch of the
 * served root directory plus a window reload. Persistence, download and
 * rollback are deliberately NOT part of the platform; the consumer (e.g. a
 * live-update plugin) owns them and re-applies its bundle in `load()`.
 */
export class InMemoryBundleService implements BundleService {
  private readonly options: BundleServiceOptions;
  private activeBundlePath: string | null = null;

  constructor(options: BundleServiceOptions) {
    this.options = options;
  }

  getActiveBundlePath(): string | null {
    return this.activeBundlePath;
  }

  setActiveBundle(bundleDirectory: string | null): void {
    if (
      bundleDirectory !== null &&
      !existsSync(join(bundleDirectory, 'index.html'))
    ) {
      throw new Error(
        `Bundle directory ${bundleDirectory} does not contain an index.html.`,
      );
    }
    this.activeBundlePath = bundleDirectory;
    this.options.reloadWindows();
  }
}
