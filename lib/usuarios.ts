import { timingSafeEqual } from 'node:crypto';
import { ErrorApi, validarToken } from './auth';
import { getRedisClient } from './redis';

export const SEED_TOKEN = '1';
export const SEED_IDS = ['inspector-demo', 'veedor-demo', 'chofer-demo'] as const;

export type Rol = 'inspector' | 'veedor' | 'chofer';

export interface Usuario {
  id: string;
  identificador: string;
  email: string;
  rol: Rol;
  clave: string;
  token: string;
}

export interface Sesion {
  token: string;
  rol: Rol;
  id: string;
  identificador: string;
}

const SEMILLA: Usuario[] = [
  { id: 'inspector-demo', identificador: 'inspector-demo', email: 'inspector-demo', rol: 'inspector', clave: '1', token: SEED_TOKEN },
  { id: 'veedor-demo', identificador: 'veedor-demo', email: 'veedor-demo', rol: 'veedor', clave: '1', token: SEED_TOKEN },
  { id: 'chofer-demo', identificador: 'chofer-demo', email: 'chofer-demo', rol: 'chofer', clave: '1', token: SEED_TOKEN },
];

function claveUsuario(id: string): string {
  return `urbano:usuario:${id}`;
}

function esRol(valor: string): valor is Rol {
  return valor === 'inspector' || valor === 'veedor' || valor === 'chofer';
}

function aUsuario(data: Record<string, string>): Usuario | null {
  if (!data.id || !data.identificador || !esRol(data.rol) || !data.token) return null;
  return {
    id: data.id,
    identificador: data.identificador,
    email: data.email || data.identificador,
    rol: data.rol,
    clave: data.clave || '',
    token: data.token,
  };
}

async function guardar(usuario: Usuario): Promise<void> {
  const redis = getRedisClient();
  await redis.hset(claveUsuario(usuario.id), {
    id: usuario.id,
    identificador: usuario.identificador,
    email: usuario.email,
    rol: usuario.rol,
    clave: usuario.clave,
    token: usuario.token,
  });
}

export async function listarUsuarios(): Promise<Usuario[]> {
  const redis = getRedisClient();
  const keys = await redis.keys('urbano:usuario:*');
  const usuarios: Usuario[] = [];
  for (const key of keys) {
    const data = await redis.hgetall(key);
    if (!data) continue;
    const usuario = aUsuario(data);
    if (usuario) usuarios.push(usuario);
  }
  return usuarios;
}

/** Crea la semilla y, para SEED_IDS, deja el token de Redis en "1". */
export async function ensureUsuarios(): Promise<void> {
  const redis = getRedisClient();
  const ids = new Set<string>(SEED_IDS);
  for (const seed of SEMILLA) {
    const actual = await redis.hgetall(claveUsuario(seed.id));
    if (!actual) {
      await guardar(seed);
      continue;
    }
    const usuario = aUsuario(actual);
    if (usuario && ids.has(usuario.id) && usuario.token !== SEED_TOKEN) {
      await guardar({ ...usuario, token: SEED_TOKEN });
    }
  }
}

function clavesIguales(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function sesionDe(usuario: Usuario): Sesion {
  return {
    token: usuario.token,
    rol: usuario.rol,
    id: usuario.id,
    identificador: usuario.identificador,
  };
}

export async function loginConClave(usuario: unknown, clave: unknown): Promise<Sesion> {
  if (typeof usuario !== 'string' || typeof clave !== 'string' || !usuario.trim() || !clave) {
    throw new ErrorApi(400, 'Usuario y clave son obligatorios');
  }
  await ensureUsuarios();
  const buscado = usuario.trim().toLowerCase();
  const encontrado = (await listarUsuarios()).find(item =>
    item.identificador.toLowerCase() === buscado || item.email.toLowerCase() === buscado || item.id.toLowerCase() === buscado
  );
  if (!encontrado || !clavesIguales(encontrado.clave, clave)) {
    throw new ErrorApi(401, 'Usuario o clave incorrectos');
  }
  return sesionDe(encontrado);
}

export async function usuarioDesdeAutorizacion(
  authorization: string | undefined,
  identificadorHeader?: string
): Promise<Usuario | null> {
  if (!authorization || !authorization.startsWith('Bearer ')) return null;
  const bearer = authorization.slice(7).trim();
  if (!bearer) return null;
  await ensureUsuarios();
  const usuarios = await listarUsuarios();

  let token = bearer;
  let idHint = (identificadorHeader || '').trim();
  const corte = bearer.lastIndexOf(':');
  if (corte > 0) {
    const posibleId = bearer.slice(0, corte);
    const posibleToken = bearer.slice(corte + 1);
    const coincide = usuarios.some(item => item.id === posibleId || item.identificador === posibleId);
    if (coincide && validarToken(posibleToken)) {
      token = posibleToken;
      idHint = idHint || posibleId;
    }
  }
  if (!validarToken(token)) return null;

  const porToken = usuarios.filter(item => item.token === token);
  if (idHint) {
    const hint = idHint.toLowerCase();
    return porToken.find(item =>
      item.id.toLowerCase() === hint || item.identificador.toLowerCase() === hint || item.email.toLowerCase() === hint
    ) ?? null;
  }
  if (porToken.length === 1) return porToken[0];
  return null;
}

interface GoogleTokenInfo {
  aud?: string;
  azp?: string;
  email?: string;
  email_verified?: string | boolean;
}

export async function loginConGoogle(idToken: unknown): Promise<Sesion> {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    throw new ErrorApi(500, 'GOOGLE_CLIENT_ID no está configurado');
  }
  if (typeof idToken !== 'string' || !idToken.trim()) {
    throw new ErrorApi(400, 'idToken requerido');
  }

  const respuesta = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken.trim())}`);
  if (!respuesta.ok) {
    throw new ErrorApi(401, 'Token de Google inválido');
  }
  const info = await respuesta.json() as GoogleTokenInfo;
  const aud = info.aud || info.azp;
  if (aud !== clientId) {
    throw new ErrorApi(401, 'Token de Google no corresponde a esta aplicación');
  }
  if (info.email_verified === false || info.email_verified === 'false') {
    throw new ErrorApi(401, 'El email de Google no está verificado');
  }
  if (!info.email) {
    throw new ErrorApi(401, 'El token de Google no incluye email');
  }

  await ensureUsuarios();
  const email = info.email.trim().toLowerCase();
  const usuario = (await listarUsuarios()).find(item =>
    item.email.toLowerCase() === email || item.identificador.toLowerCase() === email
  );
  if (!usuario) {
    throw new ErrorApi(404, 'No existe un usuario con ese identificador');
  }
  return sesionDe(usuario);
}
