import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from '../cors';
import { ErrorApi } from '../auth';
import { loginConClave } from '../users';

/** Login para chofer + inspector + veedor (clave demo "1"). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const user = await loginConClave(body.usuario ?? body.identificador, body.clave ?? body.password);
    return res.status(200).json({
      token: user.token,
      id: user.id,
      identificador: user.identificador,
      rol: user.rol,
    });
  } catch (error) {
    if (error instanceof ErrorApi) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error en login:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
