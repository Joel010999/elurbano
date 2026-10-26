import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from '../../../lib/cors';
import { ErrorApi, usuarioDesdeBearer } from '../../../lib/auth';
import { crearColectivo, listarColectivos, puedeEscribirColectivos } from '../../../lib/colectivos';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  try {
    const usuario = await usuarioDesdeBearer(req.headers.authorization);
    if (!usuario) return res.status(401).json({ error: 'No autorizado' });

    if (req.method === 'GET') {
      const colectivos = await listarColectivos(usuario.rol);
      return res.status(200).json({ colectivos });
    }

    if (req.method === 'POST') {
      if (!puedeEscribirColectivos(usuario.rol)) {
        return res.status(403).json({ error: 'No tiene permiso para modificar colectivos' });
      }
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const colectivo = await crearColectivo(body);
      return res.status(201).json(colectivo);
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (error) {
    if (error instanceof ErrorApi) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error en colectivos:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
