import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireRoles } from '../../lib/auth';
import { applyCors, bearerToken } from '../../lib/cors';
import { getAllCoches } from '../../lib/redis';
import type { CocheResponse, FleetResponse } from '../../lib/types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const mode = req.query.mode as string;

    if (!mode || (mode !== 'inspector' && mode !== 'public')) {
      return res.status(400).json({ error: 'Modo inválido. Usá ?mode=inspector o ?mode=public' });
    }

    if (mode === 'inspector') {
      const token = bearerToken(req.headers.authorization);
      const gate = await requireRoles(token, ['inspector', 'veedor']);
      if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
    }

    const allCoches = await getAllCoches();

    let coches: CocheResponse[];

    if (mode === 'inspector') {
      coches = allCoches.map((coche) => ({
        id: coche.coche,
        linea: coche.linea,
        lastPing: {
          lat: parseFloat(coche.lat),
          lng: parseFloat(coche.lng),
          timestamp: coche.timestamp,
        },
        visibleEnColejuy: coche.visibleEnColejuy === 'true',
        disponible: coche.disponible !== 'false',
        chofer: coche.chofer,
      }));
    } else {
      coches = allCoches
        .filter((coche) => coche.visibleEnColejuy === 'true')
        .map((coche) => ({
          id: coche.coche,
          linea: coche.linea,
          lastPing: {
            lat: parseFloat(coche.lat),
            lng: parseFloat(coche.lng),
            timestamp: coche.timestamp,
          },
        }));
    }

    const response: FleetResponse = { coches };
    return res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching fleet:', error);
    return res.status(500).json({ error: 'Error interno' });
  }
}
