export interface ElectronPluginPackageJson {
  capacitor?: { electron?: { src?: string } };
}

/**
 * The directory (relative to the package root) holding a plugin's electron
 * implementation, or `undefined` when the package declares none. Like the
 * Capacitor CLI for `android`/`ios`, the presence of the platform key marks
 * an implementation and `src` defaults to the platform name.
 */
export const getElectronSrc = (
  packageJson: ElectronPluginPackageJson,
): string | undefined =>
  packageJson.capacitor?.electron
    ? (packageJson.capacitor.electron.src ?? 'electron')
    : undefined;
