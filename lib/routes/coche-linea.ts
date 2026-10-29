import type { VercelRequest, VercelResponse } from '../types';
import { requireRoles } from '../auth';
import { applyCors, bearerToken } from '../cors';
import { isLineaMunicipal } from '../muni-lines';
import { updateCocheLinea } from '../redis';
import type { LineaPayload } from '../types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;
    const payload = (req.body || {}) as Partial<LineaPayload>;
    const inspectorToken = bearerToken(req.headers.authorization, payload.inspectorToken);

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Coche inválido' });
    }

    if (!inspectorToken) {
      return res.status(400).json({ error: 'Faltan campos' });
    }

    const nuevaLinea = typeof payload.linea === 'string' ? payload.linea.trim() : '';

    if (nuevaLinea && !isLineaMunicipal(nuevaLinea)) {
      return res.status(400).json({ error: 'Línea fuera del catálogo municipal' });
    }

    const gate = await requireRoles(inspectorToken, ['inspector']);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

    await updateCocheLinea(id, nuevaLinea);

    return res.status(200).json({ success: true, message: 'Línea actualizada' });
  } catch (error) {
    console.error('Error updating linea:', error);
    if (error instanceof Error && error.message === 'Coche not found') {
      return res.status(404).json({ error: 'Coche no encontrado' });
    }
    return res.status(500).json({ error: 'Error interno' });
  }
}
