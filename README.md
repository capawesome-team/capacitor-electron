# Capacitor Electron Platform

Capacitor platform to build, run, and package desktop apps for macOS, Windows, and Linux with Electron.[^1]

<div class="capawesome-z29o10a">
  <a href="https://capawesome.io/" target="_blank">
    <img alt="Deliver Live Updates to your Capacitor app with Capawesome Cloud" src="https://capawesome.io/assets/banners/cloud-build-and-deploy-capacitor-apps.png?t=1" />
  </a>
</div>

## Features

The Capacitor Electron platform brings your web app and your Capacitor plugins to the desktop. Here are some of the key features:

- 🖥️ **Cross-platform**: Build desktop apps for macOS, Windows, and Linux from one codebase.
- ⚡ **Familiar workflow**: `cap add`, `cap sync`, `cap run` — the same commands as iOS and Android.
- 🔌 **Plugin support**: Capacitor plugins with an Electron implementation work out of the box; plugins with a web implementation work automatically via fallback.
- 🔒 **Security-first**: Sandboxed renderer, context isolation, strict Content-Security-Policy, and validated IPC — enabled by default and not configurable.
- 🔗 **Deep links**: Custom URL schemes delivered through the standard `@capacitor/app` plugin's `appUrlOpen` event.
- 📱 **App lifecycle**: `appStateChange`, `pause`, and `resume` events, exactly like on mobile.
- ♻️ **Live reload**: Develop against your web dev server with full HMR.
- 📦 **Packaging**: Create installers with electron-builder, including automatic dependency vendoring.
- 🪟 **Window management**: Typed window options, state persistence, and hooks for trays and menus.
- 🧩 **Minimal scaffold**: You own a handful of small, stable files; all platform logic ships in the package and updates via `npm update`.
- 🔁 **Up-to-date**: Always supports the latest Capacitor and Electron versions.
- ⭐️ **Support**: Priority support from the Capawesome Team.
- ✨ **Handcrafted**: Built from the ground up with care and expertise, not forked or AI-generated.

