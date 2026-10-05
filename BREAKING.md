# Breaking Changes

This is a comprehensive list of the breaking changes introduced in the major version releases.

## Versions

- [Version 0.2.x](#version-02xx)

## Version 0.2.x

### Stateless `BundleService`

The `services.bundles` platform service (interface `BundlesService`, now `BundleService`) no longer persists the active bundle, arms a boot watchdog, or rolls back. It is an in-memory switch of the served directory only:

- `setActiveBundle(bundleDirectory: string | null): void` is now synchronous and no longer accepts the `{ bootWatchdog }` option.
- `notifyBootReady()` has been removed.
- The persisted state file `capacitor-electron-bundles.json` in the user data directory is no longer read or written.

A plugin that keeps a bundle active across restarts must persist that state itself and re-apply it in its `load()` lifecycle hook, and must own failed-boot rollback. The Capacitor Live Update plugin (8.5.0 or later) does this.
