import type { Rol, Usuario } from './types';
import { resolveUsuario } from './users';

/** Token de sesión: alcanza con 1 carácter (los demos usan "1"). */
export function esTokenSesion(token: unknown): token is string {
  return typeof token === 'string' && token.trim().length >= 1;
}

export class ErrorApi extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ErrorApi';
    this.status = status;
  }
}

export async function requireRoles(
  token: string,
  roles: Rol[],
): Promise<{ ok: true; user: Usuario } | { ok: false; status: 401 | 403; error: string }> {
  const user = await resolveUsuario(token);
  if (!user) return { ok: false, status: 401, error: 'Token inválido' };
  if (!roles.includes(user.rol)) {
    return {
      ok: false,
      status: 403,
      error: user.rol === 'veedor' ? 'Solo lectura' : 'No autorizado',
    };
  }
  return { ok: true, user };
}

/** Bearer token puro, o "id:token" / "identificador:token". */
export async function usuarioDesdeBearer(
  authorization: string | undefined,
): Promise<Usuario | null> {
  if (!authorization || !authorization.startsWith('Bearer ')) return null;
  const bearer = authorization.slice(7).trim();
  if (!bearer) return null;

  let token = bearer;
  const corte = bearer.lastIndexOf(':');
  if (corte > 0) {
    const posibleToken = bearer.slice(corte + 1);
    if (esTokenSesion(posibleToken)) token = posibleToken;
  }
  if (!esTokenSesion(token)) return null;
  return resolveUsuario(token.trim());
}
