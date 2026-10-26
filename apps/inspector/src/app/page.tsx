'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import type { Coche } from '../../../../packages/shared/types';
import type { MapBus, MapPath } from '../components/BusMap';
import UsuariosPanel from '../components/UsuariosPanel';
import { API_BASE, DEMO_INSPECTOR, DEMO_VEEDOR, api } from '../lib/api';
import { LINE_NUMBERS, URBANO_LINES, lineColor, lineNames, mapBusId } from '../lib/catalog';

const BusMap = dynamic(() => import('../components/BusMap'), {
  ssr: false,
  loading: () => <div className="map-wait">Cargando mapa…</div>,
});

const TOKEN_KEY = 'urbano:panel-token';

type Rol = 'chofer' | 'inspector' | 'veedor';
interface Sesion {
  id: string;
  identificador: string;
  rol: Rol;
}

function tiempoDesde(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutos = Math.floor(diff / 60000);
  if (minutos < 1) return 'Ahora';
  if (minutos === 1) return 'Hace 1 minuto';
  if (minutos < 60) return `Hace ${minutos} minutos`;
  const horas = Math.floor(minutos / 60);
  return `Hace ${horas} h`;
}

function normalizar(c: Coche): Coche {
  const ping = c.lastPing && Number.isFinite(c.lastPing.lat) && Number.isFinite(c.lastPing.lng) ? c.lastPing : null;
  return {
    ...c,
    lastPing: ping,
    linea: c.linea ? String(c.linea) : '',
    disponible: c.disponible ?? true,
    visibleEnColejuy: Boolean(c.visibleEnColejuy),
    chofer: c.chofer || '',
  };
}

