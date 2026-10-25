'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Coche } from '../../../../packages/shared/types';
import BusMap, { type MapBus, type MapPath } from '../components/BusMap';
import urbanoLinesData from '../data/urbano-lines.json';

type UrbanoLine = { id: string; number: string; name: string; paths: MapPath[] };
const URBANO_LINES = urbanoLinesData as UrbanoLine[];
// Números únicos de línea (13 y 42 tienen dos variantes)
const LINE_NUMBERS = Array.from(new Set(URBANO_LINES.map(l => l.number)))
  .sort((a, b) => parseInt(a) - parseInt(b));
const PALETTE = ['#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#00897b', '#6d4c41', '#d81b60', '#3949ab', '#7cb342', '#f4511e', '#546e7a'];
const lineColor = (n: string) => PALETTE[LINE_NUMBERS.indexOf(n) % PALETTE.length] ?? '#e53935';

const API_BASE = process.env.NEXT_PUBLIC_URBANO_API_BASE;
const INSPECTOR_TOKEN = process.env.NEXT_PUBLIC_URBANO_INSPECTOR_TOKEN ?? '';

// Mock data for demo - en producción vendría de API
const MOCK_COCHES: Coche[] = [
  {
    id: '101',
    linea: '1',
    lastPing: {
      lat: -24.1858,
      lng: -65.2995,
      timestamp: new Date().toISOString(),
    },
    visibleEnColejuy: true,
    chofer: 'Juan Pérez',
    disponible: true,
  },
  {
    id: '102',
    linea: '7',
    lastPing: {
      lat: -24.1920,
      lng: -65.3050,
      timestamp: new Date(Date.now() - 120000).toISOString(),
    },
    visibleEnColejuy: true,
    chofer: 'María González',
    disponible: true,
  },
  {
    id: '103',
    linea: '14',
    lastPing: null,
    visibleEnColejuy: false,
    chofer: 'Pedro Rodríguez',
    disponible: false,
  },
];

function tiempoDesde(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutos = Math.floor(diff / 60000);
  if (minutos < 1) return 'Ahora';
  if (minutos === 1) return 'Hace 1 minuto';
  if (minutos < 60) return `Hace ${minutos} minutos`;
  const horas = Math.floor(minutos / 60);
  return `Hace ${horas} hora${horas > 1 ? 's' : ''}`;
}

