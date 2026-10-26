export const API_BASE = (
  process.env.NEXT_PUBLIC_URBANO_API_BASE || 'https://colejuy-urbano.vercel.app'
).replace(/\/$/, '');

export const DEMO_INSPECTOR = process.env.NEXT_PUBLIC_URBANO_INSPECTOR_TOKEN || 'inspector-token-example';
export const DEMO_VEEDOR = process.env.NEXT_PUBLIC_URBANO_VEEDOR_TOKEN || 'veedor-token-example';

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
