#!/usr/bin/env node
/**
 * Deriva el catálogo chico (id, número, nombre) desde urbano-lines.json.
 * No inventa recorridos: solo proyecta el catálogo municipal que ya está en el repo.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const full = JSON.parse(readFileSync(resolve(root, 'apps/inspector/src/data/urbano-lines.json'), 'utf8'));
const slim = full.map((l) => ({ id: l.id, number: String(l.number), name: l.name }));
const json = JSON.stringify(slim, null, 2) + '\n';
for (const rel of ['lib/muni-lines.json', 'apps/driver/data/muni-lines.json']) {
  writeFileSync(resolve(root, rel), json);
}
console.log(`Catálogo municipal: ${slim.length} líneas`);
