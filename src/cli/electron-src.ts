export interface ElectronPluginPackageJson {
  capacitor?: { electron?: { src?: string } };
}

/**
 * The directory (relative to the package root) holding a plugin's electron
 * implementation, or `undefined` when the package declares none.
 */
export const getElectronSrc = (
  packageJson: ElectronPluginPackageJson,
): string | undefined => packageJson.capacitor?.electron?.src;
