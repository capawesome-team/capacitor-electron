import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import type { BundlesService } from '../plugin/index';

interface BundlesState {
  activeBundlePath: string | null;
  previousBundlePath: string | null;
  /**
   * True while a newly activated bundle has not yet signalled a successful
   * boot. A pending state found at startup means the last boot crashed
   * before the ready signal, so the previous bundle is restored.
   */
  pending: boolean;
}

const DEFAULT_BOOT_READY_TIMEOUT_MS = 15_000;

export interface BundlesServiceOptions {
  bootReadyTimeoutMs?: number;
  reloadWindows: () => void;
}

/**
 * The serving primitive for web-bundle updates: protocol repointing, window
 * reload, and the failed-boot rollback watchdog. The OTA update product
 * (download, verification, channels) is deliberately NOT part of the
 * platform; it consumes this primitive.
 *
 * The watchdog is opt-out per activation via
 * `setActiveBundle(dir, { bootWatchdog: false })`: a consumer that owns its
 * own rollback state machine (e.g. a live-update engine) must disable it, as
 * two concurrent watchdogs writing two persisted states would drift.
 */
export class Bundles implements BundlesService {
  private readonly options: BundlesServiceOptions;
  private state: BundlesState;
  private watchdog: NodeJS.Timeout | null = null;

  constructor(options: BundlesServiceOptions) {
    this.options = options;
    this.state = this.readState();
    if (this.state.pending) {
      // The previous launch never signalled boot readiness: roll back.
      this.state = {
        activeBundlePath: this.state.previousBundlePath,
        previousBundlePath: null,
        pending: false,
      };
      this.writeState();
    }
    if (
      this.state.activeBundlePath &&
      !existsSync(this.state.activeBundlePath)
    ) {
      this.state = {
        activeBundlePath: null,
        previousBundlePath: null,
        pending: false,
      };
      this.writeState();
    }
  }

  getActiveBundlePath(): string | null {
    return this.state.activeBundlePath;
  }

  async setActiveBundle(
    bundleDirectory: string | null,
    options?: { bootWatchdog?: boolean },
  ): Promise<void> {
    if (
      bundleDirectory !== null &&
      !existsSync(join(bundleDirectory, 'index.html'))
    ) {
      throw new Error(
        `Bundle directory ${bundleDirectory} does not contain an index.html.`,
      );
    }
    // A pending marker exists only while the watchdog is responsible for
    // this activation. With `bootWatchdog: false` the caller owns rollback,
    // so no marker is written (the startup pending-check never reverts it)
    // and `notifyBootReady()` is a no-op for this activation.
    const bootWatchdog = options?.bootWatchdog ?? true;
    const pending = bundleDirectory !== null && bootWatchdog;
    this.cancelWatchdog();
    this.state = {
      activeBundlePath: bundleDirectory,
      previousBundlePath: this.state.activeBundlePath,
      pending,
    };
    this.writeState();
    this.options.reloadWindows();
    if (pending) {
      this.armWatchdog();
    }
  }

  notifyBootReady(): void {
    this.cancelWatchdog();
    if (this.state.pending) {
      this.state = { ...this.state, previousBundlePath: null, pending: false };
      this.writeState();
    }
  }

  private armWatchdog(): void {
    const timeout =
      this.options.bootReadyTimeoutMs ?? DEFAULT_BOOT_READY_TIMEOUT_MS;
    this.watchdog = setTimeout(() => {
      this.state = {
        activeBundlePath: this.state.previousBundlePath,
        previousBundlePath: null,
        pending: false,
      };
      this.writeState();
      this.options.reloadWindows();
    }, timeout);
  }

  private cancelWatchdog(): void {
    if (this.watchdog) {
      clearTimeout(this.watchdog);
      this.watchdog = null;
    }
  }

  private get stateFilePath(): string {
    return join(app.getPath('userData'), 'capacitor-electron-bundles.json');
  }

  private readState(): BundlesState {
    try {
      return {
        activeBundlePath: null,
        previousBundlePath: null,
        pending: false,
        ...(JSON.parse(
          readFileSync(this.stateFilePath, 'utf8'),
        ) as Partial<BundlesState>),
      };
    } catch {
      return {
        activeBundlePath: null,
        previousBundlePath: null,
        pending: false,
      };
    }
  }

  private writeState(): void {
    writeFileSync(this.stateFilePath, JSON.stringify(this.state, null, 2));
  }
}
