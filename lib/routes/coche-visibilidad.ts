import type { VercelRequest, VercelResponse } from '../types';
import { requireRoles } from '../auth';
import { applyCors, bearerToken } from '../cors';
import { updateCocheVisibilidad } from '../redis';
import type { VisibilidadPayload } from '../types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;
    const payload = (req.body || {}) as VisibilidadPayload;
    const inspectorToken = bearerToken(req.headers.authorization, payload.inspectorToken);

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Coche inválido' });
    }

    if (typeof payload.visibleEnColejuy !== 'boolean' || !inspectorToken) {
      return res.status(400).json({ error: 'Faltan campos' });
    }

    const gate = await requireRoles(inspectorToken, ['inspector']);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

    await updateCocheVisibilidad(id, payload.visibleEnColejuy);

    return res.status(200).json({ success: true, message: 'Visibilidad actualizada' });
  } catch (error) {
    console.error('Error updating visibility:', error);
    if (error instanceof Error && error.message === 'Coche not found') {
      return res.status(404).json({ error: 'Coche no encontrado' });
    }
    return res.status(500).json({ error: 'Error interno' });
  }
}
