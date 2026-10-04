import { describe, expect, it, vi } from 'vitest';

import { createTrustedUrlMatcher } from './navigation';

vi.mock('electron', () => ({ shell: { openExternal: vi.fn() } }));

const APP_ORIGIN = 'capacitor-electron://localhost';

describe('createTrustedUrlMatcher', () => {
  it('trusts the app origin and its paths', () => {
    const isTrustedUrl = createTrustedUrlMatcher(APP_ORIGIN, undefined);

    expect(isTrustedUrl(APP_ORIGIN)).toBe(true);
    expect(isTrustedUrl(`${APP_ORIGIN}/index.html`)).toBe(true);
    expect(isTrustedUrl(`${APP_ORIGIN}.evil.com/`)).toBe(false);
    expect(isTrustedUrl('http://localhost:5173/')).toBe(false);
  });

  it('trusts the dev server by origin, not by string prefix', () => {
    const isTrustedUrl = createTrustedUrlMatcher(
      APP_ORIGIN,
      'http://localhost:5173/app',
    );

    expect(isTrustedUrl('http://localhost:5173/')).toBe(true);
    expect(isTrustedUrl('http://localhost:5173/app/page')).toBe(true);
    expect(isTrustedUrl('http://localhost:51730/')).toBe(false);
    expect(isTrustedUrl('http://localhost:5173.evil.com/')).toBe(false);
    expect(isTrustedUrl('not a url')).toBe(false);
  });
});
