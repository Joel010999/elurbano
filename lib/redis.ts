import type { CocheData } from './types';

// In-memory fallback (survives warm Vercel isolates — ok for short GPS tests)
const g = globalThis as typeof globalThis & { __urbanoStore?: Map<string, Record<string, string>> };
if (!g.__urbanoStore) g.__urbanoStore = new Map();
const inMemoryStore = g.__urbanoStore;

interface RedisClient {
  hset(key: string, data: Record<string, string>): Promise<void>;
  hgetall(key: string): Promise<Record<string, string> | null>;
  keys(pattern: string): Promise<string[]>;
  expire(key: string, seconds: number): Promise<void>;
}

class InMemoryRedis implements RedisClient {
  async hset(key: string, data: Record<string, string>): Promise<void> {
    inMemoryStore.set(key, { ...data });
  }

  async hgetall(key: string): Promise<Record<string, string> | null> {
    return inMemoryStore.get(key) || null;
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return Array.from(inMemoryStore.keys()).filter(key => regex.test(key));
  }

  async expire(_key: string, _seconds: number): Promise<void> {
    // In-memory doesn't implement TTL for simplicity
  }
}

class UpstashRedis implements RedisClient {
  private url: string;
  private token: string;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  private async request(command: string[]): Promise<any> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });

    if (!response.ok) {
      throw new Error(`Redis request failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.result;
  }

  async hset(key: string, data: Record<string, string>): Promise<void> {
    const args = Object.entries(data).flat();
    await this.request(['HSET', key, ...args]);
  }

  async hgetall(key: string): Promise<Record<string, string> | null> {
    const result = await this.request(['HGETALL', key]);
    if (!result || result.length === 0) return null;

    const obj: Record<string, string> = {};
    for (let i = 0; i < result.length; i += 2) {
      obj[result[i]] = result[i + 1];
    }
    return obj;
  }

  async keys(pattern: string): Promise<string[]> {
    return await this.request(['KEYS', pattern]);
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.request(['EXPIRE', key, seconds.toString()]);
  }
}

let redisClient: RedisClient | null = null;

export function getRedisClient(): RedisClient {
  if (redisClient) return redisClient;

  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (upstashUrl && upstashToken) {
    console.log('Using Upstash Redis');
    redisClient = new UpstashRedis(upstashUrl, upstashToken);
  } else {
    console.log('Using in-memory Redis (no Upstash configured)');
    redisClient = new InMemoryRedis();
  }

  return redisClient;
}

export async function savePing(
  cocheId: string,
  data: {
    lat: number;
    lng: number;
    timestamp: string;
    chofer: string;
    linea?: string;
    visibleEnColejuy?: boolean;
  }
): Promise<void> {
  const redis = getRedisClient();
  const key = `urbano:coche:${cocheId}:latest`;

  // Get existing data to preserve linea and visibleEnColejuy if not provided
  const existing = await redis.hgetall(key);

  const hashData: Record<string, string> = {
    lat: data.lat.toString(),
    lng: data.lng.toString(),
    timestamp: data.timestamp,
    chofer: data.chofer,
    linea: data.linea ?? existing?.linea ?? '',
    visibleEnColejuy: (data.visibleEnColejuy ?? (existing?.visibleEnColejuy === 'true')).toString(),
    disponible: 'true',
    coche: cocheId,
  };

  await redis.hset(key, hashData);
  await redis.expire(key, 24 * 60 * 60); // 24 hours TTL
}

export async function getAllCoches(): Promise<CocheData[]> {
  const redis = getRedisClient();
  const keys = await redis.keys('urbano:coche:*:latest');

  const coches: CocheData[] = [];
  for (const key of keys) {
    const data = await redis.hgetall(key);
    if (data) {
      coches.push(data as CocheData);
    }
  }

  return coches;
}

export async function getCoche(cocheId: string): Promise<CocheData | null> {
  const redis = getRedisClient();
  const key = `urbano:coche:${cocheId}:latest`;
  const data = await redis.hgetall(key);
  return data as CocheData | null;
}

export async function updateCocheLinea(cocheId: string, linea: string): Promise<void> {
  const redis = getRedisClient();
  const key = `urbano:coche:${cocheId}:latest`;

  const existing = await redis.hgetall(key);
  if (!existing) {
    throw new Error('Coche not found');
  }

  await redis.hset(key, { ...existing, linea });
}

export async function updateCocheVisibilidad(cocheId: string, visibleEnColejuy: boolean): Promise<void> {
  const redis = getRedisClient();
  const key = `urbano:coche:${cocheId}:latest`;

  const existing = await redis.hgetall(key);
  if (!existing) {
    throw new Error('Coche not found');
  }

  await redis.hset(key, { ...existing, visibleEnColejuy: visibleEnColejuy.toString() });
}
