'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import type { Coche } from '../../../../packages/shared/types';
import type { MapBus, MapPath } from '../components/BusMap';
import ColectivosPanel from '../components/ColectivosPanel';
import LoginPanel, { type SesionLogin } from '../components/LoginPanel';
import UsuariosPanel from '../components/UsuariosPanel';
import { api } from '../lib/api';
import { LINE_NUMBERS, URBANO_LINES, lineColor, lineNames, mapBusId, numeroCartel } from '../lib/catalog';

const BusMap = dynamic(() => import('../components/BusMap'), {
  ssr: false,
  loading: () => <div className="map-wait">Cargando mapa…</div>,
});

const SESION_KEY = 'urbano:panel-sesion';

type Rol = 'inspector' | 'veedor';
interface Sesion {
  id: string;
  identificador: string;
  rol: Rol;
}

function credencialDe(identificador: string, token: string): string {
  return `${identificador}:${token}`;
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
  const [credencial, setCredencial] = useState<string | null>(null);
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [coches, setCoches] = useState<Coche[]>([]);
  const [vista, setVista] = useState<'lista' | 'mapa' | 'colectivos' | 'usuarios'>('lista');
  const [visibles, setVisibles] = useState<Set<string>>(() => new Set(LINE_NUMBERS));
  const [verSinLinea, setVerSinLinea] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [followId, setFollowId] = useState<number | null>(null);

  const soloLectura = sesion?.rol !== 'inspector';

  useEffect(() => {
    const saved = sessionStorage.getItem(SESION_KEY);
    if (!saved) return;
    let guardada = '';
    try {
      const parsed = JSON.parse(saved) as { credencial?: string };
      if (typeof parsed.credencial === 'string') guardada = parsed.credencial;
    } catch {
      guardada = '';
    }
    if (!guardada) return;
    void entrarConCredencial(guardada);
  }, []);

  async function entrarConCredencial(valor: string) {
    try {
      const data = await api<Sesion & { rol: string }>('/api/urbano/sesion', valor);
      if (data.rol !== 'inspector' && data.rol !== 'veedor') {
        sessionStorage.removeItem(SESION_KEY);
        setLoginError('Este panel es solo para inspector y veedor.');
        return;
      }
      setCredencial(valor);
      setSesion({ id: data.id, identificador: data.identificador, rol: data.rol });
      setLoginError(null);
    } catch {
      sessionStorage.removeItem(SESION_KEY);
      setCredencial(null);
      setSesion(null);
    }
  }

  function aplicarSesion(data: SesionLogin) {
    if (data.rol === 'chofer') {
      throw new Error('Este usuario es de chofer. Usá la app móvil.');
    }
    if (data.rol !== 'inspector' && data.rol !== 'veedor') {
      throw new Error('Este panel es solo para inspector y veedor.');
    }
    const valor = credencialDe(data.identificador, data.token);
    const siguiente: Sesion = { id: data.id, identificador: data.identificador, rol: data.rol };
    sessionStorage.setItem(SESION_KEY, JSON.stringify({ credencial: valor, ...siguiente }));
    setCredencial(valor);
    setSesion(siguiente);
    setLoginError(null);
  }

  function salir() {
    sessionStorage.removeItem(SESION_KEY);
    setCredencial(null);
    setSesion(null);
    setCoches([]);
  }

  useEffect(() => {
    if (sesion && sesion.rol !== 'inspector' && vista === 'usuarios') setVista('lista');
  }, [sesion, vista]);

  useEffect(() => {
    if (!credencial) return;
    let vivo = true;
    const cargar = async () => {
      try {
        const data = await api<{ coches: Coche[] }>('/api/urbano/fleet?mode=inspector', credencial);
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
    const timer = setInterval(cargar, 3000); // Actualización cada 3 segundos
    return () => {
      vivo = false;
      clearInterval(timer);
    };
  }, [credencial]);

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
    if (soloLectura || !credencial) return;
    try {
      await api(`/api/urbano/coche/${encodeURIComponent(cocheId)}/linea`, credencial, {
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
    if (soloLectura || !credencial) return;
    const visibleEnColejuy = !coche.visibleEnColejuy;
    try {
      await api(`/api/urbano/coche/${encodeURIComponent(coche.id)}/visibilidad`, credencial, {
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

  if (!sesion || !credencial) {
    return (
      <Marco>
        <Header titulo="El Urbano" subtitulo="Panel de flota" />
        <main className="max-w-md mx-auto px-4 py-10 space-y-3">
          {loginError && (
            <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              {loginError}
            </p>
          )}
          <LoginPanel onSession={aplicarSesion} />
        </main>
      </Marco>
    );
  }

  return (
    <Marco isFullMap={vista === 'mapa'}>
      <Header
        titulo="El Urbano"
        subtitulo={sesion.rol === 'veedor' ? 'Veedor · solo lectura' : 'Inspector'}
        identificador={sesion.identificador}
        onSalir={salir}
        nav={{
          vista,
          setVista,
          esInspector: sesion.rol === 'inspector',
        }}
      />
      <main className={`max-w-7xl mx-auto ${vista === 'mapa' ? 'p-0 flex-1 w-full min-h-0 relative flex flex-col md:px-4 md:py-6 md:block' : 'px-4 py-6'}`}>
        {sesion.rol === 'veedor' && (
          <p className={`mb-4 rounded border-2 border-[#e53935] bg-white px-4 py-3 text-sm ${vista === 'mapa' ? 'hidden md:block' : ''}`}>
            Veedor municipal. Podés mirar la flota y el padrón de colectivos. No asignás líneas, no cambiás visibilidad y no das de alta, editás ni borrás.
          </p>
        )}

        <div className={`bg-white rounded-lg shadow p-4 mb-6 flex-wrap gap-4 items-center justify-between border border-[#e53935]/40 ${vista === 'mapa' ? 'hidden md:flex' : 'flex'}`}>
          <div className="text-sm text-gray-600 font-medium">
            {cochesFiltrados.length} de {coches.length} coches · {visibles.size} de {LINE_NUMBERS.length} líneas
            {apiError ? <span className="text-red-700"> · {apiError}</span> : <span className="text-green-700"> · en vivo</span>}
          </div>
          <div className="hidden md:flex gap-2">
            <Tab on={vista === 'lista'} onClick={() => setVista('lista')}>Lista</Tab>
            <Tab on={vista === 'mapa'} onClick={() => setVista('mapa')}>Mapa</Tab>
            <Tab on={vista === 'colectivos'} onClick={() => setVista('colectivos')}>Colectivos</Tab>
            {sesion.rol === 'inspector' && (
              <Tab on={vista === 'usuarios'} onClick={() => setVista('usuarios')}>Usuarios</Tab>
            )}
          </div>
        </div>

        {(vista === 'lista' || vista === 'mapa') && <div className={`bg-white rounded-lg shadow p-4 mb-6 ${vista === 'mapa' ? 'hidden md:block' : 'block'}`}>
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
        </div>}

        {vista === 'colectivos' && <ColectivosPanel token={credencial} soloLectura={soloLectura} />}

        {vista === 'usuarios' && sesion.rol === 'inspector' && <UsuariosPanel token={credencial} />}

        {vista === 'lista' && (
          cochesFiltrados.length === 0 ? (
            <p className="bg-white rounded-lg shadow p-6 text-gray-600">Todavía no hay coches con GPS en este filtro.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {cochesFiltrados.map((coche) => {
                const signalAgeSec = coche.lastPing ? (Date.now() - new Date(coche.lastPing.timestamp).getTime()) / 1000 : Infinity;
                const tieneSignal = signalAgeSec < 120;
                return (
                <article
                  key={coche.id}
                  className={`bg-white rounded-lg shadow-md p-6 ${seleccionado === coche.id ? 'ring-4 ring-[#e53935]' : ''} ${!tieneSignal ? 'opacity-75' : ''}`}
                >
                  <div className="flex justify-between items-start mb-4 gap-2">
                    <button type="button" onClick={() => elegir(coche)} className="text-left">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-3.5 h-3.5 rounded-full inline-block ${
                            !tieneSignal
                              ? 'bg-amber-400 animate-pulse'
                              : coche.linea
                              ? 'bg-green-600'
                              : 'bg-gray-400'
                          }`}
                          title={!tieneSignal ? 'Señal atenuada' : coche.linea ? `Línea ${coche.linea}` : 'Sin línea'}
                        />
                        <h3 className="text-2xl font-bold text-gray-800">Coche {coche.id}</h3>
                      </div>
                      <p className="text-gray-600">{coche.chofer || 'Sin chofer'}</p>
                    </button>
                    <span className={`px-3 py-1 rounded text-sm font-medium ${coche.disponible ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {coche.disponible ? 'Disponible' : 'Fuera de servicio'}
                    </span>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-sm text-gray-600">Línea</label>
                        {!soloLectura && coche.linea && (
                          <button
                            type="button"
                            onClick={() => void asignarLinea(coche.id, '')}
                            className="text-xs text-red-600 hover:underline font-medium"
                          >
                            Retirar línea
                          </button>
                        )}
                      </div>
                      {soloLectura ? (
                        <p className="font-medium">{coche.linea ? `Línea ${coche.linea}` : 'Sin línea'}</p>
                      ) : (
                        <select
                          value={LINE_NUMBERS.includes(coche.linea) ? coche.linea : ''}
                          onChange={(e) => void asignarLinea(coche.id, e.target.value)}
                          className="w-full border border-gray-300 rounded px-3 py-2"
                        >
                          <option value="">Sin línea (Retirar)</option>
                          {LINE_NUMBERS.map((l) => (
                            <option key={l} value={l}>Línea {l}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-gray-600">Visible en ColeJUY</span>
                      {soloLectura ? (
                        <span className="text-sm font-medium">{coche.visibleEnColejuy ? 'Visible' : 'Oculto'}</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void toggleVisibilidad(coche)}
                          className={`px-4 py-2 rounded font-medium ${coche.visibleEnColejuy ? 'bg-urbano-red text-white' : 'bg-gray-200 text-gray-700'}`}
                        >
                          {coche.visibleEnColejuy ? 'Visible' : 'Oculto'}
                        </button>
                      )}
                    </div>
                    {coche.lastPing ? (
                      <div className="pt-3 border-t border-gray-200">
                        <p className="text-xs text-gray-500 font-mono">{coche.lastPing.lat.toFixed(4)}, {coche.lastPing.lng.toFixed(4)}</p>
                        <p className={`text-xs mt-1 ${tieneSignal ? 'text-green-700' : 'text-amber-700 font-medium'}`}>
                          {tiempoDesde(coche.lastPing.timestamp)}
                          {!tieneSignal ? ' (señal atenuada)' : ''}
                        </p>
                      </div>
                    ) : (
                      <p className="pt-3 border-t border-gray-200 text-sm text-red-700">Sin señal GPS</p>
                    )}
                  </div>
                </article>
              );
              })}
            </div>
          )
        )}

        {vista === 'mapa' && (
          <div className="flex-1 w-full h-full relative overflow-hidden md:flex-none md:bg-white md:rounded-lg md:shadow-md md:border-4 md:border-[#e53935]">
            {/* 1. Indicador flotante en vivo sobre el mapa (arriba a la derecha) */}
            <div className="md:hidden absolute top-3 right-3 z-30 pointer-events-auto">
              <div className="bg-white/95 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-md border border-gray-100 flex items-center gap-1.5 text-xs font-medium text-gray-700">
                <span className="hidden sm:inline">
                  {cochesFiltrados.length} de {coches.length} coches · {visibles.size} de {LINE_NUMBERS.length} líneas
                </span>
                <span className="sm:hidden">
                  {cochesFiltrados.length}/{coches.length} coches · {visibles.size}/{LINE_NUMBERS.length} lín.
                </span>
                {apiError ? (
                  <span className="text-red-700 font-semibold"> · {apiError}</span>
                ) : (
                  <span className="text-green-700 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-600 animate-pulse" />
                    en vivo
                  </span>
                )}
              </div>
            </div>

            {/* 2. Filtros de líneas flotantes a la izquierda (círculos individuales) */}
            <div
              className="md:hidden absolute top-3 left-3 bottom-3 z-30 flex flex-col pointer-events-none"
              style={{ maxHeight: 'calc(100% - 24px)' }}
            >
              {/* Controles Todas / Ninguna */}
              <div className="flex gap-1.5 mb-2 pointer-events-auto shrink-0">
                <button
                  type="button"
                  onClick={() => setVisibles(new Set(LINE_NUMBERS))}
                  className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-white/95 text-gray-800 shadow-md border border-gray-100 active:scale-95 transition-transform"
                >
                  Todas
                </button>
                <button
                  type="button"
                  onClick={() => setVisibles(new Set())}
                  className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-white/95 text-gray-800 shadow-md border border-gray-100 active:scale-95 transition-transform"
                >
                  Ninguna
                </button>
              </div>

              {/* Columna con scroll independiente */}
              <div
                className="flex flex-col gap-2 overflow-y-auto overscroll-contain pointer-events-auto no-scrollbar py-1 pr-1.5"
                style={{ touchAction: 'pan-y' }}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                onWheel={(e) => e.stopPropagation()}
              >
                {/* Botón circular Sin Línea */}
                <button
                  type="button"
                  aria-pressed={verSinLinea}
                  onClick={() => setVerSinLinea((v) => !v)}
                  className={`w-[52px] h-[52px] min-w-[52px] min-h-[52px] rounded-full flex flex-col items-center justify-center transition-all select-none active:scale-95 ${
                    verSinLinea
                      ? 'bg-[#e53935] text-white shadow-[0_2px_8px_rgba(0,0,0,0.3)] ring-2 ring-white/90'
                      : 'bg-[#b71c1c]/40 text-white/50 shadow-sm opacity-40 ring-1 ring-white/20'
                  }`}
                  title={`Sin línea (${coches.filter(sinLinea).length})`}
                >
                  <span className="font-extrabold text-xs leading-none tracking-tight">Sin</span>
                  <span className="text-[10px] leading-tight mt-0.5 font-medium">({coches.filter(sinLinea).length})</span>
                </button>

                {/* Botones circulares para cada línea */}
                {LINE_NUMBERS.map((n) => {
                  const on = visibles.has(n);
                  return (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={on}
                      title={lineNames(n)}
                      onClick={() => toggleLinea(n)}
                      className={`w-[52px] h-[52px] min-w-[52px] min-h-[52px] rounded-full relative flex flex-col items-center justify-center transition-all select-none active:scale-95 ${
                        on
                          ? 'bg-[#e53935] text-white shadow-[0_2px_8px_rgba(0,0,0,0.3)] ring-2 ring-white/90'
                          : 'bg-[#b71c1c]/40 text-white/50 shadow-sm opacity-40 ring-1 ring-white/20'
                      }`}
                    >
                      <span
                        className="absolute top-1 right-1.5 w-2 h-2 rounded-full border border-white shadow-sm"
                        style={{ background: on ? lineColor(n) : '#9e9e9e' }}
                      />
                      <span className="font-extrabold text-[15px] leading-none tracking-tight">{n}</span>
                      <span className="text-[10px] leading-tight mt-0.5 font-medium">({cochesPorLinea(n)})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Contenedor del mapa: 100% de alto y ancho en móvil, 600px en escritorio */}
            <div className="w-full h-full md:h-[600px]">
              <BusMap
                theme="light"
                buses={cochesFiltrados.filter((c) => c.lastPing).map((c): MapBus => {
                  const ageMs = Date.now() - new Date(c.lastPing!.timestamp).getTime();
                  const fresh = ageMs < 120000;
                  const hasLine = Boolean(c.linea && LINE_NUMBERS.includes(c.linea));
                  // Verde con texto negro si tiene línea; Gris con texto blanco si no tiene línea
                  const color = hasLine ? '#2e7d32' : '#757575';
                  const text = hasLine ? '#000000' : '#ffffff';
                  // Si tiene línea muestra el número de línea; si no, el número interno del coche
                  const label = hasLine ? String(c.linea) : numeroCartel(c.id);

                  return {
                    id: mapBusId(c.id),
                    line: c.linea || null,
                    lng: c.lastPing!.lng,
                    lat: c.lastPing!.lat,
                    label,
                    color,
                    text,
                    fresh,
                    speed: 0,
                    course: null,
                    moving: false,
                    age: ageMs / 1000,
                  };
                })}
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

        <div className={`mt-6 bg-white rounded-lg shadow-md p-6 ${vista === 'mapa' ? 'hidden md:block' : 'block'}`}>
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

function Marco({ children, isFullMap = false }: { children: React.ReactNode; isFullMap?: boolean }) {
  return (
    <div className={`bg-gray-50 ${isFullMap ? 'h-[100dvh] flex flex-col overflow-hidden md:h-auto md:min-h-screen md:block md:overflow-visible' : 'min-h-screen'}`}>
      <div className="pointer-events-none fixed inset-0 z-50 border-[6px] border-[#e53935]" aria-hidden="true" />
      {children}
    </div>
  );
}

interface HeaderProps {
  titulo: string;
  subtitulo?: string;
  extra?: React.ReactNode;
  onSalir?: () => void;
  identificador?: string;
  nav?: {
    vista: 'lista' | 'mapa' | 'colectivos' | 'usuarios';
    setVista: (v: 'lista' | 'mapa' | 'colectivos' | 'usuarios') => void;
    esInspector: boolean;
  };
}

function LogOutIcon({ className = 'w-[22px] h-[22px]' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </svg>
  );
}

function ListIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <line x1="8" x2="21" y1="6" y2="6" />
      <line x1="8" x2="21" y1="12" y2="12" />
      <line x1="8" x2="21" y1="18" y2="18" />
      <line x1="3" x2="3.01" y1="6" y2="6" />
      <line x1="3" x2="3.01" y1="12" y2="12" />
      <line x1="3" x2="3.01" y1="18" y2="18" />
    </svg>
  );
}

function MapPinIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function BusFrontIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 6 2 7" />
      <path d="M10 6h4" />
      <path d="m22 7-2-1" />
      <rect width="16" height="16" x="4" y="3" rx="2" />
      <path d="M4 11h16" />
      <path d="M8 15h.01" />
      <path d="M16 15h.01" />
      <path d="M6 19v2" />
      <path d="M18 19v2" />
    </svg>
  );
}

function UserRoundIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="5" />
      <path d="M20 21a8 8 0 0 0-16 0" />
    </svg>
  );
}

function NavMobileButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`min-h-[48px] py-2 px-1 rounded-[10px] flex flex-col items-center justify-center gap-1 transition-all select-none ${
        active
          ? 'bg-[#8e1515] ring-1 ring-white/25 shadow-inner'
          : 'bg-[#c62828] hover:bg-[#ba2220] active:bg-[#a51515]'
      }`}
    >
      <div className="text-white flex items-center justify-center leading-none">{icon}</div>
      <span className="text-[11px] sm:text-xs text-white font-medium tracking-tight leading-tight">
        {label}
      </span>
    </button>
  );
}

function Header({ titulo, subtitulo, extra, onSalir, identificador, nav }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 bg-[#e53935] text-white shadow-lg pt-[env(safe-area-inset-top,0px)]">
      <div className="max-w-7xl mx-auto px-4 pt-3 pb-3 md:py-5">
        {/* Fila 1: Título a la izquierda, salida a la derecha */}
        <div className="flex items-center justify-between gap-3 min-h-[44px]">
          <div className="flex flex-col justify-center">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white leading-none">
              {titulo}
            </h1>
            {subtitulo && (
              <p className={`text-red-100 mt-1 text-sm font-normal ${nav ? 'hidden md:block' : ''}`}>
                {subtitulo}
              </p>
            )}
          </div>

          {onSalir ? (
            <div className="flex items-center">
              {/* Móvil: botón ícono blanco LogOut con área táctil mínima de 44x44px */}
              <button
                type="button"
                onClick={onSalir}
                aria-label="Cerrar sesión"
                title="Cerrar sesión"
                className="md:hidden w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-white bg-transparent hover:bg-white/10 active:bg-white/20 transition-colors focus:outline-none focus:ring-2 focus:ring-white/50"
              >
                <LogOutIcon className="w-[22px] h-[22px]" />
              </button>

              {/* Escritorio: enlace clásico de salida con nombre de usuario */}
              <button
                type="button"
                onClick={onSalir}
                className="hidden md:inline-block text-sm underline hover:text-red-100 transition-colors"
              >
                Salir · {identificador}
              </button>
            </div>
          ) : (
            extra
          )}
        </div>

        {/* Fila 2: Navegación móvil integrada en la cabecera roja */}
        {nav && (
          <nav aria-label="Navegación principal" className="md:hidden mt-3">
            <div className={`grid ${nav.esInspector ? 'grid-cols-4' : 'grid-cols-3'} gap-2`}>
              <NavMobileButton
                active={nav.vista === 'lista'}
                onClick={() => nav.setVista('lista')}
                icon={<ListIcon className="w-5 h-5 text-white" />}
                label="Lista"
              />
              <NavMobileButton
                active={nav.vista === 'mapa'}
                onClick={() => nav.setVista('mapa')}
                icon={<MapPinIcon className="w-5 h-5 text-white" />}
                label="Mapa"
              />
              <NavMobileButton
                active={nav.vista === 'colectivos'}
                onClick={() => nav.setVista('colectivos')}
                icon={<BusFrontIcon className="w-5 h-5 text-white" />}
                label="Colectivos"
              />
              {nav.esInspector && (
                <NavMobileButton
                  active={nav.vista === 'usuarios'}
                  onClick={() => nav.setVista('usuarios')}
                  icon={<UserRoundIcon className="w-5 h-5 text-white" />}
                  label="Usuarios"
                />
              )}
            </div>
          </nav>
        )}
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
