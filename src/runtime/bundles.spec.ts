import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Bundles } from './bundles';

const { fsState } = vi.hoisted(() => ({
  fsState: {
    files: new Map<string, string>(),
    dirs: new Set<string>(),
  },
}));

vi.mock('electron', () => ({
  app: { getPath: () => '/userData' },
}));

vi.mock('fs', () => ({
  existsSync: (path: string): boolean =>
    fsState.files.has(path) || fsState.dirs.has(path),
  readFileSync: (path: string): string => {
    const content = fsState.files.get(path);
    if (content === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }
    return content;
  },
  writeFileSync: (path: string, data: string): void => {
    fsState.files.set(path, data);
  },
}));

const STATE_FILE = join('/userData', 'capacitor-electron-bundles.json');
const BUNDLE_A = join('/bundles', 'a');
const BUNDLE_B = join('/bundles', 'b');

interface PersistedState {
  activeBundlePath: string | null;
  previousBundlePath: string | null;
  pending: boolean;
}

const registerBundle = (dir: string): void => {
  fsState.dirs.add(dir);
  fsState.dirs.add(join(dir, 'index.html'));
};

const seedState = (state: PersistedState): void => {
  fsState.files.set(STATE_FILE, JSON.stringify(state));
};

const readState = (): PersistedState =>
  JSON.parse(fsState.files.get(STATE_FILE) as string) as PersistedState;

beforeEach(() => {
  fsState.files.clear();
  fsState.dirs.clear();
  registerBundle(BUNDLE_A);
  registerBundle(BUNDLE_B);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('Bundles.setActiveBundle', () => {
  it('arms the watchdog and persists a pending marker by default', async () => {
    const reloadWindows = vi.fn();
    const bundles = new Bundles({ reloadWindows, bootReadyTimeoutMs: 100 });

    await bundles.setActiveBundle(BUNDLE_A);

    expect(reloadWindows).toHaveBeenCalledTimes(1);
    expect(readState()).toEqual({
      activeBundlePath: BUNDLE_A,
      previousBundlePath: null,
      pending: true,
    });

    // Watchdog fires (no notifyBootReady): rolls back to the previous bundle.
    vi.advanceTimersByTime(100);
    expect(reloadWindows).toHaveBeenCalledTimes(2);
    expect(bundles.getActiveBundlePath()).toBeNull();
  });

  it('does not persist a pending marker or arm the watchdog when opted out', async () => {
    const reloadWindows = vi.fn();
    const bundles = new Bundles({ reloadWindows, bootReadyTimeoutMs: 100 });

    await bundles.setActiveBundle(BUNDLE_A, { bootWatchdog: false });

    expect(reloadWindows).toHaveBeenCalledTimes(1);
    expect(readState().pending).toBe(false);
    expect(bundles.getActiveBundlePath()).toBe(BUNDLE_A);

    // No watchdog: advancing past the timeout must not reload or roll back.
    vi.advanceTimersByTime(1000);
    expect(reloadWindows).toHaveBeenCalledTimes(1);
    expect(bundles.getActiveBundlePath()).toBe(BUNDLE_A);
  });

  it('treats notifyBootReady as a no-op for an opted-out activation', async () => {
    const reloadWindows = vi.fn();
    const bundles = new Bundles({ reloadWindows, bootReadyTimeoutMs: 100 });

    await bundles.setActiveBundle(BUNDLE_A, { bootWatchdog: false });
    const before = readState();
    bundles.notifyBootReady();

    expect(readState()).toEqual(before);
    expect(bundles.getActiveBundlePath()).toBe(BUNDLE_A);
  });

  it('validates index.html regardless of the watchdog option', async () => {
    const bundles = new Bundles({ reloadWindows: vi.fn() });

    await expect(
      bundles.setActiveBundle(join('/bundles', 'missing'), {
        bootWatchdog: false,
      }),
    ).rejects.toThrow(/does not contain an index\.html/);
  });
});

describe('Bundles startup pending-check', () => {
  it('does not revert an opted-out bundle across a restart', async () => {
    const first = new Bundles({ reloadWindows: vi.fn() });
    await first.setActiveBundle(BUNDLE_A, { bootWatchdog: false });

    // Simulate a restart: a fresh instance reads the persisted state.
    const second = new Bundles({ reloadWindows: vi.fn() });
    expect(second.getActiveBundlePath()).toBe(BUNDLE_A);
  });

  it('still rolls back a stale pending state from a previous watchdog activation', () => {
    seedState({
      activeBundlePath: BUNDLE_B,
      previousBundlePath: BUNDLE_A,
      pending: true,
    });

    const bundles = new Bundles({ reloadWindows: vi.fn() });

    expect(bundles.getActiveBundlePath()).toBe(BUNDLE_A);
    expect(readState()).toEqual({
      activeBundlePath: BUNDLE_A,
      previousBundlePath: null,
      pending: false,
    });
  });
});

describe('Bundles mixed activation sequences', () => {
  it('watchdog activation followed by an opt-out cancels the watchdog', async () => {
    const reloadWindows = vi.fn();
    const bundles = new Bundles({ reloadWindows, bootReadyTimeoutMs: 100 });

    await bundles.setActiveBundle(BUNDLE_A);
    await bundles.setActiveBundle(BUNDLE_B, { bootWatchdog: false });

    expect(readState()).toEqual({
      activeBundlePath: BUNDLE_B,
      previousBundlePath: BUNDLE_A,
      pending: false,
    });

    // The earlier watchdog must not fire and revert the opted-out bundle.
    vi.advanceTimersByTime(1000);
    expect(bundles.getActiveBundlePath()).toBe(BUNDLE_B);
  });

  it('opt-out activation followed by a watchdog activation rolls back to the opted-out bundle', async () => {
    const reloadWindows = vi.fn();
    const bundles = new Bundles({ reloadWindows, bootReadyTimeoutMs: 100 });

    await bundles.setActiveBundle(BUNDLE_A, { bootWatchdog: false });
    await bundles.setActiveBundle(BUNDLE_B);

    expect(readState()).toEqual({
      activeBundlePath: BUNDLE_B,
      previousBundlePath: BUNDLE_A,
      pending: true,
    });

    // Watchdog fires: rolls back to the opted-out bundle.
    vi.advanceTimersByTime(100);
    expect(bundles.getActiveBundlePath()).toBe(BUNDLE_A);
    expect(readState().pending).toBe(false);
  });
});