Missing a feature? Just [open an issue](https://github.com/capawesome-team/capacitor-electron/issues) and we'll take a look!

## Use Cases

The Electron platform is typically used to bring an existing Capacitor app to the desktop, for example:

- **Desktop companion apps**: Ship your mobile app's functionality to macOS, Windows, and Linux without a rewrite.
- **Offline-first desktop tools**: Combine the platform with plugins like [SQLite](https://capawesome.io/docs/sdks/capacitor/sqlite/) for fully offline desktop applications.
- **Internal business tools**: Distribute apps directly to your team without app stores.
- **Kiosk and point-of-sale apps**: Run your web app full screen on dedicated desktop hardware.
- **Deep-link driven workflows**: Handle custom URL schemes on the desktop exactly like on mobile.

## Compatibility

| Platform Version | Capacitor Version | Electron Version | Status         |
| ---------------- | ----------------- | ---------------- | -------------- |
| 0.x              | >=6.x.x           | >=28.x.x         | Active support |

> [!NOTE]
> On Capacitor 6 and 7, the Capacitor CLI ignores the exit code of platform hooks, so a failing `npx cap sync` still reports success — check the log output for `[capacitor-electron]` errors. Capacitor 8 fails the command properly.

## Supported Plugins

Plugins integrate with the Electron platform in one of three ways:

| Plugin | Support |
| --- | --- |
| [`@capacitor/app`](https://capacitorjs.com/docs/apis/app) | ✅ Built into the platform (`appUrlOpen`, `appStateChange`, `pause`, `resume`, `getInfo`, `getState`, `getLaunchUrl`, `exitApp`, `minimizeApp`) |
| [`@capawesome-team/capacitor-sqlite`](https://capawesome.io/docs/sdks/capacitor/sqlite/) | ✅ Native Electron implementation via `node:sqlite` |
| Plugins with a web implementation | ✅ Automatic web fallback |

Plugins that require native functionality beyond their web implementation need a dedicated Electron implementation (see [Plugin Development](#plugin-development)). Is your favorite plugin missing? Just [open an issue](https://github.com/capawesome-team/capacitor-electron/issues) and we'll take a look!

## Installation

You can use our **AI-Assisted Setup** to add the platform.
Add the [Capawesome Skills](https://github.com/capawesome-team/skills) to your AI tool using the following command:

```bash
npx skills add capawesome-team/skills --skill capacitor-platforms
```

Then use the following prompt:

```
Use the `capacitor-platforms` skill from `capawesome-team/skills` to add the `@capawesome/capacitor-electron` platform to my project.
```

If you prefer **Manual Setup**, add the platform by running the following commands:

```bash
npm install @capawesome/capacitor-electron
npx cap add @capawesome/capacitor-electron
cd electron && npm install && cd ..
```

We recommend adding a `postinstall` script to your root `package.json` so the Electron dependencies are always installed together with your app dependencies:

```json
{
  "scripts": {
    "postinstall": "cd electron && npm ci && cd .."
  }
}
```

The initial `cd electron && npm install` generates `electron/package-lock.json` — commit it so that `npm ci` works for every future install.

> [!NOTE]
> Always use the full package name with Capacitor CLI commands (e.g. `npx cap sync @capawesome/capacitor-electron`). A bare `npx cap sync electron` resolves to the `electron` npm package and silently does nothing.

The scaffolded `electron/` project contains only files you own:

| File | Purpose |
| --- | --- |
| `main.ts` | ~5 lines: imports the runtime and starts the app |
| `capacitor.electron.config.ts` | Typed platform options (window, CSP, deep links, hooks) |
| `electron-builder.config.js` | Packaging configuration |
| `assets/` | App icons |

Everything with logic lives in the versioned npm package and updates via `npm update` — your platform project never rots.

## Configuration

Platform options are configured in `electron/capacitor.electron.config.ts` with full type safety:

```typescript
import { defineConfig } from '@capawesome/capacitor-electron/config';

export default defineConfig({
  window: {
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
  },
  deepLinks: {
    scheme: 'myapp',
  },
});
```

Extension happens through typed options and hooks (`windowFactory`, `beforeReady`, `onWindowCreated`, CSP overrides) — never by owning runtime code.

## Demo

A working example can be found here: [capawesome-team/capacitor-electron](https://github.com/capawesome-team/capacitor-electron/tree/main/example)

## Usage

```bash
# Copy web assets + regenerate the plugin manifest
npx cap sync @capawesome/capacitor-electron

# Run the app (uses server.url for live reload when configured)
npx cap run @capawesome/capacitor-electron

# Open the built app
npx cap open @capawesome/capacitor-electron
```

### Live Reload

Set `server.url` in your Capacitor config to your dev server and run the app — the window loads the dev server with full HMR, and the plugin bridge works exactly as in production:

```typescript
// capacitor.config.ts
const config: CapacitorConfig = {
  // ...
  server: {
    url: 'http://localhost:5173',
  },
};
```

```bash
npx vite &                                       # your web dev server
npx cap run @capawesome/capacitor-electron       # dev mode
```

In dev mode a documented, dev-only CSP relaxation is applied (inline scripts, eval, websockets — required by HMR runtimes), and the window automatically reconnects when the dev server restarts. Remove `server.url` (or use a production config) to serve the built web assets from the app bundle again.

### Deep Links

Declare the custom URL scheme in the platform configuration (see [Configuration](#configuration)) and listen to the standard `@capacitor/app` event:

```typescript
import { App } from '@capacitor/app';

await App.addListener('appUrlOpen', ({ url }) => {
  console.log('App opened with URL:', url);
});
```

Deep links opened while the app is running are routed to the running instance (single instance is enforced by default); the URL that launched the app is available via `App.getLaunchUrl()`.

### Debugging

The platform keeps Electron's default application menu, so the Chromium DevTools can be opened at any time via _View → Toggle Developer Tools_ or the keyboard shortcut:

| Operating System | Shortcut                                          |
| ---------------- | ------------------------------------------------- |
| macOS            | <kbd>Cmd</kbd> + <kbd>Option</kbd> + <kbd>I</kbd> |
| Windows          | <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>I</kbd> |
| Linux            | <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>I</kbd> |

To open the DevTools automatically on launch (e.g. to catch logs from early app startup), use the `onWindowCreated` hook in `electron/capacitor.electron.config.ts`:

```typescript
import { defineConfig } from '@capawesome/capacitor-electron/config';

export default defineConfig({
  // ...
  hooks: {
    onWindowCreated: window => {
      window.webContents.openDevTools();
    },
  },
});
```

## Migration

You can use our **AI-Assisted Migration** to migrate from [`@capacitor-community/electron`](https://github.com/capacitor-community/electron).
Add the [Capawesome Skills](https://github.com/capawesome-team/skills) to your AI tool using the following command:

```bash
npx skills add capawesome-team/skills --skill capacitor-platforms
```

Then use the following prompt:

```
Use the `capacitor-platforms` skill from `capawesome-team/skills` to migrate my project from `@capacitor-community/electron` to `@capawesome/capacitor-electron`.
```

If you prefer **Manual Migration**, perform the following steps:

1. Back up anything you customized in your existing `electron/` directory (icons, electron-builder configuration, and any code you added to the generated runtime files).
2. Remove the old platform and its `electron/` directory:
   ```bash
   npm uninstall @capacitor-community/electron
   rm -rf electron
   ```
3. Add this platform:
   ```bash
   npm install @capawesome/capacitor-electron
   npx cap add @capawesome/capacitor-electron
   cd electron && npm install && cd ..
   ```
4. Re-apply your customizations through the typed options in `electron/capacitor.electron.config.ts` (window options, deep-link scheme, CSP overrides, tray/menu via hooks) instead of editing runtime code, and restore your icons to `electron/assets/` and your electron-builder settings in `electron/electron-builder.config.js`.
5. Sync and run (always with the full package name):
   ```bash
   npx cap sync @capawesome/capacitor-electron
   npx cap run @capawesome/capacitor-electron
   ```

Notes:

- Deep links no longer require hand-written runtime code — declare the scheme in the platform config and listen to `@capacitor/app`'s `appUrlOpen` event.
- Plugins must provide an electron implementation for this platform's contract (see [Plugin Development](#plugin-development)); implementations written for the old platform are not loaded. Plugins whose web implementation is sufficient continue to work unchanged via the automatic fallback.

## Plugin Development

Plugins declare their electron implementation via `package.json`:

```json
{
  "capacitor": {
    "electron": { "src": "electron" }
  }
}
```

The implementation is an ES module at `<src>/dist/plugin.mjs` exporting plugin classes. A plugin class declares its Capacitor registration name and its public API via static metadata — the static property is the contract, so no build-time dependency on this package is required:

```ts
class SqliteImpl {
  constructor({ config, services, notifyListeners }) { ... }

  async open(options) { ... }
  async query(options) { ... }

  // Not declared below, therefore never bridged.
  resolvePath(path) { ... }
}

// Equivalent: import { defineElectronPlugin } from '@capawesome/capacitor-electron/plugin';
SqliteImpl.__capacitorElectronPlugin = {
  name: 'Sqlite',
  methods: ['open', 'query'],
};

export { SqliteImpl as Sqlite };
```

The declared `methods` array is the plugin's entire bridged surface: anything not listed stays main-process-internal, and a declared method that is missing on the class fails loudly at boot. Each class is instantiated once in the main process (full Node and Electron API access) and exposed under its registration name through Capacitor's native plugin path — `registerPlugin('Sqlite', { web: ... })` just works, with the web implementation as the automatic fallback for platforms the plugin doesn't cover. No `electron` key in the plugin's `registerPlugin` wiring is needed.

The constructor context provides:

- `config` — the app's Capacitor configuration.
- `notifyListeners(eventName, data)` — emits a plugin event, mirroring Capacitor's native `notifyListeners`. Web listeners use the standard `addListener(eventName, callback)` / `PluginListenerHandle` API.
- `services` — platform primitives (currently `services.bundles`: web-bundle serving, reload, and the failed-boot rollback watchdog).

At sync time the platform statically scans the app's dependencies and generates a plugin manifest — no plugin code runs outside Electron. Results, thrown `Error`s, and their `code` properties cross the bridge with Capacitor semantics.

## Packaging

The scaffolded `electron/` project packages with electron-builder:

```bash
cd electron && npm run pack
```

The `pack` script runs three steps: compile (`tsc`), **vendor**, and `electron-builder`. The vendor step (`capacitor-electron vendor`) copies the platform runtime, every plugin's electron implementation, and their dependency closure (production, peer, and installed optional dependencies) into `electron/vendor/`, which the scaffolded electron-builder config maps to `node_modules` inside the packaged app — so module resolution works identically in development (from your app root) and in the package, without a second `npm install` and without version drift.

Code signing, notarization, targets (dmg/msi/nsis/AppImage/deb), and icons are standard electron-builder configuration in the user-owned `electron-builder.config.js` — see https://www.electron.build. Electron Forge is a supported alternative: run `capacitor-electron vendor` before packaging and include `vendor/node_modules` as the app's `node_modules`.

### App Updates

Two independent update layers, matching mobile:

- **Binary updates** (Electron itself, the runtime, native modules): use [electron-updater](https://www.electron.build/auto-update) — the desktop analog of an app-store update. Wire it in your `main.ts`; it operates on the packaged artifacts produced above.
- **Web-bundle updates**: the platform ships the serving primitive only — `services.bundles` (activate a bundle directory, reload, boot-ready signal, and a failed-boot rollback watchdog that reverts to the previous bundle if the renderer doesn't confirm startup). The OTA update product on top of it (download, channels, verification) is deliberately not part of the platform.

## Electron Support Policy

- **Floor**: Electron 28 (required for the runtime's serving APIs). No ceiling — the scaffold uses a caret range you control, and the platform releases only when Electron actually breaks an API it uses.
- **Tested**: CI runs the example app against the latest stable Electron and the floor on every release.
- Electron ships a new major roughly every 8 weeks. This platform's wide peer range means you can adopt new Electron majors immediately, without waiting for a platform release.

## Limitations

Read this before committing to the platform — these are inherent trade-offs, not bugs:

- **Binary size and memory.** Every app ships its own Chromium and Node: expect roughly 80–150 MB installed and a matching memory footprint. If minimal footprint is the priority, Electron is the wrong tool.
- **Plugins need an electron implementation.** Only Capacitor plugins that ship an `electron` implementation (or whose web implementation is sufficient — the automatic fallback) work. iOS/Android native code does not translate.
- **Native Node addons are not rebuilt automatically.** If a plugin's electron implementation depends on native Node modules, `capacitor-electron vendor` detects and reports them, but you must rebuild them against Electron's ABI yourself (e.g. `@electron/rebuild`) before packaging.
- **No web-bundle OTA product included.** The platform provides the serving primitive (`services.bundles`) only; update delivery, channels, and verification are a separate product layer.
- **Always pass the platform name to the Capacitor CLI.** A bare `npx cap sync` only processes iOS/Android/web; `npx cap sync electron` resolves to the `electron` npm package and silently does nothing. Use the full package name (see the note under Installation).
- **Desktop is not mobile.** APIs like geolocation permission prompts, status bars, or app-store review flows have no desktop equivalent; plugins whose web implementation assumes a mobile browser may behave differently on desktop Chromium.

## FAQ

### Can I use any Capacitor plugin with this platform?

Plugins with a dedicated Electron implementation or a sufficient web implementation work (see [Supported Plugins](#supported-plugins)). Plugins that only ship iOS/Android native code do not.

### How do I update Electron in my app?

Update the `electron` version in `electron/package.json` and run `npm install` there. The platform supports Electron 28 and later with no upper bound.

### Does `Capacitor.getPlatform()` return `electron`?

Yes. `Capacitor.getPlatform()` returns `'electron'` and `Capacitor.isNativePlatform()` returns `true`, so you can branch platform-specific code the same way as on iOS and Android.

## Related Plugins

- [Capacitor SQLite plugin](https://capawesome.io/docs/sdks/capacitor/sqlite/) — local SQL database with a native Electron implementation.

## Newsletter

Stay up to date with the latest news and updates about the Capawesome, Capacitor, and Ionic ecosystem by subscribing to our [Capawesome Newsletter](https://capawesome.io/newsletter/).

## Changelog

See [CHANGELOG.md](https://github.com/capawesome-team/capacitor-electron/blob/main/CHANGELOG.md).

## License

See [LICENSE](https://github.com/capawesome-team/capacitor-electron/blob/main/LICENSE).

[^1]: This project is not affiliated with, endorsed by, sponsored by, or approved by the OpenJS Foundation or any of its affiliates. `Electron` is a trademark of the OpenJS Foundation.
