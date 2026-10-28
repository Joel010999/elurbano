#!/usr/bin/env node
/**
 * API local de El Urbano. Compilá antes: npm run dev:api (tsc + este server).
 * Misma lógica que la función de Vercel en /api/urbano/[...path].
 * Solo para desarrollo: no se despliega (Vercel usa api/urbano/[...path].ts).
 */
import http from 'node:http';
import { URL } from 'node:url';
import { createRequire } from 'node:module';
import { readFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { resolve, dirname, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = resolve(root, 'public');

// Prioridad: variables reales del proceso > .env.local > .env (ninguno se sube a git).
for (const name of ['.env.local', '.env']) {
  const envPath = resolve(root, name);
  if (!existsSync(envPath)) continue;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
}

const dist = resolve(root, 'dist');
if (!existsSync(resolve(dist, 'lib/routes/dispatch.js'))) {
  console.error('Falta dist/. Corré: npm run build:api (o npm run build)');
  process.exit(1);
}

function load(rel) {
  const mod = require(resolve(dist, rel));
  return mod.default || mod;
}

const dispatch = load('lib/routes/dispatch.js');

const PORT = Number(process.env.PORT || 3000);

const ALLOWED_ORIGIN_PATTERNS = [
  /^http:\/\/localhost(:[0-9]+)?$/,
  /^http:\/\/127\.0\.0\.1(:[0-9]+)?$/,
  /^http:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:[0-9]+)?$/,
  /^https:\/\/[a-zA-Z0-9-]+\.(ngrok-free\.app|trycloudflare\.com|loca\.lt|vercel\.app|railway\.app|up\.railway\.app)$/,
];

function isOriginAllowed(origin, host) {
  if (!origin) return false;
  const clean = origin.trim().replace(/\/$/, '');
  if (host) {
    const hostOnly = host.split(':')[0];
    if (clean === `http://${host}` || clean === `https://${host}` || clean.includes(hostOnly)) return true;
  }
  const custom = (process.env.URBANO_CORS_ORIGINS || '').split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean);
  if (custom.includes(clean)) return true;
  return ALLOWED_ORIGIN_PATTERNS.some((pat) => pat.test(clean));
}

const CORS_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
const CORS_HEADERS = 'Content-Type, Authorization, X-Identificador';

/** Cabeceras CORS para este request. Pisan el "*" que ponen los handlers (lib/cors.ts). */
function corsHeaders(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  const headers = {
    Vary: 'Origin',
    'Access-Control-Allow-Origin': undefined,
    'Access-Control-Allow-Methods': undefined,
    'Access-Control-Allow-Headers': undefined,
    'Access-Control-Max-Age': undefined,
  };
  if (origin && isOriginAllowed(origin, host)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = CORS_METHODS;
    headers['Access-Control-Allow-Headers'] = CORS_HEADERS;
    headers['Access-Control-Max-Age'] = '600';
  }
  return headers;
}

/** Mezcla cabeceras sin dejar duplicados por mayúsculas y quitando las undefined. */
function mergeHeaders(...sources) {
  const out = {};
  const keys = {};
  for (const src of sources) {
    for (const [k, v] of Object.entries(src)) {
      const lower = k.toLowerCase();
      if (keys[lower]) delete out[keys[lower]];
      keys[lower] = k;
      if (v !== undefined) out[k] = v;
    }
  }
  return out;
}

function sendJson(req, res, status, obj) {
  res.writeHead(status, mergeHeaders({ 'Content-Type': 'application/json; charset=utf-8' }, corsHeaders(req)));
  res.end(JSON.stringify(obj));
}

