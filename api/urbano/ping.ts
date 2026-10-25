import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateChoferToken } from '../../lib/auth';
import { savePing } from '../../lib/redis';
import type { PingPayload } from '../../lib/types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = req.body as PingPayload;
    const bearer = typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ')
      ? req.headers.authorization.slice(7).trim()
      : '';
    const choferToken = payload.choferToken || bearer;

    // Validate required fields
    if (!payload.cocheId || !payload.lat || !payload.lng || !payload.timestamp || !choferToken) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate chofer token (body or Authorization Bearer)
    if (!validateChoferToken(choferToken)) {
      return res.status(401).json({ error: 'Invalid chofer token' });
    }

    // Save ping to Redis
    await savePing(payload.cocheId, {
      lat: payload.lat,
      lng: payload.lng,
      timestamp: payload.timestamp,
      chofer: choferToken.substring(0, 8), // Store partial token as chofer ID
    });

    return res.status(200).json({ success: true, message: 'Ping saved' });
  } catch (error) {
    console.error('Error saving ping:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
