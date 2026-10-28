#!/usr/bin/env node
/**
 * Copia los assets que tsc no emite (JSON importados) a dist/.
 * Reemplaza a `cp lib/muni-lines.json dist/lib/`, que no existe en Windows.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = ['lib/muni-lines.json'];

for (const rel of assets) {
  const from = resolve(root, rel);
  const to = resolve(root, 'dist', rel);
  if (!existsSync(from)) {
    console.error(`Falta ${rel}`);
    process.exit(1);
  }
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  console.log(`Copiado ${rel} -> dist/${rel}`);
}
