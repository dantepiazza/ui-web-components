// Bundles each component (Lit included, no external imports) into a single classic
// script per component under components/dist/. Classic <script src="..."> tags
// work when a doc page is opened directly via file:// — type="module" imports do not,
// since Chrome blocks cross-origin module fetches under the file:// "null" origin.
//
// Also produces ONE combined components/dist/ui-web-components.js with every
// component in a single file, for consumers who just want two <script>/<link> tags
// instead of 90+.
//
// Every output file (both the per-component ones and the combined bundle) gets
// uiwc-core-banner.js prepended via esbuild's `banner` option — that's what makes
// `window.__uiwc.register()` solve the capture-order bug dynamically (inspecting the
// real DOM at boot to decide define() order) instead of needing a hand-maintained
// list of "these components nest inside those" here. See uiwc-core-banner.js for
// the actual mechanism and ROADMAP.md ("Bug de arquitectura encontrado") for the
// history — a fixed tiered order used to live in this file and was replaced by that
// dynamic approach specifically because it doesn't scale to compositions nobody
// anticipated.
import { readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const srcDir = join(rootDir, 'components');
const outDir = join(rootDir, 'components/dist');
const banner = readFileSync(join(rootDir, 'scripts/uiwc-core-banner.js'), 'utf8');

const componentDirs = readdirSync(srcDir, { withFileTypes: true }).filter(
  (entry) => entry.isDirectory() && entry.name !== 'dist'
);
const entryPoints = componentDirs.map((entry) => join(srcDir, entry.name, `${entry.name}.js`));

await esbuild.build({
  entryPoints,
  bundle: true,
  format: 'iife',
  outdir: outDir,
  entryNames: '[name]',
  banner: { js: banner },
});

for (const entry of entryPoints) {
  console.log(`built ${basename(entry)} -> dist/${basename(entry)}`);
}

const combinedNames = componentDirs.map((e) => e.name).filter((n) => n !== 'register');
const combinedEntrySource = combinedNames.map((name) => `import '../${name}/${name}.js';`).join('\n');

await esbuild.build({
  stdin: {
    contents: combinedEntrySource,
    resolveDir: join(srcDir, 'dist'), // relative imports above resolve as if this file lived in dist/
    sourcefile: 'ui-web-components-entry.js',
  },
  bundle: true,
  format: 'iife',
  outfile: join(outDir, 'ui-web-components.js'),
  banner: { js: banner },
});
console.log('built ui-web-components.js -> dist/ui-web-components.js (bundle combinado)');

// Config helper for consumers on the Tailwind Play CDN (cdn.tailwindcss.com) instead
// of the precompiled CSS — registers the semantic colour names so `bg-brand-900`,
// `bg-base-*`, `bg-sidebar` etc. get generated. Load it right after the CDN <script>.
// (Consumers using ui-web-components.css don't need this — the CSS already has it.)
import { copyFileSync } from 'node:fs';
copyFileSync(
  join(rootDir, 'docs/js/uiwc-tailwind.js'),
  join(outDir, 'ui-web-components.tailwind.js')
);
console.log('built ui-web-components.tailwind.js -> dist/ui-web-components.tailwind.js (config Play CDN)');
