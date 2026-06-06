/**
 * health.routes.ts
 *
 * REST endpoints for service health status.
 * STUB — GET /api/health-status/:serviceId will be expanded by Abdul
 * in feature/v1-health-worker to read from Redis first, Neo4j as fallback.
 *
 * GET /api/health-status           — all services + latest health
 * GET /api/health-status/:id       — last 10 health checks for a service
 */

import { Router } from 'express';
import { getAllServices, getHealthHistory } from '../services/graphService';
import { getHealthCache } from '../services/redisClient';

const router = Router();

// GET /api/health-status
router.get('/', async (_req, res) => {
  try {
    const services = await getAllServices();
    const servicesWithCache = await Promise.all(
      services.map(async (service) => {
        const cache = await getHealthCache(service.id);
        if (!cache) {
          return service;
        }

        return {
          ...service,
          latestHealth: {
            id: service.latestHealth?.id ?? '',
            serviceId: service.id,
            status: cache.status,
            statusCode: cache.statusCode,
            responseTimeMs: cache.responseTimeMs,
            error: cache.error,
            checkedAt: cache.checkedAt,
          },
        };
      })
    );

    res.json({ data: servicesWithCache });
  } catch (err) {
    console.error('[health.routes] GET /health-status error:', err);
    res.status(500).json({ error: 'Failed to fetch health status' });
  }
});

// GET /api/health-status/:serviceId
// Abdul: add Redis cache read here before falling back to Neo4j
router.get('/:serviceId', async (req, res) => {
  try {
    const history = await getHealthHistory(req.params.serviceId, 10);
    res.json({ data: history });
  } catch (err) {
    console.error('[health.routes] GET /health-status/:serviceId error:', err);
    res.status(500).json({ error: 'Failed to fetch health history' });
  }
});

export default router;