function callHandler(handler, req, res, query, body) {
  let status = 200;
  const headers = {};
  let ended = false;
  const vres = {
    setHeader(k, v) {
      headers[k] = v;
      return vres;
    },
    status(code) {
      status = code;
      return vres;
    },
    json(obj) {
      if (ended) return vres;
      ended = true;
      res.writeHead(
        status,
        mergeHeaders(headers, { 'Content-Type': 'application/json; charset=utf-8' }, corsHeaders(req)),
      );
      res.end(JSON.stringify(obj));
      return vres;
    },
    end(data) {
      if (ended) return vres;
      ended = true;
      res.writeHead(status, mergeHeaders(headers, corsHeaders(req)));
      res.end(data ?? '');
      return vres;
    },
  };
  const vreq = { method: req.method, headers: req.headers, query, body, url: req.url };
  return Promise.resolve(handler(vreq, vres)).then(() => {
    if (!ended) sendJson(req, res, 500, { error: 'Sin respuesta' });
  });
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(req, res, targetPath) {
  const safe = normalize(targetPath);
  if (!safe.startsWith(publicDir)) return false;
  if (!existsSync(safe)) return false;

  const stat = statSync(safe);
  if (stat.isDirectory()) {
    const indexFile = join(safe, 'index.html');
    if (existsSync(indexFile)) {
      return serveStatic(req, res, indexFile);
    }
    return false;
  }

  const ext = extname(safe).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const headers = {
    'Content-Type': contentType,
    'Content-Length': stat.size,
  };

  if (safe.includes('_next') && (safe.includes('/static/') || safe.includes('\\static\\'))) {
    headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  } else if (ext === '.html') {
    headers['Cache-Control'] = 'no-cache';
  } else {
    headers['Cache-Control'] = 'public, max-age=3600';
  }

  res.writeHead(200, mergeHeaders(headers, corsHeaders(req)));
  if (req.method === 'HEAD') {
    res.end();
  } else {
    createReadStream(safe).pipe(res);
  }
  return true;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin;
    if (origin && !isOriginAllowed(origin, req.headers.host)) {
      console.warn(`CORS: origen no permitido ${origin}. Agregalo a URBANO_CORS_ORIGINS si es tuyo.`);
      res.writeHead(403, mergeHeaders(corsHeaders(req)));
      return res.end();
    }
    res.writeHead(204, mergeHeaders(corsHeaders(req)));
    return res.end();
  }

  const u = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const path = u.pathname.replace(/\/$/, '') || '/';
  const query = Object.fromEntries(u.searchParams.entries());

  try {
    if (req.method === 'GET' && path === '/health') {
      return sendJson(req, res, 200, { ok: true, status: 'healthy', timestamp: new Date().toISOString() });
    }

    if (path === '/api/urbano' || path.startsWith('/api/urbano/')) {
      const body = req.method === 'GET' || req.method === 'HEAD' ? {} : await readBody(req);
      return await callHandler(dispatch, req, res, query, body);
    }

    // Servir frontend estático en producción (Inspector, Pasajero, landing page)
    if (req.method === 'GET' || req.method === 'HEAD') {
      let decodedPath = '';
      try {
        decodedPath = decodeURIComponent(u.pathname);
      } catch {
        decodedPath = u.pathname;
      }

      if (decodedPath === '/') {
        if (serveStatic(req, res, join(publicDir, 'index.html'))) return;
      }

      const direct = join(publicDir, decodedPath.replace(/^\//, ''));
      if (serveStatic(req, res, direct)) return;

      if (serveStatic(req, res, join(direct, 'index.html'))) return;

      if (serveStatic(req, res, direct + '.html')) return;

      // 404 estático si existe
      const notFoundHtml = join(publicDir, 'inspector/404.html');
      if (existsSync(notFoundHtml)) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        createReadStream(notFoundHtml).pipe(res);
        return;
      }
    }

    return sendJson(req, res, 404, { error: 'Not found' });
  } catch (e) {
    console.error(e);
    if (!res.headersSent) sendJson(req, res, 500, { error: 'Error interno' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`El Urbano servidor en http://0.0.0.0:${PORT}`);
  console.log(`Rutas disponibles:`);
  console.log(`  - /health (monitoreo de salud)`);
  console.log(`  - /api/urbano/* (API de flota, choferes y despacho)`);
  console.log(`  - /inspector/ (panel de control para inspectores)`);
  console.log(`  - /inspector/pasajero/ (mapa público para pasajeros)`);
  console.log(`  - /pasajero/ (acceso directo al mapa de pasajeros)`);
});