export default function InspectorPage() {
  const [token, setToken] = useState<string | null>(null);
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [borrador, setBorrador] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);
  const [coches, setCoches] = useState<Coche[]>([]);
  const [vista, setVista] = useState<'lista' | 'mapa' | 'usuarios'>('lista');
  const [visibles, setVisibles] = useState<Set<string>>(() => new Set(LINE_NUMBERS));
  const [verSinLinea, setVerSinLinea] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [followId, setFollowId] = useState<number | null>(null);

  const soloLectura = sesion?.rol !== 'inspector';

  useEffect(() => {
    const saved = sessionStorage.getItem(TOKEN_KEY);
    if (saved) void entrar(saved);
  }, []);

  async function entrar(valor: string) {
    const limpio = valor.trim();
    if (!limpio) return;
    setEntrando(true);
    setLoginError(null);
    try {
      const data = await api<Sesion>('/api/urbano/sesion', limpio);
      if (data.rol === 'chofer') {
        setLoginError('Este token es de chofer. Entrá con inspector o veedor.');
        return;
      }
      sessionStorage.setItem(TOKEN_KEY, limpio);
      setToken(limpio);
      setSesion(data);
    } catch (error) {
      sessionStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setSesion(null);
      setLoginError(error instanceof Error ? error.message : 'No se pudo entrar');
    } finally {
      setEntrando(false);
    }
  }

  function salir() {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setSesion(null);
    setCoches([]);
  }

  useEffect(() => {
    if (sesion && sesion.rol !== 'inspector' && vista === 'usuarios') setVista('lista');
  }, [sesion, vista]);

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    const cargar = async () => {
      try {
        const data = await api<{ coches: Coche[] }>('/api/urbano/fleet?mode=inspector', token);
        if (vivo && Array.isArray(data.coches)) {
          setCoches(data.coches.map(normalizar));
          setApiError(null);
        }
      } catch (error) {
        if (!vivo) return;
        const message = error instanceof Error ? error.message : 'Error de flota';
        setApiError(message);
        if (message === 'Token inválido' || message === 'Solo lectura') {
          // Solo lectura sigue pudiendo leer. Token inválido cierra la sesión.
          if (message === 'Token inválido') salir();
        }
      }
    };
    void cargar();
    const timer = setInterval(cargar, 8000);
    return () => {
      vivo = false;
      clearInterval(timer);
    };
  }, [token]);

  const toggleLinea = (n: string) => setVisibles((prev) => {
    const next = new Set(prev);
    if (next.has(n)) next.delete(n);
    else next.add(n);
    return next;
  });

  const sinLinea = (c: Coche) => !c.linea || !LINE_NUMBERS.includes(c.linea);
  const cochesFiltrados = coches.filter((c) => (sinLinea(c) ? verSinLinea : visibles.has(c.linea)));
  const cochesPorLinea = (n: string) => coches.filter((c) => c.linea === n).length;

  const mapPaths = useMemo<MapPath[]>(() =>
    URBANO_LINES.filter((l) => visibles.has(l.number)).flatMap((l) =>
      l.paths.map((p) => ({ direction: p.direction, coordinates: p.coordinates, color: lineColor(l.number) }))),
  [visibles]);

  async function asignarLinea(cocheId: string, nuevaLinea: string) {
    if (soloLectura || !token) return;
    try {
      await api(`/api/urbano/coche/${encodeURIComponent(cocheId)}/linea`, token, {
        method: 'PATCH',
        body: JSON.stringify({ linea: nuevaLinea }),
      });
      setCoches((prev) => prev.map((c) => (c.id === cocheId ? { ...c, linea: nuevaLinea } : c)));
      setApiError(null);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'No se pudo asignar');
    }
  }

  async function toggleVisibilidad(coche: Coche) {
    if (soloLectura || !token) return;
    const visibleEnColejuy = !coche.visibleEnColejuy;
    try {
      await api(`/api/urbano/coche/${encodeURIComponent(coche.id)}/visibilidad`, token, {
        method: 'PATCH',
        body: JSON.stringify({ visibleEnColejuy }),
      });
      setCoches((prev) => prev.map((c) => (c.id === coche.id ? { ...c, visibleEnColejuy } : c)));
      setApiError(null);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'No se pudo cambiar la visibilidad');
    }
  }

  function elegir(coche: Coche) {
    setSeleccionado(coche.id);
    if (coche.lastPing) setFollowId(mapBusId(coche.id));
  }

  if (!sesion || !token) {
    return (
      <Marco>
        <Header titulo="El Urbano" subtitulo="Panel de flota" />
        <main className="max-w-md mx-auto px-4 py-10">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void entrar(borrador);
            }}
            className="bg-white rounded-lg shadow p-6 border-2 border-[#e53935] space-y-4"
          >
            <h2 className="text-xl font-bold">Entrar</h2>
            <p className="text-sm text-gray-600">Inspector opera. Veedor solo mira.</p>
            <input
              value={borrador}
              onChange={(e) => setBorrador(e.target.value)}
              placeholder="Token"
              autoComplete="off"
              className="w-full border border-gray-300 rounded px-3 py-2"
            />
            {loginError && <p className="text-sm text-amber-700">{loginError}</p>}
            <button type="submit" disabled={entrando} className="w-full bg-urbano-red text-white rounded py-2 font-medium">
              {entrando ? 'Entrando…' : 'Entrar'}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => void entrar(DEMO_INSPECTOR)} className="rounded border-2 border-[#e53935] py-2 text-sm font-medium text-[#e53935]">
                Inspector demo
              </button>
              <button type="button" onClick={() => void entrar(DEMO_VEEDOR)} className="rounded border-2 border-[#e53935] py-2 text-sm font-medium text-[#e53935]">
                Veedor demo
              </button>
            </div>
          </form>
        </main>
      </Marco>
    );
  }

  return (
    <Marco>
      <Header
        titulo="El Urbano"
        subtitulo={sesion.rol === 'veedor' ? 'Veedor · solo lectura' : 'Inspector'}
        extra={
          <button type="button" onClick={salir} className="text-sm underline">
            Salir · {sesion.identificador}
          </button>
        }
      />
      <main className="max-w-7xl mx-auto px-4 py-6">
        {sesion.rol === 'veedor' && (
          <p className="mb-4 rounded border-2 border-[#e53935] bg-white px-4 py-3 text-sm">
            Veedor municipal. Podés mirar la flota. No asignás líneas, ni visibilidad, ni usuarios.
          </p>
        )}

        <div className="bg-white rounded-lg shadow p-4 mb-6 flex flex-wrap gap-4 items-center justify-between border border-[#e53935]/40">
          <div className="text-sm text-gray-600">
            {cochesFiltrados.length} de {coches.length} coches · {visibles.size} de {LINE_NUMBERS.length} líneas
            {apiError ? <span className="text-amber-700"> · {apiError}</span> : <span className="text-green-700"> · en vivo</span>}
          </div>
          <div className="flex gap-2">
            <Tab on={vista === 'lista'} onClick={() => setVista('lista')}>Lista</Tab>
            <Tab on={vista === 'mapa'} onClick={() => setVista('mapa')}>Mapa</Tab>
            {sesion.rol === 'inspector' && (
              <Tab on={vista === 'usuarios'} onClick={() => setVista('usuarios')}>Usuarios</Tab>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-lg">Líneas</h2>
            <div className="flex gap-2">
              <button type="button" onClick={() => setVisibles(new Set(LINE_NUMBERS))} className="px-3 py-1 rounded text-sm font-medium bg-urbano-red text-white">Todas</button>
              <button type="button" onClick={() => setVisibles(new Set())} className="px-3 py-1 rounded text-sm font-medium bg-gray-200 text-gray-700">Ninguna</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={verSinLinea}
              onClick={() => setVerSinLinea((v) => !v)}
              className={`px-3 py-2 rounded-full text-sm font-medium ${verSinLinea ? 'bg-urbano-red text-white' : 'bg-gray-200 text-gray-500'}`}
            >
              Sin línea ({coches.filter(sinLinea).length})
            </button>
            {LINE_NUMBERS.map((n) => {
              const on = visibles.has(n);
              return (
                <button
                  key={n}
                  type="button"
                  title={lineNames(n)}
                  aria-pressed={on}
                  onClick={() => toggleLinea(n)}
                  className={`px-3 py-2 rounded-full text-sm font-medium transition flex items-center gap-2 ${on ? 'bg-urbano-red text-white' : 'bg-gray-200 text-gray-500'}`}
                >
                  <span className="inline-block w-3 h-3 rounded-full border border-white" style={{ background: on ? lineColor(n) : '#9e9e9e' }} />
                  Línea {n}
                  <span className={`text-xs ${on ? 'text-red-100' : 'text-gray-400'}`}>({cochesPorLinea(n)})</span>
                </button>
              );
            })}
          </div>
        </div>

        {vista === 'usuarios' && sesion.rol === 'inspector' && <UsuariosPanel token={token} />}

        {vista === 'lista' && (
          cochesFiltrados.length === 0 ? (
            <p className="bg-white rounded-lg shadow p-6 text-gray-600">Todavía no hay coches con GPS en este filtro.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {cochesFiltrados.map((coche) => (
                <article
                  key={coche.id}
                  className={`bg-white rounded-lg shadow-md p-6 ${seleccionado === coche.id ? 'ring-4 ring-[#e53935]' : ''}`}
                >
                  <div className="flex justify-between items-start mb-4 gap-2">
                    <button type="button" onClick={() => elegir(coche)} className="text-left">
                      <h3 className="text-2xl font-bold text-gray-800">Coche {coche.id}</h3>
                      <p className="text-gray-600">{coche.chofer || 'Sin chofer'}</p>
                    </button>
                    <span className={`px-3 py-1 rounded text-sm font-medium ${coche.disponible ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {coche.disponible ? 'Disponible' : 'Fuera de servicio'}
                    </span>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Línea</label>
                      {soloLectura ? (
                        <p className="font-medium">{coche.linea ? `Línea ${coche.linea}` : 'Sin línea'}</p>
                      ) : (
                        <select
                          value={LINE_NUMBERS.includes(coche.linea) ? coche.linea : ''}
                          onChange={(e) => void asignarLinea(coche.id, e.target.value)}
                          className="w-full border border-gray-300 rounded px-3 py-2"
                        >
                          <option value="" disabled>Elegir línea</option>
                          {LINE_NUMBERS.map((l) => (
                            <option key={l} value={l}>Línea {l}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-gray-600">Visible en ColeJUY</span>
                      <button
                        type="button"
                        disabled={soloLectura}
                        onClick={() => void toggleVisibilidad(coche)}
                        className={`px-4 py-2 rounded font-medium ${coche.visibleEnColejuy ? 'bg-urbano-red text-white' : 'bg-gray-200 text-gray-700'} disabled:opacity-60`}
                      >
                        {coche.visibleEnColejuy ? 'Visible' : 'Oculto'}
                      </button>
                    </div>
                    {coche.lastPing ? (
                      <div className="pt-3 border-t border-gray-200">
                        <p className="text-xs text-gray-500 font-mono">{coche.lastPing.lat.toFixed(4)}, {coche.lastPing.lng.toFixed(4)}</p>
                        <p className="text-xs text-green-700 mt-1">{tiempoDesde(coche.lastPing.timestamp)}</p>
                      </div>
                    ) : (
                      <p className="pt-3 border-t border-gray-200 text-sm text-amber-700">Sin señal GPS</p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )
        )}

        {vista === 'mapa' && (
          <div className="bg-white rounded-lg shadow-md overflow-hidden border-4 border-[#e53935]">
            <div className="h-[600px]">
              <BusMap
                theme="light"
                buses={cochesFiltrados.filter((c) => c.lastPing).map((c): MapBus => ({
                  id: mapBusId(c.id),
                  line: c.linea || null,
                  lng: c.lastPing!.lng,
                  lat: c.lastPing!.lat,
                  label: c.id,
                  color: lineColor(c.linea || '1'),
                  text: '#ffffff',
                  fresh: (Date.now() - new Date(c.lastPing!.timestamp).getTime()) < 120000,
                  speed: 0,
                  course: null,
                  moving: false,
                  age: (Date.now() - new Date(c.lastPing!.timestamp).getTime()) / 1000,
                }))}
                paths={mapPaths}
                activeDirection={null}
                color="#e53935"
                stops={[]}
                selectedStop={null}
                subePoints={[]}
                selectedSube={null}
                me={null}
                followBusId={followId}
                onUnfollow={() => setFollowId(null)}
                pins={[]}
                fitKey={`inspector-${Array.from(visibles).sort().join(',')}-${verSinLinea}`}
                frame={[]}
                focus={null}
                routes={[]}
                legend={false}
                onBus={(id) => {
                  const coche = cochesFiltrados.find((c) => mapBusId(c.id) === id);
                  if (coche) elegir(coche);
                }}
                onStop={() => undefined}
                onSube={() => undefined}
                onMap={() => undefined}
              />
            </div>
          </div>
        )}

        <div className="mt-6 bg-white rounded-lg shadow-md p-6">
          <div className="grid grid-cols-3 gap-6 text-center">
            <div>
              <p className="text-3xl font-bold text-urbano-red">{coches.filter((c) => c.lastPing).length}</p>
              <p className="text-gray-600">Con GPS</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-green-600">{coches.filter((c) => c.disponible).length}</p>
              <p className="text-gray-600">Disponibles</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-[#e53935]">{coches.filter((c) => c.visibleEnColejuy).length}</p>
              <p className="text-gray-600">Visibles en ColeJUY</p>
            </div>
          </div>
        </div>
      </main>
    </Marco>
  );
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="pointer-events-none fixed inset-0 z-50 border-[6px] border-[#e53935]" aria-hidden="true" />
      {children}
    </div>
  );
}

function Header({ titulo, subtitulo, extra }: { titulo: string; subtitulo: string; extra?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-40 bg-[#e53935] text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-5 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{titulo}</h1>
          <p className="text-red-100 mt-1">{subtitulo}</p>
        </div>
        {extra}
      </div>
    </header>
  );
}

function Tab({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded font-medium ${on ? 'bg-urbano-red text-white' : 'bg-gray-200 text-gray-700'}`}
    >
      {children}
    </button>
  );
}
