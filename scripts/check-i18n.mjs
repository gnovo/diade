// Checks translation-key usage in the mobile app against the English catalog.
//   error:   t('some.key') used in source but not defined in en.ts  (would render the raw key)
//   warning: key defined in en.ts but never referenced in source    (dead copy)
// en/pt-PT key parity and placeholders are covered by packages/i18n/src/catalog.test.ts.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { en } from '../packages/i18n/src/locales/en.ts';

const flatten = (tree, prefix = '') =>
  Object.entries(tree).flatMap(([k, v]) =>
    typeof v === 'string' ? [prefix + k] : flatten(v, `${prefix}${k}.`),
  );

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? e.name === 'node_modules'
        ? []
        : walk(join(dir, e.name))
      : /\.(tsx?|jsx?)$/.test(e.name) && !/\.test\./.test(e.name)
        ? [join(dir, e.name)]
        : [],
  );

// Plural/context suffixes resolve to a base key at runtime.
const base = (key) => key.replace(/_(zero|one|two|few|many|other)$/, '');
const defined = new Set(flatten(en).map(base));
const source = walk('apps/mobile/src')
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

const used = new Set([...source.matchAll(/\bt\(\s*['"`]([\w.-]+)['"`]/g)].map((m) => m[1]));
// Dynamic keys like t(`weekday.${n}`) -> treat the literal prefix as "used".
const dynamicPrefixes = [...source.matchAll(/\bt\(\s*`([\w.-]+\.)\$\{/g)].map((m) => m[1]);

const missing = [...used].filter((k) => !defined.has(k));
const unused = [...defined].filter(
  (k) =>
    !used.has(k) && !dynamicPrefixes.some((p) => k.startsWith(p)) && !source.includes(`'${k}'`),
);

for (const k of unused) console.warn(`warn  unused key: ${k}`);
for (const k of missing) console.error(`error missing key: ${k}`);
console.log(`i18n: ${defined.size} keys, ${missing.length} missing, ${unused.length} unused`);
process.exit(missing.length ? 1 : 0);
