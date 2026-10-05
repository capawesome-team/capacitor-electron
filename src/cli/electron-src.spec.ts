import { describe, expect, it } from 'vitest';

import { getElectronSrc } from './electron-src';

describe('getElectronSrc', () => {
  it('returns the declared directory', () => {
    expect(
      getElectronSrc({ capacitor: { electron: { src: 'desktop' } } }),
    ).toBe('desktop');
  });

  it('defaults to electron when the platform key is present', () => {
    expect(getElectronSrc({ capacitor: { electron: {} } })).toBe('electron');
  });

  it('returns undefined when the platform key is absent', () => {
    expect(getElectronSrc({ capacitor: {} })).toBeUndefined();
    expect(getElectronSrc({})).toBeUndefined();
  });
});
