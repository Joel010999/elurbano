import type { VercelRequest, VercelResponse } from '@vercel/node';
import dispatch from '../../lib/routes/dispatch';

export default function handler(req: VercelRequest, res: VercelResponse) {
  return dispatch(req, res);
}
