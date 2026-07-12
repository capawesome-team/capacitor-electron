# Example app

Vite web app + the scaffolded `electron/` platform project, used by the
packaged-app e2e tests. The plugin bridge is exercised by a committed test
fixture (`local-plugins/echo`) — methods, events, and error codes — through
real `@capacitor/core` `registerPlugin` calls.

## Setup

Build the plugin first (the Capacitor hooks run `dist/cli/index.js` from the repo root):

```bash
cd .. && npm install && npm run build && cd example
```

Then install the example's dependencies:

```bash
npm install
cd electron && npm install && cd ..
```

## Run

```bash
npm run build && npm run sync
npx cap run @capawesome/capacitor-electron
```

## E2E (packaged app)

```bash
npm run e2e:prepare   # vite build + cap sync + electron-builder --dir
npm run e2e           # Playwright drives the packaged binary
```
