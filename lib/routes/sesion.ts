import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireRoles } from '../auth';
import { applyCors, bearerToken } from '../cors';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const gate = await requireRoles(bearerToken(req.headers.authorization), ['chofer', 'inspector', 'veedor']);
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

  return res.status(200).json({
    id: gate.user.id,
    identificador: gate.user.identificador,
    rol: gate.user.rol,
  });
}
