// Bundles src/storefront into the theme app extension's single JS asset.
import { build } from 'esbuild';
import { statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

const outfile = 'extensions/outfit-builder/assets/outfit-builder.js';
await build({
  entryPoints: ['src/storefront/index.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020', 'safari15', 'chrome90'],
  outfile,
  legalComments: 'none',
});

const bytes = statSync(outfile).size;
const gz = gzipSync(readFileSync(outfile)).length;
console.log(`built ${outfile}: ${(bytes / 1024).toFixed(1)} KB (${(gz / 1024).toFixed(1)} KB gzipped)`);
