import { describe, expect, it, vi } from 'vitest';

import { parseDeepLinkFromArgv } from './deep-links';

vi.mock('electron', () => ({ app: {} }));

describe('parseDeepLinkFromArgv', () => {
  it('finds the deep-link argument regardless of position', () => {
    expect(
      parseDeepLinkFromArgv(
        ['/usr/bin/app', '--flag', 'myapp://route?x=1'],
        'myapp',
      ),
    ).toBe('myapp://route?x=1');
  });

  it('matches the scheme case-insensitively', () => {
    expect(parseDeepLinkFromArgv(['MyApp://route'], 'myapp')).toBe(
      'MyApp://route',
    );
  });

  it('ignores other schemes and plain arguments', () => {
    expect(
      parseDeepLinkFromArgv(
        ['/usr/bin/app', 'https://example.com', 'other://x', '.'],
        'myapp',
      ),
    ).toBeNull();
  });

  it('does not treat a scheme prefix inside an argument as a match', () => {
    expect(parseDeepLinkFromArgv(['--url=myapp://x'], 'myapp')).toBeNull();
  });
});
