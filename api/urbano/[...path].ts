import type { VercelRequest, VercelResponse } from '../../lib/types';
import dispatch from '../../lib/routes/dispatch';

export default function handler(req: VercelRequest, res: VercelResponse) {
  return dispatch(req, res);
}
