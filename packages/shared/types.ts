// Shared types for El Urbano

export interface Coche {
  id: string;
  linea: string;
  lastPing: {
    lat: number;
    lng: number;
    timestamp: string;
  } | null;
  visibleEnColejuy: boolean;
  chofer: string;
  disponible: boolean;
}

export interface PingPayload {
  cocheId: string;
  turnoId: string;
  lat: number;
  lng: number;
  timestamp: string;
  accuracy: number;
  choferToken: string;
}

export interface FleetResponse {
  coches: Coche[];
}

export interface AsignacionPayload {
  linea: string;
  inspectorToken: string;
}

export interface VisibilidadPayload {
  visibleEnColejuy: boolean;
  inspectorToken: string;
}
