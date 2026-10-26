import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from '../../lib/cors';
import { loginPanel } from '../../lib/users';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  try {
    const user = await loginPanel(body.identificador ?? body.usuario, body.clave ?? body.password);
    return res.status(200).json({
      token: user.token,
      id: user.id,
      identificador: user.identificador,
      rol: user.rol,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo entrar';
    const status = message.includes('incorrectos') || message.includes('requeridos') ? 401 : 403;
    return res.status(status).json({ error: message });
  }
}
