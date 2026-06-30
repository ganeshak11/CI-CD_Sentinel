import axios from 'axios';
import cron from 'node-cron';

import { getAllServices, createHealthCheck } from './graphService';
import { setHealthCache } from './redisClient';
import { ServiceWithHealth, HealthStatus } from '../types/deployment.types';

const HEALTH_WORKER_CRON = '* * * * *';
const HEALTH_CACHE_TTL_SECONDS = 90;

async function probeServiceHealth(service: ServiceWithHealth) {
  const checkedAt = new Date().toISOString();
  let status: HealthStatus = 'unhealthy';
  let statusCode: number | null = null;
  let responseTimeMs: number | null = null;
  let error: string | null = null;

  if (!service.healthEndpoint) {
    error = 'Missing healthEndpoint';
  } else {
    const start = Date.now();
    try {
      const response = await axios.get(service.healthEndpoint, {
        timeout: 5000,
        validateStatus: () => true,
      });

      responseTimeMs = Date.now() - start;
      statusCode = response.status;

      if (response.status >= 200 && response.status < 300) {
        status = 'healthy';
      } else {
        error = `HTTP ${response.status}`;
      }
    } catch (err: any) {
      responseTimeMs = Date.now() - start;
      error = err?.code === 'ECONNABORTED' ? 'Request timed out' : err?.message ?? 'Health check failed';
    }
  }

  try {
    await createHealthCheck(
      service.id,
      status,
      statusCode,
      responseTimeMs,
      error
    );
  } catch (err) {
    console.error('[healthWorker] Failed to create HealthCheck for', service.id, err);
  }

  try {
    await setHealthCache(service.id, {
      status,
      statusCode,
      responseTimeMs,
      error,
      checkedAt,
      timestamp: checkedAt,
    }, HEALTH_CACHE_TTL_SECONDS);
  } catch (err) {
    console.error('[healthWorker] Failed to cache health status for', service.id, err);
  }
}

export async function runHealthCheckCycle() {
  try {
    const services = await getAllServices();
    if (!services.length) {
      console.log('[healthWorker] No services found to poll');
      return;
    }

    console.log(`[healthWorker] Running health check for ${services.length} services`);
    await Promise.all(
      services.map(async (service) => {
        try {
          await probeServiceHealth(service);
        } catch (err) {
          console.error('[healthWorker] Unexpected error while polling', service.id, err);
        }
      })
    );
  } catch (err) {
    console.error('[healthWorker] Failed health check cycle', err);
  }
}

const healthWorker = cron.schedule(
  HEALTH_WORKER_CRON,
  async () => {
    await runHealthCheckCycle();
  },
  {
    scheduled: false,
    timezone: 'UTC',
  }
);

let workerStarted = false;

export function startHealthWorker() {
  if (!workerStarted) {
    console.log('[healthWorker] Starting cron health worker');
    healthWorker.start();
    workerStarted = true;
    void runHealthCheckCycle();
  }
}
