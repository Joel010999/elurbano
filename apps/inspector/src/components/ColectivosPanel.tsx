'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

interface Colectivo {
  id: string;
  numero: string;
  patente: string;
  activo: boolean;
}

export default function ColectivosPanel({ token, soloLectura }: { token: string; soloLectura: boolean }) {
  const [colectivos, setColectivos] = useState<Colectivo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [numero, setNumero] = useState('');
  const [patente, setPatente] = useState('');
  const [activo, setActivo] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editNumero, setEditNumero] = useState('');
  const [editPatente, setEditPatente] = useState('');
  const [editActivo, setEditActivo] = useState(true);

  const cargar = useCallback(async () => {
    const data = await api<{ colectivos: Colectivo[] }>('/api/urbano/colectivos', token);
    setColectivos(Array.isArray(data.colectivos) ? data.colectivos : []);
  }, [token]);

  useEffect(() => {
    cargar().catch((e) => setError(e instanceof Error ? e.message : 'No se pudieron cargar los colectivos'));
  }, [cargar]);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (soloLectura) return;
    setError(null);
    try {
      await api('/api/urbano/colectivos', token, {
        method: 'POST',
        body: JSON.stringify({ numero, patente, activo }),
      });
      setNumero('');
      setPatente('');
      setActivo(true);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el colectivo');
    }
  }

  async function guardar(id: string) {
    if (soloLectura) return;
    setError(null);
    try {
      await api(`/api/urbano/colectivos/${encodeURIComponent(id)}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ numero: editNumero, patente: editPatente, activo: editActivo }),
      });
      setEditId(null);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    }
  }

  async function borrar(colectivo: Colectivo) {
    if (soloLectura) return;
    if (!window.confirm(`¿Borrar el colectivo ${colectivo.numero}?`)) return;
    setError(null);
    try {
      await api(`/api/urbano/colectivos/${encodeURIComponent(colectivo.id)}`, token, { method: 'DELETE' });
      if (editId === colectivo.id) setEditId(null);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo borrar');
    }
  }

  return (
    <section className="bg-white rounded-lg shadow p-4 border-2 border-[#e53935]">
      <h2 className="font-bold text-lg mb-1">Colectivos</h2>
      <p className="text-sm text-gray-600 mb-4">
        {soloLectura
          ? 'Solo lectura. El veedor ve el padrón y no puede crear, editar ni borrar.'
          : 'Alta, edición y baja contra la API. El número es el que se muestra grande en el mapa.'}
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">
          {error}
        </p>
      )}

      {!soloLectura && (
        <form onSubmit={crear} className="grid gap-3 md:grid-cols-4 mb-6">
          <input
            required
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            placeholder="Número"
            aria-label="Número"
            className="border border-gray-300 rounded px-3 py-2"
          />
          <input
            required
            value={patente}
            onChange={(e) => setPatente(e.target.value)}
            placeholder="Patente"
            aria-label="Patente"
            className="border border-gray-300 rounded px-3 py-2 uppercase"
          />
          <label className="flex items-center gap-2 text-sm border border-gray-300 rounded px-3 py-2">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            Activo
          </label>
          <button type="submit" className="bg-urbano-red text-white rounded font-medium px-3 py-2">
            Alta
          </button>
        </form>
      )}

      {colectivos.length === 0 ? (
        <p className="text-sm text-gray-600">No hay colectivos cargados.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-3">Número</th>
                <th className="py-2 pr-3">Patente</th>
                <th className="py-2 pr-3">Estado</th>
                {!soloLectura && <th className="py-2">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {colectivos.map((c) => (
                <tr key={c.id} className="border-b border-gray-100">
                  <td className="py-2 pr-3">
                    {editId === c.id ? (
                      <input value={editNumero} onChange={(e) => setEditNumero(e.target.value)} aria-label="Número" className="border rounded px-2 py-1 w-24" />
                    ) : (
                      <span className="inline-flex items-center justify-center min-w-10 px-2 py-1 rounded bg-[#e53935] text-white font-bold text-lg leading-none">
                        {c.numero}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 font-mono">
                    {editId === c.id ? (
                      <input value={editPatente} onChange={(e) => setEditPatente(e.target.value)} aria-label="Patente" className="border rounded px-2 py-1 w-full uppercase" />
                    ) : c.patente}
                  </td>
                  <td className="py-2 pr-3">
                    {editId === c.id ? (
                      <label className="inline-flex items-center gap-2">
                        <input type="checkbox" checked={editActivo} onChange={(e) => setEditActivo(e.target.checked)} />
                        Activo
                      </label>
                    ) : c.activo ? 'Activo' : 'Inactivo'}
                  </td>
                  {!soloLectura && (
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        {editId === c.id ? (
                          <>
                            <button type="button" onClick={() => void guardar(c.id)} className="px-2 py-1 rounded bg-urbano-red text-white">Guardar</button>
                            <button type="button" onClick={() => setEditId(null)} className="px-2 py-1 rounded bg-gray-200">Cancelar</button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditId(c.id);
                              setEditNumero(c.numero);
                              setEditPatente(c.patente);
                              setEditActivo(c.activo);
                            }}
                            className="px-2 py-1 rounded bg-gray-200"
                          >
                            Editar
                          </button>
                        )}
                        <button type="button" onClick={() => void borrar(c)} className="px-2 py-1 rounded bg-gray-800 text-white">
                          Borrar
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
