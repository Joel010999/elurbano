import type { VercelRequest, VercelResponse } from '../types';
import { applyCors } from '../cors';
import { MUNI_LINES } from '../muni-lines';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  return res.status(200).json({ lineas: MUNI_LINES });
}
