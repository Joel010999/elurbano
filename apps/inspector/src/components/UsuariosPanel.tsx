'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

type Rol = 'chofer' | 'inspector' | 'veedor';

interface Usuario {
  id: string;
  identificador: string;
  rol: Rol;
  token: string;
  activo: boolean;
}

const ROLES: Rol[] = ['chofer', 'inspector', 'veedor'];

export default function UsuariosPanel({ token }: { token: string }) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [identificador, setIdentificador] = useState('');
  const [rol, setRol] = useState<Rol>('chofer');
  const [credencial, setCredencial] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editIdentificador, setEditIdentificador] = useState('');
  const [editRol, setEditRol] = useState<Rol>('chofer');
  const [editToken, setEditToken] = useState('');

  const cargar = useCallback(async () => {
    const data = await api<{ usuarios: Usuario[] }>('/api/urbano/usuarios', token);
    setUsuarios(data.usuarios);
  }, [token]);

  useEffect(() => {
    cargar().catch((e) => setError(e instanceof Error ? e.message : 'Error'));
  }, [cargar]);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api('/api/urbano/usuarios', token, {
        method: 'POST',
        body: JSON.stringify({
          identificador,
          rol,
          token: credencial.trim() || undefined,
        }),
      });
      setIdentificador('');
      setCredencial('');
      setRol('chofer');
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear');
    }
  }

  async function guardar(id: string) {
    setError(null);
    try {
      await api(`/api/urbano/usuarios/${encodeURIComponent(id)}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ identificador: editIdentificador, rol: editRol, token: editToken }),
      });
      setEditId(null);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    }
  }

  async function baja(id: string) {
    setError(null);
    try {
      await api(`/api/urbano/usuarios/${encodeURIComponent(id)}`, token, { method: 'DELETE' });
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo dar de baja');
    }
  }

  async function activar(id: string) {
    setError(null);
    try {
      await api(`/api/urbano/usuarios/${encodeURIComponent(id)}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ activo: true }),
      });
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo activar');
    }
  }

  async function copiar(value: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setError('No se pudo copiar');
    }
  }

  return (
    <section className="bg-white rounded-lg shadow p-4 border-2 border-[#e53935]">
      <h2 className="font-bold text-lg mb-1">Usuarios</h2>
      <p className="text-sm text-gray-600 mb-4">Alta, edición y baja. El veedor no entra acá.</p>
      {error && <p className="text-sm text-amber-700 mb-3">{error}</p>}

      <form onSubmit={crear} className="grid gap-3 md:grid-cols-4 mb-6">
        <input
          required
          value={identificador}
          onChange={(e) => setIdentificador(e.target.value)}
          placeholder="Email o usuario"
          className="border border-gray-300 rounded px-3 py-2"
        />
        <select value={rol} onChange={(e) => setRol(e.target.value as Rol)} className="border border-gray-300 rounded px-3 py-2">
          {ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <input
          value={credencial}
          onChange={(e) => setCredencial(e.target.value)}
          placeholder="Contraseña (opcional)"
          className="border border-gray-300 rounded px-3 py-2"
        />
        <button type="submit" className="bg-urbano-red text-white rounded font-medium px-3 py-2">
          Alta
        </button>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="py-2 pr-3">Identificador</th>
              <th className="py-2 pr-3">Rol</th>
              <th className="py-2 pr-3">Contraseña</th>
              <th className="py-2 pr-3">Estado</th>
              <th className="py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className="border-b border-gray-100">
                <td className="py-2 pr-3">
                  {editId === u.id ? (
                    <input value={editIdentificador} onChange={(e) => setEditIdentificador(e.target.value)} className="border rounded px-2 py-1 w-full" />
                  ) : u.identificador}
                </td>
                <td className="py-2 pr-3">
                  {editId === u.id ? (
                    <select value={editRol} onChange={(e) => setEditRol(e.target.value as Rol)} className="border rounded px-2 py-1">
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  ) : u.rol}
                </td>
                <td className="py-2 pr-3 font-mono text-xs">
                  {editId === u.id ? (
                    <input value={editToken} onChange={(e) => setEditToken(e.target.value)} className="border rounded px-2 py-1 w-full font-mono" />
                  ) : (
                    <button type="button" onClick={() => copiar(u.token)} className="underline decoration-[#e53935]" title="Copiar">
                      {u.token}
                    </button>
                  )}
                </td>
                <td className="py-2 pr-3">{u.activo ? 'Activo' : 'Inactivo'}</td>
                <td className="py-2">
                  <div className="flex flex-wrap gap-2">
                    {editId === u.id ? (
                      <>
                        <button type="button" onClick={() => guardar(u.id)} className="px-2 py-1 rounded bg-urbano-red text-white">Guardar</button>
                        <button type="button" onClick={() => setEditId(null)} className="px-2 py-1 rounded bg-gray-200">Cancelar</button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditId(u.id);
                          setEditIdentificador(u.identificador);
                          setEditRol(u.rol);
                          setEditToken(u.token);
                        }}
                        className="px-2 py-1 rounded bg-gray-200"
                      >
                        Editar
                      </button>
                    )}
                    {u.activo ? (
                      <button type="button" onClick={() => baja(u.id)} className="px-2 py-1 rounded bg-gray-800 text-white">Baja</button>
                    ) : (
                      <button type="button" onClick={() => activar(u.id)} className="px-2 py-1 rounded border border-[#e53935] text-[#e53935]">Activar</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
