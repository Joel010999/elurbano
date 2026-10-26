import type { Rol, Usuario } from './types';
import { listarUsuarios } from './users';

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

function mismoIdentificador(user: Usuario, ident: string): boolean {
  const hint = ident.trim().toLowerCase();
  if (!hint) return false;
  return (
    user.identificador.toLowerCase() === hint ||
    user.id.toLowerCase() === hint ||
    (user.email || '').toLowerCase() === hint
  );
}

/**
 * Bearer puro, o "id:token" / "identificador:token".
 * Los demos comparten la clave "1": sin el identificador no hay un rol único.
 */
export async function usuarioDeCredencial(credencial: string): Promise<Usuario | null> {
  const raw = credencial.trim();
  if (!raw) return null;

  const users = await listarUsuarios();
  let token = raw;
  let idHint = '';
  const corte = raw.lastIndexOf(':');
  if (corte > 0) {
    const posibleId = raw.slice(0, corte).trim();
    const posibleToken = raw.slice(corte + 1).trim();
    const coincide = users.some((item) => mismoIdentificador(item, posibleId));
    if (coincide && esTokenSesion(posibleToken)) {
      token = posibleToken;
      idHint = posibleId;
    }
  }
  if (!esTokenSesion(token)) return null;
  const porToken = users.filter((item) => item.activo && item.token === token);
  if (idHint) return porToken.find((item) => mismoIdentificador(item, idHint)) ?? null;
  if (porToken.length === 1) return porToken[0];
  // Sin identificador y con la clave demo compartida, se mantiene el primer match
  // (el chofer). El panel manda "identificador:token" para elegir inspector o veedor.
  return porToken[0] ?? null;
}

export async function requireRoles(
  token: string,
  roles: Rol[],
): Promise<{ ok: true; user: Usuario } | { ok: false; status: 401 | 403; error: string }> {
  const user = await usuarioDeCredencial(token);
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
  return usuarioDeCredencial(bearer);
}
