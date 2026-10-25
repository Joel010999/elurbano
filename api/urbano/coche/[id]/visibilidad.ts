import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateInspectorToken } from '../../../../lib/auth';
import { updateCocheVisibilidad } from '../../../../lib/redis';
import type { VisibilidadPayload } from '../../../../lib/types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;
    const payload = req.body as VisibilidadPayload;
    const bearer = typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ')
      ? req.headers.authorization.slice(7).trim()
      : '';
    const inspectorToken = (payload as any).inspectorToken || bearer;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Invalid coche ID' });
    }

    if (typeof payload.visibleEnColejuy !== 'boolean' || !payload.inspectorToken) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate inspector token
    if (!validateInspectorToken(inspectorToken)) {
      return res.status(401).json({ error: 'Invalid inspector token' });
    }

    // Update visibility in Redis
    await updateCocheVisibilidad(id, payload.visibleEnColejuy);

    return res.status(200).json({ success: true, message: 'Visibility updated' });
  } catch (error) {
    console.error('Error updating visibility:', error);
    if (error instanceof Error && error.message === 'Coche not found') {
      return res.status(404).json({ error: 'Coche not found' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
}
