#!/usr/bin/env node
/**
 * API local de El Urbano. Compilá antes: npm run dev:api (tsc + este server).
 * Misma lógica que la función de Vercel en /api/urbano/[...path].
 */
import http from 'node:http';
import { URL } from 'node:url';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const envPath = resolve(root, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
}

const dist = resolve(root, 'dist');
if (!existsSync(resolve(dist, 'lib/routes/dispatch.js'))) {
  console.error('Falta dist/. Corré: npx tsc && cp lib/muni-lines.json dist/lib/');
  process.exit(1);
}

function load(rel) {
  const mod = require(resolve(dist, rel));
  return mod.default || mod;
}

const dispatch = load('lib/routes/dispatch.js');

const PORT = Number(process.env.PORT || 3000);

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
      res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(obj));
      return vres;
    },
    end(data) {
      if (ended) return vres;
      ended = true;
      res.writeHead(status, headers);
      res.end(data ?? '');
      return vres;
    },
  };
  const vreq = { method: req.method, headers: req.headers, query, body, url: req.url };
  return Promise.resolve(handler(vreq, vres)).then(() => {
    if (!ended) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Sin respuesta' }));
    }
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

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Identificador');
    res.writeHead(204);
    return res.end();
  }

  const u = new URL(req.url || '/', `http://${req.headers.host}`);
  const path = u.pathname.replace(/\/$/, '') || '/';
  const query = Object.fromEntries(u.searchParams.entries());

  try {
    if (req.method === 'GET' && path === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    }

    const body = req.method === 'GET' || req.method === 'HEAD' ? {} : await readBody(req);

    if (path === '/api/urbano' || path.startsWith('/api/urbano/')) {
      return await callHandler(dispatch, req, res, query, body);
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Not found' }));
  } catch (e) {
    console.error(e);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Error interno' }));
    }
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`El Urbano API local en http://0.0.0.0:${PORT}`);
});
