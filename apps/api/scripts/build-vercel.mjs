// Bundles the API for the Vercel Function (D-127 demo deployment). Our TypeScript and the workspace package
// @tigeris/shared are compiled into one ES module; npm packages stay external and are traced from apps/api.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies ?? {}).filter((d) => !d.startsWith('@tigeris/'));

await build({
  entryPoints: [new URL('../src/vercel.ts', import.meta.url).pathname],
  outfile: new URL('../dist/vercel.mjs', import.meta.url).pathname,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external,
  logLevel: 'info',
});
