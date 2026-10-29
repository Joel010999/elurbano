import type { VercelRequest, VercelResponse } from '../types';
import { requireRoles } from '../auth';
import { applyCors, bearerToken } from '../cors';
import { getAllCoches } from '../redis';
import type { CocheResponse, FleetResponse } from '../types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let mode = req.query.mode as string;
    if (!mode && (req.query.public === 'true' || req.query.public === '1')) {
      mode = 'public';
    }

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
      const now = Date.now();
      const MAX_AGE_MS = 2 * 60 * 1000; // 2 minutos (señal fresca)
      coches = allCoches
        .filter((coche) => {
          if (coche.visibleEnColejuy !== 'true') return false;
          if (!coche.linea || coche.linea.trim() === '') return false;
          const pingTime = new Date(coche.timestamp).getTime();
          if (isNaN(pingTime) || (now - pingTime) > MAX_AGE_MS) return false;
          return true;
        })
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
