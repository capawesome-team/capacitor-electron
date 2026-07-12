import { join, sep } from 'path';
import { describe, expect, it } from 'vitest';

import { resolveWithinRoot } from './serving';

const root = join(sep, 'srv', 'app');

describe('resolveWithinRoot', () => {
  it('maps the root path to index.html', () => {
    expect(resolveWithinRoot(root, '/')).toBe(join(root, 'index.html'));
  });

  it('maps a nested path into the root', () => {
    expect(resolveWithinRoot(root, '/assets/main.js')).toBe(
      join(root, 'assets', 'main.js'),
    );
  });

  it('rejects path traversal', () => {
    expect(resolveWithinRoot(root, '/../secret.txt')).toBeNull();
    expect(resolveWithinRoot(root, '/a/../../secret.txt')).toBeNull();
    expect(resolveWithinRoot(root, '/%2e%2e/secret.txt')).toBeNull();
  });

  it('rejects null bytes and invalid encodings', () => {
    expect(resolveWithinRoot(root, '/%00')).toBeNull();
    expect(resolveWithinRoot(root, '/%zz')).toBeNull();
  });

  it('allows dot segments that stay within the root', () => {
    expect(resolveWithinRoot(root, '/a/../index.html')).toBe(
      join(root, 'index.html'),
    );
  });
});
