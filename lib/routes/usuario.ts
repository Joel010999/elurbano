import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireRoles } from '../auth';
import { applyCors, bearerToken } from '../cors';
import { bajaUsuario, editarUsuario } from '../users';

function errorStatus(message: string): number {
  if (message === 'NOT_FOUND') return 404;
  if (message === 'Identificador en uso' || message === 'Token en uso') return 409;
  return 400;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  const gate = await requireRoles(bearerToken(req.headers.authorization), ['inspector']);
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

  const { id } = req.query;
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Usuario inválido' });

  try {
    if (req.method === 'PATCH') {
      const usuario = await editarUsuario(id, (req.body || {}) as Record<string, unknown>);
      return res.status(200).json({ usuario });
    }

    if (req.method === 'DELETE') {
      const result = await bajaUsuario(id);
      return res.status(200).json({ success: true, ...result });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno';
    const status = message === 'Error interno' ? 500 : errorStatus(message);
    return res.status(status).json({
      error: message === 'NOT_FOUND' ? 'Usuario no encontrado' : message,
    });
  }
}
