import type { VercelRequest, VercelResponse } from '../types';
import { requireRoles } from '../auth';
import { applyCors, bearerToken } from '../cors';
import { crearUsuario, listarUsuarios } from '../users';

function errorStatus(message: string): number {
  if (message === 'Identificador en uso' || message === 'Token en uso') return 409;
  if (message === 'NOT_FOUND') return 404;
  if (
    message === 'Identificador inválido' ||
    message === 'Token inválido' ||
    message === 'Rol inválido' ||
    message === 'Activo inválido'
  ) {
    return 400;
  }
  return 400;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  const gate = await requireRoles(bearerToken(req.headers.authorization), ['inspector']);
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

  try {
    if (req.method === 'GET') {
      const usuarios = await listarUsuarios();
      return res.status(200).json({ usuarios });
    }

    if (req.method === 'POST') {
      const body = (req.body || {}) as { identificador?: unknown; rol?: unknown; token?: unknown };
      const usuario = await crearUsuario({
        identificador: body.identificador,
        rol: body.rol,
        token: body.token,
      });
      return res.status(201).json({ usuario });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno';
    if (message === 'Error interno') return res.status(500).json({ error: message });
    return res.status(errorStatus(message)).json({ error: message === 'NOT_FOUND' ? 'Usuario no encontrado' : message });
  }
}
