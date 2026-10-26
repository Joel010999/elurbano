#!/usr/bin/env node
/**
 * Copia el export estático del inspector a public/inspector
 * para servirlo junto a las funciones /api en el mismo proyecto Vercel.
 */
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'apps/inspector/out');
const dest = resolve(root, 'public/inspector');

rmSync(dest, { recursive: true, force: true });
mkdirSync(resolve(root, 'public'), { recursive: true });
cpSync(out, dest, { recursive: true });

writeFileSync(
  resolve(root, 'public/index.html'),
  `<!doctype html>
<html lang="es">
<meta charset="utf-8">
<title>El Urbano</title>
<meta http-equiv="refresh" content="0;url=/inspector/">
<body style="margin:0;font-family:system-ui,sans-serif">
<p style="margin:0;border-top:8px solid #e53935;padding:24px">El Urbano · <a href="/inspector/">Abrir el panel</a></p>
</body>
</html>
`,
);

console.log('Panel publicado en /inspector');
