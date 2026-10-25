import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAllCoches } from '../../lib/redis';
import type { FleetResponse, CocheResponse } from '../../lib/types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const mode = req.query.mode as string;

    if (!mode || (mode !== 'inspector' && mode !== 'public')) {
      return res.status(400).json({ error: 'Invalid mode. Use ?mode=inspector or ?mode=public' });
    }

    const allCoches = await getAllCoches();

    let coches: CocheResponse[];

    if (mode === 'inspector') {
      // Return all coches with full details
      coches = allCoches.map(coche => ({
        id: coche.coche,
        linea: coche.linea,
        lastPing: {
          lat: parseFloat(coche.lat),
          lng: parseFloat(coche.lng),
          timestamp: coche.timestamp,
        },
        visibleEnColejuy: coche.visibleEnColejuy === 'true',
        chofer: coche.chofer,
      }));
    } else {
      // mode === 'public': filter only visible coches, no sensitive data
      coches = allCoches
        .filter(coche => coche.visibleEnColejuy === 'true')
        .map(coche => ({
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
    return res.status(500).json({ error: 'Internal server error' });
  }
}
