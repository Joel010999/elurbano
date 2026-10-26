import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ErrorApi } from '../../../lib/auth';
import { loginConClave } from '../../../lib/usuarios';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }
  try {
    const body = (req.body ?? {}) as { usuario?: unknown; identificador?: unknown; clave?: unknown };
    const sesion = await loginConClave(body.usuario ?? body.identificador, body.clave);
    return res.status(200).json(sesion);
  } catch (error) {
    if (error instanceof ErrorApi) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error en login:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
