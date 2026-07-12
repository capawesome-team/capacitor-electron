import { chmodSync, readFileSync } from 'fs';
import { builtinModules } from 'module';

const external = id =>
  id === 'electron' || id.startsWith('node:') || builtinModules.includes(id);

// Inlines the compiled main-world shim (a standalone script, injected via
// `webFrame.executeJavaScript`) into the preload bundle as a string.
const inlineShimSource = () => ({
  name: 'inline-shim-source',
  transform(code) {
    if (code.includes('__SHIM_SOURCE__')) {
      const shimSource = readFileSync('build/shim/index.js', 'utf8');
      return {
        code: code.replaceAll('__SHIM_SOURCE__', JSON.stringify(shimSource)),
        map: null,
      };
    }
  },
});

const bundle = (name, { plugins = [], banner } = {}) => ({
  input: `build/${name}/index.js`,
  output: {
    file: `dist/${name}/index.js`,
    format: 'cjs',
    exports: 'auto',
    inlineDynamicImports: true,
    banner,
  },
  external,
  plugins,
});

// The cli bundle is also the package bin; it must be executable.
const executable = () => ({
  name: 'executable',
  writeBundle(options) {
    chmodSync(options.file, 0o755);
  },
});

export default [
  bundle('runtime'),
  bundle('preload', { plugins: [inlineShimSource()] }),
  bundle('cli', { banner: '#!/usr/bin/env node', plugins: [executable()] }),
  bundle('config'),
  bundle('plugin'),
];
