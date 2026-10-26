import type { Rol, Usuario } from './types';
import { ErrorApi } from './auth';
import { getRedisClient } from './redis';

const USERS_KEY = 'urbano:usuarios';
const ROLES: Rol[] = ['chofer', 'inspector', 'veedor'];

export function isRol(value: string): value is Rol {
  return (ROLES as string[]).includes(value);
}

const SEED_TOKEN = '1';

function seedUsers(): Usuario[] {
  return [
    {
      id: 'usr-chofer-demo',
      identificador: 'chofer-demo',
      email: 'chofer-demo',
      rol: 'chofer',
      token: process.env.URBANO_CHOFER_TOKEN || SEED_TOKEN,
      activo: true,
    },
    {
      id: 'usr-inspector-demo',
      identificador: 'inspector-demo',
      email: 'inspector-demo',
      rol: 'inspector',
      token: process.env.URBANO_INSPECTOR_TOKEN || SEED_TOKEN,
      activo: true,
    },
    {
      id: 'usr-veedor-demo',
      identificador: 'veedor-demo',
      email: 'veedor-demo',
      rol: 'veedor',
      token: process.env.URBANO_VEEDOR_TOKEN || SEED_TOKEN,
      activo: true,
    },
  ];
}

const SEED_IDS = new Set(seedUsers().map((u) => u.id));

