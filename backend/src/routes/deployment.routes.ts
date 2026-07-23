/**
 * deployment.routes.ts
 *
 * REST endpoints for deployment history, detail, RCA, and logs.
 *
 * GET /api/deployments           — paginated deployment list
 * GET /api/deployments/:id       — single deployment + commit detail
 * GET /api/deployments/:id/rca   — deployment RCA analysis (V2)
 * GET /api/deployments/:id/logs  — cached workflow run logs (V2)
 */

import { Router } from 'express';
import { getDeployments, getDeploymentById, getDeploymentWithRCA } from '../services/graphService';
import { getCachedLogs } from '../services/logFetchJob';

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

// GET /api/deployments/:id/rca — V2: Root Cause Analysis
router.get('/:id/rca', async (req, res) => {
  try {
    const result = await getDeploymentWithRCA(req.params.id);
    if (!result) {
      return res.status(404).json({ error: 'Deployment not found' });
    }
    res.json({ data: result });
  } catch (err) {
    console.error('[deployment.routes] GET /deployments/:id/rca error:', err);
    res.status(500).json({ error: 'Failed to fetch RCA data' });
  }
});

// GET /api/deployments/:id/logs — V2: Cached Workflow Logs
router.get('/:id/logs', async (req, res) => {
  try {
    // First get the deployment to find the workflowRunId
    const deployment = await getDeploymentById(req.params.id);
    if (!deployment) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    const workflowRunId = deployment.workflowRunId;
    const logText = await getCachedLogs(
      typeof workflowRunId === 'object' && 'toNumber' in workflowRunId
        ? (workflowRunId as any).toNumber()
        : workflowRunId
    );

    if (!logText) {
      return res.json({ data: { lines: [], message: 'No cached logs available. Logs expire after 1 hour.' } });
    }

    const lines = logText.split('\n').filter((line: string) => line.trim().length > 0);
    res.json({ data: { lines, count: lines.length } });
  } catch (err) {
    console.error('[deployment.routes] GET /deployments/:id/logs error:', err);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

export default router;

