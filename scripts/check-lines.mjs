#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const full = JSON.parse(readFileSync(resolve(root, 'apps/inspector/src/data/urbano-lines.json'), 'utf8'));
const expected = JSON.stringify(full.map((l) => ({ id: l.id, number: String(l.number), name: l.name })));
for (const rel of ['lib/muni-lines.json', 'apps/driver/data/muni-lines.json']) {
  const got = JSON.stringify(JSON.parse(readFileSync(resolve(root, rel), 'utf8')));
  if (got !== expected) {
    console.error(`${rel} no coincide con el catálogo municipal. Corré: node scripts/sync-muni-lines.mjs`);
    process.exit(1);
  }
}
console.log('Catálogo municipal OK');
