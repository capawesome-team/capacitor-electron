import type { Session } from 'electron';

export const DEFAULT_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "connect-src 'self' https: wss:",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

/**
 * Dev servers need inline scripts, eval (source maps, HMR runtimes), and
 * websocket connections. This relaxation applies in dev mode only.
 */
export const DEFAULT_DEV_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "connect-src 'self' https: wss: ws: http:",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

/**
 * In dev-server mode the HTML is served by the dev server, so the policy is
 * attached via header injection instead of the protocol handler.
 */
export function installDevServerCsp(
  session: Session,
  devServerUrl: string,
  policy: string,
): void {
  const devOrigin = new URL(devServerUrl).origin;
  session.webRequest.onHeadersReceived((details, callback) => {
    if (
      details.resourceType === 'mainFrame' &&
      details.url.startsWith(devOrigin)
    ) {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [policy],
        },
      });
    } else {
      callback({});
    }
  });
}
