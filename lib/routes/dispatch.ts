import type { VercelRequest, VercelResponse } from '../types';
import authGoogle from './auth-google';
import authLogin from './auth-login';
import coche from './coche';
import cocheLinea from './coche-linea';
import cocheVisibilidad from './coche-visibilidad';
import colectivo from './colectivo';
import colectivos from './colectivos';
import fleet from './fleet';
import lineas from './lineas';
import login from './login';
import ping from './ping';
import sesion from './sesion';
import usuario from './usuario';
import usuarios from './usuarios';

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown> | unknown;

/**
 * Una sola Serverless Function de Vercel para todo /api/urbano/*.
 * El plan Hobby permite como máximo 12 funciones por deployment.
 * Los handlers viven en lib/routes y no cuentan como funciones.
 */
export function segmentos(req: { url?: string; query?: VercelRequest['query'] }): string[] {
  const crudo = (req.url || '').split('?')[0];
  const path = crudo.replace(/\/+$/, '') || '/';
  const marca = '/api/urbano';
  const en = path.indexOf(marca);
  if (en >= 0) {
    const resto = path.slice(en + marca.length).replace(/^\//, '');
    if (!resto) return [];
    return resto.split('/').filter(Boolean).map(decodificar);
  }

  const desdeQuery = req.query?.path;
  if (Array.isArray(desdeQuery)) return desdeQuery.map((parte) => decodificar(String(parte))).filter(Boolean);
  if (typeof desdeQuery === 'string' && desdeQuery) return [decodificar(desdeQuery)];
  return [];
}

function decodificar(valor: string): string {
  try {
    return decodeURIComponent(valor);
  } catch {
    return valor;
  }
}

function conId(req: VercelRequest, id: string): VercelRequest {
  req.query = { ...req.query, id };
  return req;
}

function destino(req: VercelRequest): Handler | null {
  const partes = segmentos(req);
  if (partes.length === 1) {
    switch (partes[0]) {
      case 'ping':
        return ping;
      case 'fleet':
        return fleet;
      case 'sesion':
        return sesion;
      case 'lineas':
        return lineas;
      case 'login':
        return login;
      case 'usuarios':
        return usuarios;
      case 'colectivos':
        return colectivos;
      default:
        return null;
    }
  }

  if (partes.length === 2 && partes[0] === 'auth') {
    if (partes[1] === 'login') return authLogin;
    if (partes[1] === 'google') return authGoogle;
    return null;
  }

  if (partes.length === 2 && partes[0] === 'usuarios') return (r, s) => usuario(conId(r, partes[1]), s);
  if (partes.length === 2 && partes[0] === 'colectivos') return (r, s) => colectivo(conId(r, partes[1]), s);
  if (partes.length === 2 && partes[0] === 'coche') return (r, s) => coche(conId(r, partes[1]), s);

  if (partes.length === 3 && partes[0] === 'coche' && partes[2] === 'linea') {
    return (r, s) => cocheLinea(conId(r, partes[1]), s);
  }
  if (partes.length === 3 && partes[0] === 'coche' && partes[2] === 'visibilidad') {
    return (r, s) => cocheVisibilidad(conId(r, partes[1]), s);
  }

  return null;
}

export default async function dispatch(req: VercelRequest, res: VercelResponse) {
  const handler = destino(req);
  if (!handler) return res.status(404).json({ error: 'Not found' });
  return handler(req, res);
}
