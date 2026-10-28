#!/usr/bin/env node
/**
 * Copia el export estático del inspector a public/inspector
 * para servirlo junto a las funciones /api en el mismo proyecto Vercel.
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'apps/inspector/out');
const dest = resolve(root, 'public/inspector');

rmSync(dest, { recursive: true, force: true });
mkdirSync(resolve(root, 'public'), { recursive: true });
cpSync(out, dest, { recursive: true });

// También publicar /public/pasajero para acceso directo sin /inspector
const pasajeroOut = resolve(out, 'pasajero');
const pasajeroDest = resolve(root, 'public/pasajero');
if (existsSync(pasajeroOut)) {
  rmSync(pasajeroDest, { recursive: true, force: true });
  cpSync(pasajeroOut, pasajeroDest, { recursive: true });
}

writeFileSync(
  resolve(root, 'public/index.html'),
  `<!doctype html>
<html lang="es">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>El Urbano</title>
<body style="margin:0;font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#f8fafc;padding:32px">
<div style="max-width:480px;margin:0 auto;background:#1e293b;padding:24px;border-radius:12px;border:1px solid #334155;text-align:center">
  <h1 style="color:#ef4444;margin:0 0 8px">El Urbano</h1>
  <p style="color:#94a3b8;margin:0 0 24px">Sistema GPS y Monitoreo de Colectivos</p>
  <div style="display:flex;flex-direction:column;gap:12px">
    <a href="/inspector/pasajero/" style="background:#2563eb;color:#fff;padding:12px;border-radius:8px;text-decoration:none;font-weight:bold">Mapa Pasajero (Público)</a>
    <a href="/inspector/" style="background:#dc2626;color:#fff;padding:12px;border-radius:8px;text-decoration:none;font-weight:bold">Panel Inspector</a>
  </div>
</div>
</body>
</html>
`,
);

console.log('Panel publicado en /inspector y /pasajero');
