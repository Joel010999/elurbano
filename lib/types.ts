export interface PingPayload {
  cocheId: string;
  lat: number;
  lng: number;
  timestamp: string;
  turnoId: string;
  choferToken: string;
  linea?: string;
  actualizarLinea?: boolean;
  disponible?: boolean;
}

export interface CocheData {
  lat: string;
  lng: string;
  timestamp: string;
  linea: string;
  visibleEnColejuy: string; // Redis stores as string
  disponible: string;
  coche: string;
  chofer: string;
}

export interface CocheResponse {
  id: string;
  linea: string;
  lastPing: {
    lat: number;
    lng: number;
    timestamp: string;
  };
  visibleEnColejuy?: boolean;
  disponible?: boolean;
  chofer?: string;
}

export type Rol = 'chofer' | 'inspector' | 'veedor';

export interface Usuario {
  id: string;
  identificador: string;
  /** Email de Google / ABM; si falta, se usa identificador. */
  email?: string;
  rol: Rol;
  token: string;
  activo: boolean;
}

export interface FleetResponse {
  coches: CocheResponse[];
}

export interface LineaPayload {
  linea: string;
  inspectorToken: string;
}

export interface VisibilidadPayload {
  visibleEnColejuy: boolean;
  inspectorToken: string;
}
