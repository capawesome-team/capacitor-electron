import { protocol } from 'electron';
import type { Session } from 'electron';
import { readFile } from 'fs/promises';
import { extname, join, normalize, relative, isAbsolute, sep } from 'path';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.pdf': 'application/pdf',
  '.map': 'application/json',
};

export interface ServingOptions {
  scheme: string;
  hostname: string;
  /**
   * Returns the directory currently served as the web app root. Evaluated
   * per request so the bundles service can repoint it at runtime.
   */
  getRootDirectory: () => string;
  /**
   * Content-Security-Policy header value attached to HTML responses.
   */
  getContentSecurityPolicy: () => string;
}

/**
 * Must be called before `app.whenReady()`.
 */
export function registerPrivilegedScheme(scheme: string): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        codeCache: true,
      },
    },
  ]);
}

export function installProtocolHandler(
  session: Session,
  options: ServingOptions,
): void {
  session.protocol.handle(options.scheme, async request => {
    const url = new URL(request.url);
    if (url.hostname !== options.hostname) {
      return new Response('Not found', { status: 404 });
    }
    const rootDirectory = options.getRootDirectory();
    const filePath = resolveWithinRoot(rootDirectory, url.pathname);
    if (!filePath) {
      return new Response('Forbidden', { status: 403 });
    }
    const response =
      (await serveFile(filePath, options)) ??
      // SPA fallback: serve index.html for extensionless navigation paths.
      (extname(filePath) === ''
        ? await serveFile(join(rootDirectory, 'index.html'), options)
        : undefined);
    return response ?? new Response('Not found', { status: 404 });
  });
}

/**
 * Maps a URL pathname to a file path inside `rootDirectory`, rejecting
 * anything that escapes it. Returns `null` for unsafe paths.
 */
export function resolveWithinRoot(
  rootDirectory: string,
  pathname: string,
): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) {
    return null;
  }
  const target = normalize(join(rootDirectory, decoded));
  const relativePath = relative(rootDirectory, target);
  if (
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    return null;
  }
  return decoded === '/' || decoded === ''
    ? join(rootDirectory, 'index.html')
    : target;
}

async function serveFile(
  filePath: string,
  options: ServingOptions,
): Promise<Response | undefined> {
  let content: Buffer;
  try {
    content = await readFile(filePath);
  } catch {
    return undefined;
  }
  const mimeType =
    MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  const headers: Record<string, string> = { 'Content-Type': mimeType };
  if (mimeType === 'text/html') {
    headers['Content-Security-Policy'] = options.getContentSecurityPolicy();
  }
  return new Response(new Uint8Array(content), { status: 200, headers });
}
