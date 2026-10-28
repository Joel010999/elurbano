import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireRoles } from '../auth';
import { applyCors, bearerToken } from '../cors';
import { getCoche } from '../redis';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Coche inválido' });
    }

    const token = bearerToken(req.headers.authorization);
    const gate = await requireRoles(token, ['chofer', 'inspector', 'veedor']);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

    const coche = await getCoche(id);
    if (!coche) {
      return res.status(200).json({ coche: { id, linea: '', visibleEnColejuy: false, disponible: true } });
    }

    return res.status(200).json({
      coche: {
        id: coche.coche,
        linea: coche.linea || '',
        visibleEnColejuy: coche.visibleEnColejuy === 'true',
        disponible: coche.disponible !== 'false',
        chofer: coche.chofer,
        lastPing: {
          lat: parseFloat(coche.lat),
          lng: parseFloat(coche.lng),
          timestamp: coche.timestamp,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching coche:', error);
    return res.status(500).json({ error: 'Error interno' });
  }
}
