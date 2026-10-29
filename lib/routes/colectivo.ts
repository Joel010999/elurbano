import type { VercelRequest, VercelResponse } from '../types';
import { applyCors } from '../cors';
import { ErrorApi, usuarioDesdeBearer } from '../auth';
import { actualizarColectivo, borrarColectivo, puedeEscribirColectivos } from '../colectivos';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  try {
    const usuario = await usuarioDesdeBearer(req.headers.authorization);
    if (!usuario) return res.status(401).json({ error: 'No autorizado' });
    if (!puedeEscribirColectivos(usuario.rol)) {
      return res.status(403).json({ error: 'No tiene permiso para modificar colectivos' });
    }

    const id = typeof req.query.id === 'string' ? req.query.id : '';
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    if (req.method === 'PATCH') {
      const colectivo = await actualizarColectivo(id, body);
      return res.status(200).json(colectivo);
    }
    if (req.method === 'DELETE') {
      await borrarColectivo(id);
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'Método no permitido' });
  } catch (error) {
    if (error instanceof ErrorApi) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error en colectivo:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
