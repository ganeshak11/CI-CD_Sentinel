/**
 * deployment.routes.ts
 *
 * REST endpoints for deployment history and detail.
 * To be implemented by Ganesh (graphService layer is ready).
 *
 * GET /api/deployments           — paginated deployment list
 * GET /api/deployments/:id       — single deployment + commit detail
 */

import { Router } from 'express';
import { getDeployments, getDeploymentById } from '../services/graphService';

const router = Router();

// GET /api/deployments?serviceId=xxx&limit=50&offset=0
router.get('/', async (req, res) => {
  try {
    const { serviceId, limit, offset } = req.query;
    const deployments = await getDeployments(
      serviceId as string | undefined,
      limit ? parseInt(limit as string) : 50,
      offset ? parseInt(offset as string) : 0
    );
    res.json({ data: deployments, count: deployments.length });
  } catch (err) {
    console.error('[deployment.routes] GET /deployments error:', err);
    res.status(500).json({ error: 'Failed to fetch deployments' });
  }
});

// GET /api/deployments/:id
router.get('/:id', async (req, res) => {
  try {
    const deployment = await getDeploymentById(req.params.id);
    if (!deployment) {
      return res.status(404).json({ error: 'Deployment not found' });
    }
    res.json({ data: deployment });
  } catch (err) {
    console.error('[deployment.routes] GET /deployments/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch deployment' });
  }
});

export default router;
