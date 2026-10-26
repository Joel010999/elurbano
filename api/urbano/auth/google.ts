import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ErrorApi } from '../../../lib/auth';
import { loginConGoogle } from '../../../lib/usuarios';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }
  try {
    const body = (req.body ?? {}) as { idToken?: unknown };
    const sesion = await loginConGoogle(body.idToken);
    return res.status(200).json(sesion);
  } catch (error) {
    if (error instanceof ErrorApi) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error en login Google:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
