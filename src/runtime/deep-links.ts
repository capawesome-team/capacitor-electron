import { app } from 'electron';
import { resolve } from 'path';

export interface DeepLinksOptions {
  scheme: string;
  onUrl: (url: string) => void;
}

export interface DeepLinks {
  getLaunchUrl: () => string | null;
  /**
   * Routes a second-instance argv (Windows/Linux) to `onUrl`.
   */
  handleArgv: (argv: string[]) => void;
}

/**
 * Extracts a deep-link URL from a process argv. Each argument is inspected
 * individually; the first one matching `<scheme>://` wins.
 */
export function parseDeepLinkFromArgv(
  argv: string[],
  scheme: string,
): string | null {
  const prefix = `${scheme.toLowerCase()}://`;
  for (const arg of argv) {
    if (arg.toLowerCase().startsWith(prefix)) {
      return arg;
    }
  }
  return null;
}

/**
 * Registers the custom URL scheme with the operating system and captures
 * deep-link activations: macOS `open-url` events plus the launch argv on
 * Windows/Linux. Must be called before `app.whenReady()` so that early
 * `open-url` events are not missed.
 */
export function installDeepLinks(options: DeepLinksOptions): DeepLinks {
  let launchUrl: string | null = null;

  // macOS delivers deep links as events, including at launch.
  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (!launchUrl) {
      launchUrl = url;
    }
    options.onUrl(url);
  });

  // Windows/Linux deliver the launch deep link via argv.
  const argvUrl = parseDeepLinkFromArgv(process.argv, options.scheme);
  if (argvUrl) {
    launchUrl = argvUrl;
    options.onUrl(argvUrl);
  }

  if (!app.isPackaged && process.argv[1]) {
    // In dev the app is launched as `electron <dir>`, so the OS registration
    // must include the executable arguments.
    app.setAsDefaultProtocolClient(options.scheme, process.execPath, [
      resolve(process.argv[1]),
    ]);
  } else {
    app.setAsDefaultProtocolClient(options.scheme);
  }

  return {
    getLaunchUrl: () => launchUrl,
    handleArgv: argv => {
      const url = parseDeepLinkFromArgv(argv, options.scheme);
      if (url) {
        options.onUrl(url);
      }
    },
  };
}
