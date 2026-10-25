'use client';

import { useState, useEffect } from 'react';
import type { Coche } from '../../../packages/shared/types';

// Mock data for demo - en producción vendría de API
const MOCK_COCHES: Coche[] = [
  {
    id: '101',
    linea: 'A',
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
    linea: 'B',
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
    linea: 'A',
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
  const [filtroLinea, setFiltroLinea] = useState<string>('todas');

  const lineas = Array.from(new Set(coches.map(c => c.linea))).sort();
  const cochesFiltrados = filtroLinea === 'todas'
    ? coches
    : coches.filter(c => c.linea === filtroLinea);

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
          <div className="flex gap-4 items-center">
            <label className="font-medium">Línea:</label>
            <select
              value={filtroLinea}
              onChange={(e) => setFiltroLinea(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2"
            >
              <option value="todas">Todas</option>
              {lineas.map(l => (
                <option key={l} value={l}>Línea {l}</option>
              ))}
            </select>
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
                      {lineas.map(l => (
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
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="h-[600px] flex items-center justify-center bg-gray-100 rounded">
              <div className="text-center">
                <div className="text-6xl mb-4">🗺️</div>
                <p className="text-xl font-medium text-gray-700 mb-2">
                  Mapa en Tiempo Real
                </p>
                <p className="text-gray-500 max-w-md">
                  El mapa reutiliza los componentes visuales de ColeJUY (BusMap.tsx).
                  Para ver el mapa funcionando, integra MapLibre GL con los componentes
                  copiados de /workspace/colejuy/src/components/BusMap.tsx
                </p>
                <div className="mt-6 text-left bg-white p-4 rounded border border-gray-200 max-w-md mx-auto">
                  <p className="font-bold text-urbano-red mb-2">Coches activos:</p>
                  <ul className="space-y-1 text-sm">
                    {cochesFiltrados
                      .filter(c => c.lastPing)
                      .map(c => (
                        <li key={c.id} className="flex items-center gap-2">
                          <span className="w-2 h-2 bg-urbano-red rounded-full"></span>
                          <span>Coche {c.id} - Línea {c.linea}</span>
                          {c.visibleEnColejuy && <span className="text-xs">👁️</span>}
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
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
