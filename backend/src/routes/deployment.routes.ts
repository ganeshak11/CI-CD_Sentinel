/**
 * deployment.routes.ts
 *
 * REST endpoints for deployment history and detail.
 *
 * GET /api/deployments                       — paginated deployment list
 * GET /api/deployments/:id                   — single deployment + commit detail
 * GET /api/deployments/:id/rollback-preview  — rollback preview data (target, deps, risk)
 * POST /api/deployments/:id/rollback         — trigger manual rollback
 * POST /api/deployments/:id/redeploy         — re-trigger the same deployment
 */

import { Router } from 'express';
import { getDeployments, getDeploymentById } from '../services/graphService';
import * as rollbackService from '../services/rollbackService';

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

// GET /api/deployments/:id/rollback-preview
// Returns target deployment, affected services, and risk estimate
router.get('/:id/rollback-preview', async (req, res) => {
  try {
    const preview = await rollbackService.getRollbackPreview(req.params.id);
    res.json({ data: preview });
  } catch (err: any) {
    console.error('[deployment.routes] GET /deployments/:id/rollback-preview error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to generate rollback preview' });
  }
});

// POST /api/deployments/:id/rollback
// Triggers manual rollback to the last healthy deployment
router.post('/:id/rollback', async (req, res) => {
  try {
    const rollback = await rollbackService.triggerManualRollback(req.params.id);
    if (!rollback) {
      return res.status(400).json({ error: 'Failed to trigger rollback' });
    }
    res.json({ data: rollback, message: 'Rollback triggered successfully' });
  } catch (err: any) {
    console.error('[deployment.routes] POST /deployments/:id/rollback error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to trigger rollback' });
  }
});

// POST /api/deployments/:id/redeploy
// Re-triggers the exact same deployment (same commit, same workflow)
router.post('/:id/redeploy', async (req, res) => {
  try {
    // For now, this is a placeholder. Implementation would:
    // 1. Get the deployment with workflow run ID
    // 2. Call GitHub API to re-run that specific workflow run
    // 3. Create a new Deployment node linked to the re-run
    res.json({ message: 'Redeploy endpoint - implementation pending based on workflow preferences' });
  } catch (err: any) {
    console.error('[deployment.routes] POST /deployments/:id/redeploy error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to redeploy' });
  }
});

export default router;
