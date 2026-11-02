export const API_BASE = (
  process.env.EXPO_PUBLIC_API_URL ||
  process.env.EXPO_PUBLIC_URBANO_API_BASE ||
  'https://colejuy-urbano.vercel.app'
).replace(/\/$/, '');

export const GOOGLE_CLIENT_ID = (process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '').trim();
export const GOOGLE_REDIRECT_URI = (process.env.EXPO_PUBLIC_GOOGLE_REDIRECT_URI || '').trim();

export type Rol = 'chofer' | 'inspector' | 'veedor';

export interface Sesion {
  token: string;
  id: string;
  identificador: string;
  rol: Rol;
}

export interface Colectivo {
  id: string;
  numero: string;
  patente: string;
  activo: boolean;
}

export interface MuniLine {
  id: string;
  number: string;
  name: string;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function mensajeError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    if (/network request failed|failed to fetch|network error/i.test(error.message)) {
      return 'Sin conexión con la API';
    }
    return error.message;
  }
  return fallback;
}

async function leerError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: unknown };
    if (typeof data.error === 'string' && data.error.trim()) return data.error.trim();
  } catch {
    // La API a veces responde sin JSON.
  }
  return `HTTP ${response.status}`;
}

async function postJson<T>(path: string, body: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new ApiError(response.status, await leerError(response));
  return (await response.json()) as T;
}

function aSesion(data: unknown): Sesion {
  if (!data || typeof data !== 'object') throw new Error('Respuesta de login inválida');
  const row = data as Partial<Sesion>;
  if (typeof row.token !== 'string' || !row.token.trim()) throw new Error('El servidor no devolvió token');
  if (row.rol !== 'chofer' && row.rol !== 'inspector' && row.rol !== 'veedor') {
    throw new Error('Respuesta de login inválida');
  }
  return {
    token: row.token.trim(),
    id: typeof row.id === 'string' ? row.id : '',
    identificador: typeof row.identificador === 'string' ? row.identificador : '',
    rol: row.rol,
  };
}

export function exigirChofer(sesion: Sesion): Sesion {
  if (sesion.rol !== 'chofer') throw new Error('Esta cuenta no es de chofer.');
  return sesion;
}

export async function loginClave(usuario: string, clave: string): Promise<Sesion> {
  const data = await postJson<unknown>('/api/urbano/auth/login', { usuario, clave });
  return exigirChofer(aSesion(data));
}

export async function loginGoogle(idToken: string): Promise<Sesion> {
  const data = await postJson<unknown>('/api/urbano/auth/google', { idToken });
  return exigirChofer(aSesion(data));
}

function aColectivo(value: unknown): Colectivo | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<Colectivo>;
  if (typeof row.id !== 'string' || !row.id.trim()) return null;
  if (typeof row.numero !== 'string' || !row.numero.trim()) return null;
  return {
    id: row.id.trim(),
    numero: row.numero.trim(),
    patente: typeof row.patente === 'string' ? row.patente.trim() : '',
    activo: row.activo !== false,
  };
}

export async function listarColectivos(token: string): Promise<Colectivo[]> {
  const response = await fetch(`${API_BASE}/api/urbano/colectivos`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new ApiError(response.status, await leerError(response));
  const data = (await response.json()) as { colectivos?: unknown };
  const lista = Array.isArray(data.colectivos) ? data.colectivos.flatMap((item) => {
    const colectivo = aColectivo(item);
    return colectivo && colectivo.activo ? [colectivo] : [];
  }) : [];
  lista.sort((a, b) => a.numero.localeCompare(b.numero, 'es', { numeric: true }));
  return lista;
}

function aLinea(value: unknown): MuniLine | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<MuniLine>;
  if (typeof row.id !== 'string' || typeof row.number !== 'string') return null;
  return {
    id: row.id,
    number: row.number,
    name: typeof row.name === 'string' && row.name.trim() ? row.name : `Línea ${row.number}`,
  };
}

export async function listarLineas(): Promise<MuniLine[] | null> {
  const response = await fetch(`${API_BASE}/api/urbano/lineas`);
  if (!response.ok) return null;
  const data = (await response.json()) as { lineas?: unknown };
  if (!Array.isArray(data.lineas) || data.lineas.length === 0) return null;
  const lineas = data.lineas.flatMap((item) => {
    const linea = aLinea(item);
    return linea ? [linea] : [];
  });
  return lineas.length > 0 ? lineas : null;
}

export interface CocheEstado {
  id: string;
  linea: string;
}

export async function obtenerCoche(cocheId: string, token: string): Promise<CocheEstado | null> {
  try {
    const response = await fetch(`${API_BASE}/api/urbano/coche/${encodeURIComponent(cocheId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { coche?: { id: string; linea: string } };
    return data.coche ? { id: data.coche.id, linea: data.coche.linea || '' } : null;
  } catch {
    return null;
  }
}
