import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ErrorApi } from '../../../lib/auth';
import { actualizarColectivo, borrarColectivo, puedeEscribirColectivos } from '../../../lib/colectivos';
import { usuarioDesdeAutorizacion } from '../../../lib/usuarios';

function identificadorHeader(req: VercelRequest): string | undefined {
  const valor = req.headers['x-identificador'];
  return Array.isArray(valor) ? valor[0] : valor;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const usuario = await usuarioDesdeAutorizacion(req.headers.authorization, identificadorHeader(req));
    if (!usuario) return res.status(401).json({ error: 'No autorizado' });
    if (!puedeEscribirColectivos(usuario.rol)) {
      return res.status(403).json({ error: 'No tiene permiso para modificar colectivos' });
    }

    const id = typeof req.query.id === 'string' ? req.query.id : '';
    if (req.method === 'PATCH') {
      const colectivo = await actualizarColectivo(id, req.body ?? {});
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