export default function InspectorPage() {
  const [coches, setCoches] = useState<Coche[]>(MOCK_COCHES);
  const [vistaActual, setVistaActual] = useState<'lista' | 'mapa'>('lista');
  const [visibles, setVisibles] = useState<Set<string>>(() => new Set(LINE_NUMBERS));
  const [apiError, setApiError] = useState<string | null>(null);

  // Si hay API configurada, poll de la flota real; si no, mock offline.
  useEffect(() => {
    if (!API_BASE) return;
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/urbano/fleet?mode=inspector`, {
          headers: INSPECTOR_TOKEN ? { Authorization: `Bearer ${INSPECTOR_TOKEN}` } : {},
          cache: 'no-store',
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (alive && Array.isArray(data.coches)) {
          setCoches(data.coches.map((c: Coche) => ({ ...c, disponible: c.disponible ?? true, linea: String(c.linea) })));
          setApiError(null);
        }
      } catch (e) {
        if (alive) setApiError(e instanceof Error ? e.message : 'error');
      }
    };
    load();
    const t = setInterval(load, 10000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const toggleLinea = (n: string) => setVisibles(prev => {
    const next = new Set(prev);
    if (next.has(n)) next.delete(n); else next.add(n);
    return next;
  });

  const cochesFiltrados = coches.filter(c => visibles.has(c.linea));
  const cochesPorLinea = (n: string) => coches.filter(c => c.linea === n).length;

  const mapPaths = useMemo<MapPath[]>(() =>
    URBANO_LINES.filter(l => visibles.has(l.number)).flatMap(l =>
      l.paths.map(p => ({ direction: p.direction, coordinates: p.coordinates, color: lineColor(l.number) }))),
  [visibles]);

  const toggleVisibilidad = (cocheId: string) => {
    setCoches(prev => prev.map(c =>
      c.id === cocheId
        ? { ...c, visibleEnColejuy: !c.visibleEnColejuy }
        : c
    ));
  };

  const asignarLinea = (cocheId: string, nuevaLinea: string) => {
    setCoches(prev => prev.map(c =>
      c.id === cocheId
        ? { ...c, linea: nuevaLinea }
        : c
    ));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-urbano-red text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold">El Urbano - Inspector</h1>
          <p className="text-red-100 mt-1">Panel de Control de Flota</p>
        </div>
      </header>

      {/* Controls */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="bg-white rounded-lg shadow p-4 mb-6 flex flex-wrap gap-4 items-center justify-between">
          <div className="text-sm text-gray-600">
            {cochesFiltrados.length} de {coches.length} coches · {visibles.size} de {LINE_NUMBERS.length} líneas
            {API_BASE ? (apiError ? <span className="text-amber-600"> · API: {apiError}</span> : <span className="text-green-600"> · en vivo</span>) : <span> · demo (mock)</span>}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setVistaActual('lista')}
              className={`px-4 py-2 rounded font-medium transition ${
                vistaActual === 'lista'
                  ? 'bg-urbano-red text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Lista
            </button>
            <button
              onClick={() => setVistaActual('mapa')}
              className={`px-4 py-2 rounded font-medium transition ${
                vistaActual === 'mapa'
                  ? 'bg-urbano-red text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Mapa
            </button>
          </div>
        </div>

        {/* Panel de Líneas */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-lg">Líneas</h2>
            <div className="flex gap-2">
              <button onClick={() => setVisibles(new Set(LINE_NUMBERS))} className="px-3 py-1 rounded text-sm font-medium bg-urbano-red text-white">Todas</button>
              <button onClick={() => setVisibles(new Set())} className="px-3 py-1 rounded text-sm font-medium bg-gray-200 text-gray-700 hover:bg-gray-300">Ninguna</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {LINE_NUMBERS.map(n => {
              const on = visibles.has(n);
              const nombres = URBANO_LINES.filter(l => l.number === n).map(l => l.name).join(' / ');
              return (
                <button
                  key={n}
                  title={nombres}
                  aria-pressed={on}
                  onClick={() => toggleLinea(n)}
                  className={`px-3 py-2 rounded-full text-sm font-medium transition flex items-center gap-2 ${
                    on ? 'bg-urbano-red text-white' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                  }`}
                >
                  <span className="inline-block w-3 h-3 rounded-full border border-white" style={{ background: on ? lineColor(n) : '#9e9e9e' }} />
                  Línea {n}
                  <span className={`text-xs ${on ? 'text-red-100' : 'text-gray-400'}`}>({cochesPorLinea(n)})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Lista de Coches */}
        {vistaActual === 'lista' && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {cochesFiltrados.map(coche => (
              <div key={coche.id} className="bg-white rounded-lg shadow-md p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-800">
                      Coche {coche.id}
                    </h3>
                    <p className="text-gray-600">{coche.chofer}</p>
                  </div>
                  <div className={`px-3 py-1 rounded text-sm font-medium ${
                    coche.disponible
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {coche.disponible ? 'Disponible' : 'Fuera de servicio'}
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      Línea:
                    </label>
                    <select
                      value={coche.linea}
                      onChange={(e) => asignarLinea(coche.id, e.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-2"
                    >
                      {!LINE_NUMBERS.includes(coche.linea) && (
                        <option value={coche.linea}>Línea {coche.linea} (fuera de catálogo)</option>
                      )}
                      {LINE_NUMBERS.map(l => (
                        <option key={l} value={l}>Línea {l}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="text-sm text-gray-600">
                      Visible en ColeJUY:
                    </label>
                    <button
                      onClick={() => toggleVisibilidad(coche.id)}
                      className={`px-4 py-2 rounded font-medium transition ${
                        coche.visibleEnColejuy
                          ? 'bg-urbano-red text-white'
                          : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      {coche.visibleEnColejuy ? '👁️ Visible' : '🚫 Oculto'}
                    </button>
                  </div>

                  {coche.lastPing ? (
                    <div className="pt-3 border-t border-gray-200">
                      <p className="text-sm text-gray-600">GPS:</p>
                      <p className="text-xs text-gray-500 font-mono">
                        {coche.lastPing.lat.toFixed(4)}, {coche.lastPing.lng.toFixed(4)}
                      </p>
                      <p className="text-xs text-green-600 mt-1">
                        {tiempoDesde(coche.lastPing.timestamp)}
                      </p>
                    </div>
                  ) : (
                    <div className="pt-3 border-t border-gray-200">
                      <p className="text-sm text-amber-600">⚠️ Sin señal GPS</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Mapa View */}
        {vistaActual === 'mapa' && (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="h-[600px]">
              <BusMap
                theme="light"
                buses={cochesFiltrados
                  .filter(c => c.lastPing)
                  .map((c): MapBus => ({
                    id: parseInt(c.id),
                    line: c.linea,
                    lng: c.lastPing!.lng,
                    lat: c.lastPing!.lat,
                    label: (c as Coche & { patente?: string }).patente ?? `${c.id}`,
                    color: lineColor(c.linea),
                    text: '#ffffff',
                    fresh: (Date.now() - new Date(c.lastPing!.timestamp).getTime()) < 120000,
                    speed: 0,
                    course: null,
                    moving: false,
                    age: (Date.now() - new Date(c.lastPing!.timestamp).getTime()) / 1000,
                  }))
                }
                paths={mapPaths}
                activeDirection={null}
                color="#e53935"
                stops={[]}
                selectedStop={null}
                subePoints={[]}
                selectedSube={null}
                me={null}
                followBusId={null}
                onUnfollow={() => {}}
                pins={[]}
                fitKey={`inspector-${Array.from(visibles).join(",")}`}
                frame={[]}
                focus={null}
                routes={[]}
                legend={false}
                onBus={(id) => console.log('Bus clicked:', id)}
                onStop={(id) => console.log('Stop clicked:', id)}
                onSube={(id) => console.log('SUBE clicked:', id)}
                onMap={(point) => console.log('Map clicked:', point)}
              />
            </div>
          </div>
        )}

        {/* Stats Footer */}
        <div className="mt-6 bg-white rounded-lg shadow-md p-6">
          <div className="grid grid-cols-3 gap-6 text-center">
            <div>
              <p className="text-3xl font-bold text-urbano-red">
                {coches.filter(c => c.lastPing).length}
              </p>
              <p className="text-gray-600">Con GPS Activo</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-green-600">
                {coches.filter(c => c.disponible).length}
              </p>
              <p className="text-gray-600">Disponibles</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-blue-600">
                {coches.filter(c => c.visibleEnColejuy).length}
              </p>
              <p className="text-gray-600">Visibles en ColeJUY</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