async function readUsuarios(): Promise<Usuario[]> {
  const row = await getRedisClient().hgetall(USERS_KEY);
  if (!row?.json) return [];
  try {
    const parsed = JSON.parse(row.json) as Usuario[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeUsuarios(users: Usuario[]): Promise<void> {
  await getRedisClient().hset(USERS_KEY, { json: JSON.stringify(users) });
}

export async function ensureUsuarios(): Promise<Usuario[]> {
  const users = await readUsuarios();
  const byId = new Map(users.map((u) => [u.id, u]));
  let changed = false;
  for (const seed of seedUsers()) {
    const existing = byId.get(seed.id);
    if (!existing) {
      users.push(seed);
      byId.set(seed.id, seed);
      changed = true;
      continue;
    }
    // Demos: forzar token "1" si no hay override de env para ese rol
    const envOverride =
      (seed.rol === 'chofer' && process.env.URBANO_CHOFER_TOKEN) ||
      (seed.rol === 'inspector' && process.env.URBANO_INSPECTOR_TOKEN) ||
      (seed.rol === 'veedor' && process.env.URBANO_VEEDOR_TOKEN);
    if (!envOverride && existing.token !== SEED_TOKEN) {
      existing.token = SEED_TOKEN;
      changed = true;
    }
    if (!existing.email) {
      existing.email = seed.email || seed.identificador;
      changed = true;
    }
  }
  if (changed) await writeUsuarios(users);
  return users;
}

function envUsuario(token: string): Usuario | null {
  const pairs: Array<[string | undefined, Rol]> = [
    [process.env.URBANO_CHOFER_TOKEN, 'chofer'],
    [process.env.URBANO_INSPECTOR_TOKEN, 'inspector'],
    [process.env.URBANO_VEEDOR_TOKEN, 'veedor'],
  ];
  for (const [envToken, rol] of pairs) {
    if (envToken && token === envToken) {
      return { id: `env-${rol}`, identificador: `${rol}-demo`, rol, token, activo: true };
    }
  }
  return null;
}

export async function resolveUsuario(token: string): Promise<Usuario | null> {
  if (!token) return null;
  const users = await ensureUsuarios();
  const found = users.find((u) => u.token === token);
  if (found) return found.activo ? found : null;
  return envUsuario(token);
}

function cleanIdentificador(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanToken(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function validarIdentificador(identificador: string): string | null {
  if (identificador.length < 2 || identificador.length > 80) return 'Identificador inválido';
  if (/[\s\r\n]/.test(identificador)) return 'Identificador inválido';
  return null;
}

export function validarToken(token: string): string | null {
  if (token.length < 1 || token.length > 80) return 'Token inválido';
  if (/\s/.test(token)) return 'Token inválido';
  return null;
}

function nuevoToken(rol: Rol): string {
  return `${rol}-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function inspectoresActivos(users: Usuario[], exceptoId?: string): number {
  return users.filter((u) => u.id !== exceptoId && u.rol === 'inspector' && u.activo).length;
}


export async function loginPanel(identificador: unknown, clave: unknown): Promise<Usuario> {
  const id = cleanIdentificador(identificador).toLowerCase();
  const password = cleanToken(clave);
  if (!id || !password) throw new Error('Usuario y contraseña requeridos');

  const users = await ensureUsuarios();
  const found = users.find(
    (u) => u.identificador.toLowerCase() === id && u.token === password && u.activo,
  );
  const user =
    found ||
    (() => {
      // también aceptar seeds de env por identificador *-demo
      for (const seed of seedUsers()) {
        if (seed.identificador.toLowerCase() === id && seed.token === password && seed.activo) return seed;
      }
      return null;
    })();

  if (!user) throw new Error('Usuario o contraseña incorrectos');
  if (user.rol === 'chofer') throw new Error('Este usuario es de chofer. Usá la app móvil.');
  if (user.rol !== 'inspector' && user.rol !== 'veedor') throw new Error('No autorizado');
  return user;
}

export async function listarUsuarios(): Promise<Usuario[]> {
  return ensureUsuarios();
}

export async function crearUsuario(input: {
  identificador: unknown;
  rol: unknown;
  token?: unknown;
}): Promise<Usuario> {
  const identificador = cleanIdentificador(input.identificador);
  const rol = typeof input.rol === 'string' ? input.rol : '';
  const idError = validarIdentificador(identificador);
  if (idError) throw new Error(idError);
  if (!isRol(rol)) throw new Error('Rol inválido');

  const users = await ensureUsuarios();
  if (users.some((u) => u.identificador === identificador)) throw new Error('Identificador en uso');

  let token = cleanToken(input.token);
  if (!token) token = nuevoToken(rol);
  const tokenError = validarToken(token);
  if (tokenError) throw new Error(tokenError);
  if (users.some((u) => u.token === token)) throw new Error('Token en uso');

  const user: Usuario = {
    id: `usr-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    identificador,
    rol,
    token,
    activo: true,
  };
  users.push(user);
  await writeUsuarios(users);
  return user;
}

export async function editarUsuario(
  id: string,
  input: { identificador?: unknown; rol?: unknown; token?: unknown; activo?: unknown },
): Promise<Usuario> {
  const users = await ensureUsuarios();
  const idx = users.findIndex((u) => u.id === id);
  if (idx < 0) throw new Error('NOT_FOUND');
  const current = users[idx];
  const next: Usuario = { ...current };

  if (input.identificador !== undefined) {
    next.identificador = cleanIdentificador(input.identificador);
    const idError = validarIdentificador(next.identificador);
    if (idError) throw new Error(idError);
  }
  if (input.rol !== undefined) {
    if (typeof input.rol !== 'string' || !isRol(input.rol)) throw new Error('Rol inválido');
    next.rol = input.rol;
  }
  if (input.token !== undefined) {
    next.token = cleanToken(input.token);
    const tokenError = validarToken(next.token);
    if (tokenError) throw new Error(tokenError);
  }
  if (input.activo !== undefined) {
    if (typeof input.activo !== 'boolean') throw new Error('Activo inválido');
    next.activo = input.activo;
  }

  if (users.some((u) => u.id !== id && u.identificador === next.identificador)) throw new Error('Identificador en uso');
  if (users.some((u) => u.id !== id && u.token === next.token)) throw new Error('Token en uso');

  const dejaDeSerInspector = current.rol === 'inspector' && current.activo && (next.rol !== 'inspector' || !next.activo);
  if (dejaDeSerInspector && inspectoresActivos(users, id) === 0) throw new Error('Tiene que quedar un inspector activo');

  users[idx] = next;
  await writeUsuarios(users);
  return next;
}

export async function bajaUsuario(id: string): Promise<{ removed: boolean; usuario?: Usuario }> {
  const users = await ensureUsuarios();
  const idx = users.findIndex((u) => u.id === id);
  if (idx < 0) throw new Error('NOT_FOUND');
  const current = users[idx];
  if (current.rol === 'inspector' && current.activo && inspectoresActivos(users, id) === 0) {
    throw new Error('Tiene que quedar un inspector activo');
  }
  if (SEED_IDS.has(id)) {
    users[idx] = { ...current, activo: false };
    await writeUsuarios(users);
    return { removed: false, usuario: users[idx] };
  }
  users.splice(idx, 1);
  await writeUsuarios(users);
  return { removed: true };
}


export async function loginConClave(identificador: unknown, clave: unknown): Promise<Usuario> {
  const id = cleanIdentificador(identificador).toLowerCase();
  const password = cleanToken(clave);
  if (!id || !password) throw new ErrorApi(400, 'Usuario y contraseña requeridos');

  const users = await ensureUsuarios();
  const found = users.find(
    (u) =>
      u.activo &&
      u.token === password &&
      (u.identificador.toLowerCase() === id ||
        (u.email || '').toLowerCase() === id ||
        u.id.toLowerCase() === id),
  );
  if (!found) {
    for (const seed of seedUsers()) {
      if (
        seed.activo &&
        seed.token === password &&
        (seed.identificador.toLowerCase() === id || (seed.email || '').toLowerCase() === id)
      ) {
        return seed;
      }
    }
    throw new ErrorApi(401, 'Usuario o contraseña incorrectos');
  }
  return found;
}

interface GoogleTokenInfo {
  aud?: string;
  azp?: string;
  email?: string;
  email_verified?: string | boolean;
}

export async function loginConGoogle(idToken: unknown): Promise<Usuario> {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) throw new ErrorApi(500, 'GOOGLE_CLIENT_ID no está configurado');
  if (typeof idToken !== 'string' || !idToken.trim()) throw new ErrorApi(400, 'idToken requerido');

  const respuesta = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken.trim())}`,
  );
  if (!respuesta.ok) throw new ErrorApi(401, 'Token de Google inválido');
  const info = (await respuesta.json()) as GoogleTokenInfo;
  const aud = info.aud || info.azp;
  if (aud !== clientId) throw new ErrorApi(401, 'Token de Google no corresponde a esta aplicación');
  if (info.email_verified === false || info.email_verified === 'false') {
    throw new ErrorApi(401, 'El email de Google no está verificado');
  }
  if (!info.email) throw new ErrorApi(401, 'El token de Google no incluye email');

  const email = info.email.trim().toLowerCase();
  const users = await ensureUsuarios();
  const usuario = users.find(
    (u) =>
      u.activo &&
      ((u.email || '').toLowerCase() === email || u.identificador.toLowerCase() === email),
  );
  if (!usuario) throw new ErrorApi(404, 'No existe un usuario con ese email');
  return usuario;
}
