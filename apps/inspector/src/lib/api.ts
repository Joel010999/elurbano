export const API_BASE = (() => {
  if (process.env.NEXT_PUBLIC_URBANO_API_BASE) {
    return process.env.NEXT_PUBLIC_URBANO_API_BASE.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    return ''; // Mismo dominio (Railway o hosting combinado)
  }
  return 'https://colejuy-urbano.vercel.app';
})();

/** ID de cliente de Google Identity Services. Vacío si falta GOOGLE_CLIENT_ID en el build. */
export const GOOGLE_CLIENT_ID = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '').trim();

export const DEMO_INSPECTOR_USUARIO = 'inspector-demo';
export const DEMO_VEEDOR_USUARIO = 'veedor-demo';
export const DEMO_CLAVE = '1';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, token: string | null, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers, cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data.error === 'string' ? data.error : `HTTP ${response.status}`;
    throw new ApiError(response.status, message);
  }
  return data as T;
}
