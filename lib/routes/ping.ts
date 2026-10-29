import type { VercelRequest, VercelResponse } from '../types';
import { requireRoles } from '../auth';
import { applyCors, bearerToken } from '../cors';
import { isLineaMunicipal } from '../muni-lines';
import { savePing } from '../redis';
import type { PingPayload } from '../types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = (req.body || {}) as PingPayload;
    const choferToken = bearerToken(req.headers.authorization, payload.choferToken);

    if (!payload.cocheId || payload.lat == null || payload.lng == null || !payload.timestamp || !choferToken) {
      return res.status(400).json({ error: 'Faltan campos' });
    }

    if (!/^[A-Za-z0-9_-]{1,32}$/.test(payload.cocheId)) {
      return res.status(400).json({ error: 'Coche inválido' });
    }

    if (payload.linea && !isLineaMunicipal(String(payload.linea))) {
      return res.status(400).json({ error: 'Línea fuera del catálogo municipal' });
    }

    const gate = await requireRoles(choferToken, ['chofer']);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

    await savePing(payload.cocheId, {
      lat: Number(payload.lat),
      lng: Number(payload.lng),
      timestamp: payload.timestamp,
      chofer: gate.user.identificador,
      linea: payload.linea ? String(payload.linea) : undefined,
      actualizarLinea: payload.actualizarLinea === true,
      disponible: typeof payload.disponible === 'boolean' ? payload.disponible : undefined,
    });

    return res.status(200).json({ success: true, message: 'Ping guardado' });
  } catch (error) {
    console.error('Error saving ping:', error);
    return res.status(500).json({ error: 'Error interno' });
  }
}
