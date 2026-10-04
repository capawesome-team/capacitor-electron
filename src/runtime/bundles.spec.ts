import { join } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Bundles } from './bundles';

const { existingPaths } = vi.hoisted(() => ({
  existingPaths: new Set<string>(),
}));

vi.mock('fs', () => ({
  existsSync: (path: string): boolean => existingPaths.has(path),
}));

const BUNDLE = join('/bundles', 'a');

beforeEach(() => {
  existingPaths.clear();
  existingPaths.add(join(BUNDLE, 'index.html'));
});

describe('Bundles', () => {
  it('serves the packaged app bundle by default', () => {
    const bundles = new Bundles({ reloadWindows: vi.fn() });

    expect(bundles.getActiveBundlePath()).toBeNull();
  });

  it('activates a bundle directory and reloads the windows', () => {
    const reloadWindows = vi.fn();
    const bundles = new Bundles({ reloadWindows });

    bundles.setActiveBundle(BUNDLE);

    expect(bundles.getActiveBundlePath()).toBe(BUNDLE);
    expect(reloadWindows).toHaveBeenCalledTimes(1);
  });

  it('reverts to the packaged app bundle with null', () => {
    const reloadWindows = vi.fn();
    const bundles = new Bundles({ reloadWindows });

    bundles.setActiveBundle(BUNDLE);
    bundles.setActiveBundle(null);

    expect(bundles.getActiveBundlePath()).toBeNull();
    expect(reloadWindows).toHaveBeenCalledTimes(2);
  });

  it('rejects a directory without an index.html and keeps the current bundle', () => {
    const reloadWindows = vi.fn();
    const bundles = new Bundles({ reloadWindows });

    expect(() => bundles.setActiveBundle(join('/bundles', 'missing'))).toThrow(
      /does not contain an index\.html/,
    );
    expect(bundles.getActiveBundlePath()).toBeNull();
    expect(reloadWindows).not.toHaveBeenCalled();
  });
});
