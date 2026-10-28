'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import type { Coche } from '../../../../../packages/shared/types';
import type { MapBus, MapPath } from '../../components/BusMap';
import { api } from '../../lib/api';
import { LINE_NUMBERS, URBANO_LINES, lineColor, lineNames, mapBusId, numeroCartel } from '../../lib/catalog';

const BusMap = dynamic(() => import('../../components/BusMap'), {
  ssr: false,
  loading: () => <div className="map-wait">Cargando mapa de San Salvador de Jujuy…</div>,
});

function normalizar(c: Coche): Coche {
  const ping = c.lastPing && Number.isFinite(c.lastPing.lat) && Number.isFinite(c.lastPing.lng) ? c.lastPing : null;
  return {
    ...c,
    lastPing: ping,
    linea: c.linea ? String(c.linea) : '',
    disponible: c.disponible ?? true,
    visibleEnColejuy: Boolean(c.visibleEnColejuy),
    chofer: '', // Información privada omitida
  };
}

export default function PasajeroPage() {
  const [lineaSeleccionada, setLineaSeleccionada] = useState<string>('1');
  const [coches, setCoches] = useState<Coche[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [followId, setFollowId] = useState<number | null>(null);

  useEffect(() => {
    let vivo = true;
    const cargarFlota = async () => {
      try {
        const data = await api<{ coches: Coche[] }>('/api/urbano/fleet?mode=public', null);
        if (vivo && Array.isArray(data.coches)) {
          setCoches(data.coches.map(normalizar));
          setError(null);
        }
      } catch (err) {
        if (vivo) setError(err instanceof Error ? err.message : 'Error al conectar con la flota');
      } finally {
        if (vivo) setCargando(false);
      }
    };

    void cargarFlota();
    const timer = setInterval(cargarFlota, 3000); // Polling automático cada 3 segundos
    return () => {
      vivo = false;
      clearInterval(timer);
    };
  }, []);

  // Colectivos filtrados para la línea elegida
  const cochesDeLinea = useMemo(() => {
    return coches.filter((c) => c.linea === lineaSeleccionada && c.lastPing);
  }, [coches, lineaSeleccionada]);

  // Recorrido de la línea seleccionada
  const mapPaths = useMemo<MapPath[]>(() => {
    return URBANO_LINES.filter((l) => l.number === lineaSeleccionada).flatMap((l) =>
      l.paths.map((p) => ({
        direction: p.direction,
        coordinates: p.coordinates,
        color: lineColor(l.number),
      })),
    );
  }, [lineaSeleccionada]);

  const nombreLinea = useMemo(() => {
    return lineNames(lineaSeleccionada) || `Línea ${lineaSeleccionada}`;
  }, [lineaSeleccionada]);

  return (
    <div className="flex flex-col h-screen w-full bg-slate-900 text-white font-sans overflow-hidden">
      {/* Header móvil */}
      <header className="bg-red-600 px-4 py-3 shadow-md flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <div className="bg-white text-red-600 font-extrabold text-xs px-2 py-0.5 rounded shadow">
            EL URBANO
          </div>
          <h1 className="text-lg font-bold tracking-tight">Colectivos en vivo</h1>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-red-100">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
          <span>En vivo</span>
        </div>
      </header>

      {/* Selector horizontal de Líneas */}
      <div className="bg-slate-800 border-b border-slate-700/80 px-2 py-2.5 z-10">
        <div className="flex gap-2 overflow-x-auto no-scrollbar scroll-smooth pb-1 px-1">
          {LINE_NUMBERS.map((n) => {
            const activo = n === lineaSeleccionada;
            const cantidad = coches.filter((c) => c.linea === n).length;
            return (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setLineaSeleccionada(n);
                  setFollowId(null);
                }}
                className={`flex-shrink-0 flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-semibold transition shadow-sm ${
                  activo
                    ? 'bg-red-600 text-white ring-2 ring-white/50'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full border border-white/60"
                  style={{ backgroundColor: lineColor(n) }}
                />
                <span>Línea {n}</span>
                {cantidad > 0 && (
                  <span
                    className={`text-xs px-1.5 py-0.2 rounded-full font-bold ${
                      activo ? 'bg-white text-red-600' : 'bg-emerald-600 text-white'
                    }`}
                  >
                    {cantidad}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Contenedor del Mapa */}
      <div className="relative flex-1 w-full h-full bg-slate-950">
        <BusMap
          theme="light"
          buses={cochesDeLinea.map((c): MapBus => {
            const ageMs = Date.now() - new Date(c.lastPing!.timestamp).getTime();
            return {
              id: mapBusId(c.id),
              line: c.linea,
              lng: c.lastPing!.lng,
              lat: c.lastPing!.lat,
              label: c.linea, // En el mapa público se muestra la línea destacada
              color: '#2e7d32', // Verde
              text: '#000000',
              fresh: ageMs < 120000,
              speed: 0,
              course: null,
              moving: false,
              age: ageMs / 1000,
            };
          })}
          paths={mapPaths}
          activeDirection={null}
          color={lineColor(lineaSeleccionada)}
          stops={[]}
          selectedStop={null}
          subePoints={[]}
          selectedSube={null}
          me={null}
          followBusId={followId}
          onUnfollow={() => setFollowId(null)}
          pins={[]}
          fitKey={`pasajero-linea-${lineaSeleccionada}`}
          frame={[]}
          focus={null}
          routes={[]}
          legend={false}
          onBus={(id) => setFollowId(id)}
          onStop={() => undefined}
          onSube={() => undefined}
          onMap={() => undefined}
        />

        {/* Tarjeta flotante inferior informativa */}
        <div className="absolute bottom-4 left-4 right-4 z-10 pointer-events-none">
          <div className="bg-slate-900/95 backdrop-blur border border-slate-700/80 rounded-xl shadow-xl p-3.5 text-slate-200 pointer-events-auto">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-400">Recorrido activo</p>
                <h2 className="text-base font-bold text-white leading-tight">
                  Línea {lineaSeleccionada}
                </h2>
                <p className="text-xs text-slate-300 line-clamp-1">{nombreLinea}</p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-emerald-400">
                  {cochesDeLinea.length}
                </span>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">
                  {cochesDeLinea.length === 1 ? 'colectivo en vivo' : 'colectivos en vivo'}
                </p>
              </div>
            </div>

            {error && (
              <p className="mt-2 text-xs text-red-400 bg-red-950/50 rounded p-1.5 border border-red-800">
                {error}
              </p>
            )}
            {!cargando && cochesDeLinea.length === 0 && (
              <p className="mt-2 text-xs text-amber-300 bg-amber-950/40 rounded p-1.5 border border-amber-800/80">
                No hay unidades transmitiendo en esta línea en este momento.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
