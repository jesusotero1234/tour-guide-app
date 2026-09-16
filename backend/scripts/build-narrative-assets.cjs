// Bundle the existing author resources, preserving their relative paths.
const { mkdirSync, copyFileSync } = require('node:fs');
const { resolve, dirname } = require('node:path');
for (const name of [
  'operations/narrative-author-context-pack-20260906/malagueta-oneshot.md',
  'operations/narrative-plaza-mayor-reference-20260905.md',
  'tours/regla-editorial-fechas-audioguias.md',
]) {
  const target = resolve(__dirname, '../dist-generation/docs', name);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(resolve(__dirname, '../../docs', name), target);
}
