import type { Rol, Usuario } from './types';
import { resolveUsuario } from './users';

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
