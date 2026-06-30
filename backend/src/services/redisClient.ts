import Redis from 'ioredis';
import { HealthStatus } from '../types/deployment.types';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(redisUrl);

redis.on('connect', () => {
  console.log('[Redis] Connected');
});

redis.on('error', (err) => {
  console.error('[Redis] Error', err);
});

export interface CachedHealthStatus {
  status: HealthStatus;
  statusCode: number | null;
  responseTimeMs: number | null;
  error: string | null;
  checkedAt: string;
  timestamp: string;
}

export async function setHealthCache(
  serviceId: string,
  payload: CachedHealthStatus,
  ttlSeconds = 90
): Promise<void> {
  const key = `health:${serviceId}`;
  await redis.set(key, JSON.stringify(payload), 'EX', ttlSeconds);
}

export async function getHealthCache(
  serviceId: string
): Promise<CachedHealthStatus | null> {
  const key = `health:${serviceId}`;
  const value = await redis.get(key);
  if (!value) return null;
  try {
    return JSON.parse(value) as CachedHealthStatus;
  } catch (err) {
    console.error('[Redis] Failed to parse cache value for', key, err);
    return null;
  }
}
