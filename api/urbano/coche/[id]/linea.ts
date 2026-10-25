import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateInspectorToken } from '../../../../lib/auth';
import { updateCocheLinea } from '../../../../lib/redis';
import type { LineaPayload } from '../../../../lib/types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;
    const payload = req.body as LineaPayload;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Invalid coche ID' });
    }

    if (!payload.linea || !payload.inspectorToken) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate inspector token
    if (!validateInspectorToken(payload.inspectorToken)) {
      return res.status(401).json({ error: 'Invalid inspector token' });
    }

    // Update linea in Redis
    await updateCocheLinea(id, payload.linea);

    return res.status(200).json({ success: true, message: 'Linea updated' });
  } catch (error) {
    console.error('Error updating linea:', error);
    if (error instanceof Error && error.message === 'Coche not found') {
      return res.status(404).json({ error: 'Coche not found' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
}
