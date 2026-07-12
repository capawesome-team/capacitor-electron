import { describe, expect, it, vi } from 'vitest';

import { validateDeclaredMethods } from './plugin-host';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn(), on: vi.fn() } }));

const instance = {
  async open(): Promise<void> {
    // noop
  },
  async query(): Promise<void> {
    // noop
  },
};

describe('validateDeclaredMethods', () => {
  it('accepts declared methods that exist on the instance', () => {
    expect(() =>
      validateDeclaredMethods('Sqlite', ['open', 'query'], instance, 'pkg'),
    ).not.toThrow();
  });

  it('rejects declared methods that are not implemented', () => {
    expect(() =>
      validateDeclaredMethods('Sqlite', ['open', 'missing'], instance, 'pkg'),
    ).toThrow(/declares method "missing" but does not implement it/);
  });
});
