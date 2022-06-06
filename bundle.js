const esbuild = require('esbuild')
const plugin = require('node-stdlib-browser/helpers/esbuild/plugin');
const stdLibBrowser = require('node-stdlib-browser');

// Automatically exclude all node_modules from the bundled version
// const { nodeExternalsPlugin } = require('esbuild-node-externals')

esbuild.build({
  entryPoints: ['./src/index.ts'],
  outfile: 'dist/bundle.js',
  bundle: true,
  minify: true,
  platform: 'browser', //node
  sourcemap: true,
  target: 'node16',
  // external: ["fs"],
  inject: [require.resolve('node-stdlib-browser/helpers/esbuild/shim')],
  define: {
    global: 'global',
    process: 'process',
    Buffer: 'Buffer'
  },
  
  plugins: [plugin(stdLibBrowser)],
  format: 'iife',
  globalName: 'Vert'
}).catch(() => process.exit(1))