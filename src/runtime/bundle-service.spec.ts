import { join } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InMemoryBundleService } from './bundle-service';

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

describe('InMemoryBundleService', () => {
  it('serves the packaged app bundle by default', () => {
    const service = new InMemoryBundleService({ reloadWindows: vi.fn() });

    expect(service.getActiveBundlePath()).toBeNull();
  });

  it('activates a bundle directory and reloads the windows', () => {
    const reloadWindows = vi.fn();
    const service = new InMemoryBundleService({ reloadWindows });

    service.setActiveBundle(BUNDLE);

    expect(service.getActiveBundlePath()).toBe(BUNDLE);
    expect(reloadWindows).toHaveBeenCalledTimes(1);
  });

  it('reverts to the packaged app bundle with null', () => {
    const reloadWindows = vi.fn();
    const service = new InMemoryBundleService({ reloadWindows });

    service.setActiveBundle(BUNDLE);
    service.setActiveBundle(null);

    expect(service.getActiveBundlePath()).toBeNull();
    expect(reloadWindows).toHaveBeenCalledTimes(2);
  });

  it('rejects a directory without an index.html and keeps the current bundle', () => {
    const reloadWindows = vi.fn();
    const service = new InMemoryBundleService({ reloadWindows });

    expect(() => service.setActiveBundle(join('/bundles', 'missing'))).toThrow(
      /does not contain an index\.html/,
    );
    expect(service.getActiveBundlePath()).toBeNull();
    expect(reloadWindows).not.toHaveBeenCalled();
  });
});
