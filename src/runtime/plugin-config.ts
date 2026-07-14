import type { CapacitorAppConfig } from '../shared/definitions';

export type PluginConfigOverrides = {
  [pluginName: string]: { [key: string]: unknown };
};

/**
 * Merges the Electron platform's per-plugin config overrides over the
 * `plugins` section of the Capacitor config. The merge is shallow per plugin
 * key: for every plugin, `plugins[name]` becomes
 * `{ ...capacitorConfig.plugins[name], ...overrides[name] }`, so the platform
 * override wins per key while unmentioned keys survive. Plugins present in
 * only one source pass through as-is, and everything outside `plugins` is
 * copied through untouched.
 *
 * Returns a new config; the inputs are never mutated. When there are no
 * overrides the original config is returned unchanged.
 */
export function mergePluginConfig(
  capacitorConfig: CapacitorAppConfig,
  overrides: PluginConfigOverrides | undefined,
): CapacitorAppConfig {
  if (!overrides) {
    return capacitorConfig;
  }
  const basePlugins = (capacitorConfig.plugins ?? {}) as PluginConfigOverrides;
  const mergedPlugins: PluginConfigOverrides = {};
  for (const name of new Set([
    ...Object.keys(basePlugins),
    ...Object.keys(overrides),
  ])) {
    mergedPlugins[name] = { ...basePlugins[name], ...overrides[name] };
  }
  return { ...capacitorConfig, plugins: mergedPlugins };
}
