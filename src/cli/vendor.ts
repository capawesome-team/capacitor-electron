import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'fs';
import { dirname, join, relative } from 'path';

import type { PluginManifest } from '../shared/definitions';

import { fail, logInfo, logWarn } from './log';

interface PackageJson {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  capacitor?: { electron?: { src?: string } };
}

interface VendoredPackage {
  version: string;
  vendorDir: string;
}

/**
 * Never vendored: provided by the Electron runtime / the packaging tool.
 */
const EXCLUDED_PACKAGES = new Set(['electron']);

const PLATFORM_PACKAGE_NAME = '@capawesome/capacitor-electron';

/**
 * Prepares the user-owned `electron/` project for packaging. electron-builder
 * only includes files inside the project, but at runtime the platform and the
 * plugins are resolved from the app root `node_modules`. This command copies
 * them — plus their production, peer, and installed optional dependency
 * closure — into
 * `electron/vendor/node_modules`, which the scaffolded electron-builder
 * config maps to `node_modules` inside the packaged app, so the exact same
 * module resolution works there.
 *
 * Runs with cwd = the `electron/` directory (via the scaffolded `pack`
 * script); needs no Capacitor CLI environment.
 */
export function vendorCommand(): void {
  const electronDir = process.cwd();
  const rootDir = dirname(electronDir);
  const manifestPath = join(electronDir, 'generated', 'plugin-manifest.json');
  if (!existsSync(manifestPath)) {
    fail(
      `${manifestPath} is missing. Run \`npx cap sync ${PLATFORM_PACKAGE_NAME}\` first.`,
    );
  }
  const manifest = JSON.parse(
    readFileSync(manifestPath, 'utf8'),
  ) as PluginManifest;
  const vendorRoot = join(electronDir, 'vendor', 'node_modules');
  rmSync(join(electronDir, 'vendor'), { recursive: true, force: true });
  mkdirSync(vendorRoot, { recursive: true });

  const vendored = new Map<string, VendoredPackage>();
  const nativePackages = new Set<string>();

  // The platform runtime itself (only what the packaged app executes).
  const platformDir = join(__dirname, '..', '..');
  vendorSubset(platformDir, join(vendorRoot, PLATFORM_PACKAGE_NAME), [
    'package.json',
    'LICENSE',
    'dist',
  ]);
  vendored.set(PLATFORM_PACKAGE_NAME, {
    version: readPackageJson(platformDir).version,
    vendorDir: join(vendorRoot, PLATFORM_PACKAGE_NAME),
  });

  for (const plugin of manifest.plugins) {
    const packageDir = findPackageDir(rootDir, plugin.packageName);
    if (!packageDir) {
      return fail(
        `${plugin.packageName} is not installed in ${rootDir}. Run \`npm install\` and \`npx cap sync ${PLATFORM_PACKAGE_NAME}\` first.`,
      );
    }
    const packageJson = readPackageJson(packageDir);
    const electronSrc = packageJson.capacitor?.electron?.src ?? 'electron';
    const vendorDir = join(vendorRoot, plugin.packageName);
    // A plugin's electron implementation is a self-contained bundle; only
    // the bundle and the package manifest are needed.
    vendorSubset(packageDir, vendorDir, [
      'package.json',
      'LICENSE',
      join(electronSrc, 'dist'),
    ]);
    vendored.set(plugin.packageName, {
      version: packageJson.version,
      vendorDir,
    });
    vendorDependencyClosure(
      packageDir,
      packageJson,
      vendorDir,
      vendorRoot,
      vendored,
      nativePackages,
    );
  }

  logInfo(
    `Vendored ${vendored.size} package(s) into ${join(electronDir, 'vendor')}.`,
  );
  if (nativePackages.size > 0) {
    logWarn(
      `Native Node modules detected (${[...nativePackages].join(', ')}). ` +
        'They must be rebuilt against the Electron ABI before packaging (e.g. with @electron/rebuild); automatic rebuilding of vendored plugin dependencies is not performed yet.',
    );
  }
}

function vendorDependencyClosure(
  dependentDir: string,
  dependentPackageJson: PackageJson,
  dependentVendorDir: string,
  vendorRoot: string,
  vendored: Map<string, VendoredPackage>,
  nativePackages: Set<string>,
): void {
  const dependencies = {
    ...dependentPackageJson.optionalDependencies,
    ...dependentPackageJson.peerDependencies,
    ...dependentPackageJson.dependencies,
  };
  for (const dependencyName of Object.keys(dependencies)) {
    if (
      EXCLUDED_PACKAGES.has(dependencyName) ||
      dependencyName === PLATFORM_PACKAGE_NAME
    ) {
      continue;
    }
    const dependencyDir = findPackageDir(dependentDir, dependencyName);
    if (!dependencyDir) {
      const optional =
        dependentPackageJson.optionalDependencies?.[dependencyName] !==
          undefined ||
        dependentPackageJson.peerDependencies?.[dependencyName] !== undefined;
      if (optional) {
        continue;
      }
      return fail(
        `Cannot resolve dependency ${dependencyName} of ${dependentPackageJson.name}.`,
      );
    }
    const dependencyPackageJson = readPackageJson(dependencyDir);
    const existing = vendored.get(dependencyName);
    if (existing && existing.version === dependencyPackageJson.version) {
      continue;
    }
    // First occurrence goes to the top level; a conflicting version nests
    // under its dependent, matching Node resolution semantics.
    const vendorDir = existing
      ? join(dependentVendorDir, 'node_modules', dependencyName)
      : join(vendorRoot, dependencyName);
    cpSync(dependencyDir, vendorDir, {
      recursive: true,
      dereference: true,
      // Nested node_modules are handled by the closure walk itself.
      filter: source =>
        !relative(dependencyDir, source)
          .split(/[\\/]/)
          .includes('node_modules'),
    });
    if (!existing) {
      vendored.set(dependencyName, {
        version: dependencyPackageJson.version,
        vendorDir,
      });
    }
    if (
      existsSync(join(dependencyDir, 'binding.gyp')) ||
      existsSync(join(dependencyDir, 'prebuilds'))
    ) {
      nativePackages.add(dependencyName);
    }
    vendorDependencyClosure(
      dependencyDir,
      dependencyPackageJson,
      vendorDir,
      vendorRoot,
      vendored,
      nativePackages,
    );
  }
}

function vendorSubset(
  sourceDir: string,
  targetDir: string,
  entries: string[],
): void {
  mkdirSync(targetDir, { recursive: true });
  for (const entry of entries) {
    const sourcePath = join(sourceDir, entry);
    if (existsSync(sourcePath)) {
      cpSync(sourcePath, join(targetDir, entry), {
        recursive: true,
        dereference: true,
      });
    }
  }
}

/**
 * Node's module resolution for bare specifiers, without touching `exports`
 * maps: walk `node_modules` directories from `fromDir` upwards.
 */
function findPackageDir(fromDir: string, packageName: string): string | null {
  let currentDir = fromDir;
  for (;;) {
    const candidate = join(currentDir, 'node_modules', packageName);
    if (existsSync(join(candidate, 'package.json'))) {
      return candidate;
    }
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }
    currentDir = parentDir;
  }
}

const readPackageJson = (packageDir: string): PackageJson =>
  JSON.parse(
    readFileSync(join(packageDir, 'package.json'), 'utf8'),
  ) as PackageJson;
