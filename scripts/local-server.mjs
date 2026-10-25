#!/usr/bin/env node
/**
 * Local El Urbano API for smoke + phone tunnel.
 * Same routes as /api/urbano/* ; in-memory store (or Upstash if env set).
 */
import http from 'node:http';
import { URL } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// load .env
const envPath = resolve(root, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
}

const CHOFER = process.env.URBANO_CHOFER_TOKEN || 'chofer-token-example';
const INSPECTOR = process.env.URBANO_INSPECTOR_TOKEN || 'inspector-token-example';
const PORT = Number(process.env.PORT || 3000);

/** @type {Map<string, Record<string, string>>} */
const store = new Map();

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function json(res, status, body) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}

function choferTokenFrom(req, body) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return body.choferToken || '';
}

function inspectorTokenFrom(req, body) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return body.inspectorToken || '';
}

const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const u = new URL(req.url || '/', `http://${req.headers.host}`);
  const path = u.pathname;

  try {
    if (req.method === 'GET' && path === '/health') {
      return json(res, 200, { ok: true, coches: store.size });
    }

    if (req.method === 'POST' && path === '/api/urbano/ping') {
      const body = await readBody(req);
      const token = choferTokenFrom(req, body);
      if (!body.cocheId || body.lat == null || body.lng == null || !body.timestamp) {
        return json(res, 400, { error: 'Missing required fields' });
      }
      if (token !== CHOFER) return json(res, 401, { error: 'Invalid chofer token' });
      const prev = store.get(body.cocheId) || {};
      store.set(body.cocheId, {
        ...prev,
        coche: body.cocheId,
        lat: String(body.lat),
        lng: String(body.lng),
        timestamp: body.timestamp,
        chofer: token.slice(0, 8),
        linea: prev.linea || body.linea || '',
        visibleEnColejuy: prev.visibleEnColejuy || 'false',
        disponible: prev.disponible || 'true',
      });
      return json(res, 200, { success: true, message: 'Ping saved' });
    }

    if (req.method === 'GET' && path === '/api/urbano/fleet') {
      const mode = u.searchParams.get('mode');
      if (mode !== 'inspector' && mode !== 'public') {
        return json(res, 400, { error: 'Invalid mode. Use ?mode=inspector or ?mode=public' });
      }
      const all = [...store.values()];
      if (mode === 'inspector') {
        return json(res, 200, {
          coches: all.map(c => ({
            id: c.coche,
            linea: c.linea || null,
            lastPing: { lat: +c.lat, lng: +c.lng, timestamp: c.timestamp },
            visibleEnColejuy: c.visibleEnColejuy === 'true',
            disponible: c.disponible !== 'false',
            chofer: c.chofer,
          })),
        });
      }
      return json(res, 200, {
        coches: all
          .filter(c => c.visibleEnColejuy === 'true')
          .map(c => ({
            id: c.coche,
            linea: c.linea || null,
            lastPing: { lat: +c.lat, lng: +c.lng, timestamp: c.timestamp },
          })),
      });
    }

    const lineaMatch = path.match(/^\/api\/urbano\/coche\/([^/]+)\/linea$/);
    if (req.method === 'PATCH' && lineaMatch) {
      const body = await readBody(req);
      if (inspectorTokenFrom(req, body) !== INSPECTOR) return json(res, 401, { error: 'Invalid inspector token' });
      const id = decodeURIComponent(lineaMatch[1]);
      const prev = store.get(id);
      if (!prev) return json(res, 404, { error: 'Coche not found' });
      store.set(id, { ...prev, linea: body.linea || '' });
      return json(res, 200, { success: true });
    }

    const visMatch = path.match(/^\/api\/urbano\/coche\/([^/]+)\/visibilidad$/);
    if (req.method === 'PATCH' && visMatch) {
      const body = await readBody(req);
      if (inspectorTokenFrom(req, body) !== INSPECTOR) return json(res, 401, { error: 'Invalid inspector token' });
      const id = decodeURIComponent(visMatch[1]);
      const prev = store.get(id);
      if (!prev) return json(res, 404, { error: 'Coche not found' });
      store.set(id, { ...prev, visibleEnColejuy: body.visibleEnColejuy ? 'true' : 'false' });
      return json(res, 200, { success: true });
    }

    return json(res, 404, { error: 'Not found' });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'Internal server error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`El Urbano API local en http://0.0.0.0:${PORT}`);
  console.log(`health: GET /health`);
});
