import { randomUUID } from 'node:crypto';
import { ErrorApi } from './auth';
import { getRedisClient } from './redis';
import { ensureUsuarios, type Rol } from './usuarios';

export interface Colectivo {
  id: string;
  numero: string;
  patente: string;
  activo: boolean;
}

const SEMILLA: Colectivo[] = [
  { id: 'demo-101', numero: '101', patente: 'ABC101', activo: true },
  { id: 'demo-102', numero: '102', patente: 'ABC102', activo: true },
  { id: 'demo-103', numero: '103', patente: 'ABC103', activo: false },
];

function clave(id: string): string {
  return `urbano:colectivo:${id}`;
}

function aColectivo(data: Record<string, string>): Colectivo | null {
  if (!data.id || !data.numero || !data.patente) return null;
  return {
    id: data.id,
    numero: data.numero,
    patente: data.patente,
    activo: data.activo === 'true',
  };
}

async function guardar(colectivo: Colectivo): Promise<void> {
  const redis = getRedisClient();
  await redis.hset(clave(colectivo.id), {
    id: colectivo.id,
    numero: colectivo.numero,
    patente: colectivo.patente,
    activo: colectivo.activo ? 'true' : 'false',
  });
}

export async function ensureColectivos(): Promise<void> {
  await ensureUsuarios();
  const redis = getRedisClient();
  const meta = await redis.hgetall('urbano:meta');
  if (meta?.colectivos === '1') return;
  for (const seed of SEMILLA) {
    const actual = await redis.hgetall(clave(seed.id));
    if (!actual) await guardar(seed);
  }
  const latest = (await redis.hgetall('urbano:meta')) ?? {};
  await redis.hset('urbano:meta', { ...latest, colectivos: '1' });
}

export async function listarColectivos(rol: Rol): Promise<Colectivo[]> {
  await ensureColectivos();
  const redis = getRedisClient();
  const keys = await redis.keys('urbano:colectivo:*');
  const colectivos: Colectivo[] = [];
  for (const key of keys) {
    const data = await redis.hgetall(key);
    if (!data) continue;
    const colectivo = aColectivo(data);
    if (!colectivo) continue;
    if (rol === 'chofer' && !colectivo.activo) continue;
    colectivos.push(colectivo);
  }
  colectivos.sort((a, b) => a.numero.localeCompare(b.numero, 'es'));
  return colectivos;
}

function leerTexto(valor: unknown, campo: string): string {
  if (typeof valor !== 'string' || !valor.trim()) {
    throw new ErrorApi(400, `${campo} es obligatorio`);
  }
  return valor.trim();
}

export async function crearColectivo(body: { numero?: unknown; patente?: unknown; activo?: unknown }): Promise<Colectivo> {
  await ensureColectivos();
  const colectivo: Colectivo = {
    id: randomUUID(),
    numero: leerTexto(body.numero, 'numero'),
    patente: leerTexto(body.patente, 'patente'),
    activo: body.activo === undefined ? true : body.activo === true,
  };
  if (body.activo !== undefined && typeof body.activo !== 'boolean') {
    throw new ErrorApi(400, 'activo debe ser booleano');
  }
  await guardar(colectivo);
  return colectivo;
}

export async function actualizarColectivo(
  id: string,
  body: { numero?: unknown; patente?: unknown; activo?: unknown }
): Promise<Colectivo> {
  await ensureColectivos();
  if (!id) throw new ErrorApi(400, 'Id de colectivo inválido');
  const redis = getRedisClient();
  const actual = await redis.hgetall(clave(id));
  const previo = actual ? aColectivo(actual) : null;
  if (!previo) throw new ErrorApi(404, 'Colectivo no encontrado');
  if (body.numero === undefined && body.patente === undefined && body.activo === undefined) {
    throw new ErrorApi(400, 'No hay campos para actualizar');
  }
  const siguiente: Colectivo = { ...previo };
  if (body.numero !== undefined) siguiente.numero = leerTexto(body.numero, 'numero');
  if (body.patente !== undefined) siguiente.patente = leerTexto(body.patente, 'patente');
  if (body.activo !== undefined) {
    if (typeof body.activo !== 'boolean') throw new ErrorApi(400, 'activo debe ser booleano');
    siguiente.activo = body.activo;
  }
  await guardar(siguiente);
  return siguiente;
}

export async function borrarColectivo(id: string): Promise<void> {
  await ensureColectivos();
  if (!id) throw new ErrorApi(400, 'Id de colectivo inválido');
  const redis = getRedisClient();
  const actual = await redis.hgetall(clave(id));
  if (!actual) throw new ErrorApi(404, 'Colectivo no encontrado');
  await redis.del(clave(id));
}

export function puedeEscribirColectivos(rol: Rol): boolean {
  return rol === 'inspector';
}
