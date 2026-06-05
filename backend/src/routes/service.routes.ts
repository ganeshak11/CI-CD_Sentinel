/**
 * service.routes.ts
 *
 * REST endpoints for the Service Registry.
 *
 * GET  /api/services           — list all tracked services
 * GET  /api/services/:id       — single service + latest deployment & health
 * POST /api/services           — register a new service
 * POST /api/services/import    — bulk import from sentinel-services.yml
 * DELETE /api/services/:id     — remove a service
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import yaml from 'js-yaml';
import { z } from 'zod';
import {
  createService,
  getAllServices,
  getServiceById,
  bulkCreateServices,
  deleteService,
} from '../services/graphService';
import { BulkServiceConfig } from '../types/deployment.types';

const router = Router();

// Multer config — store uploaded YAML in memory (small files only)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 } });

// ─── Validation Schemas ──────────────────────────────────────────────────────

const createServiceSchema = z.object({
  name: z.string().min(1, 'Service name is required'),
  repoUrl: z
    .string()
    .min(1, 'Repository URL is required')
    .regex(/^[^/]+\/[^/]+$/, 'Must be in org/repo format (e.g. "ganeshak11/CI-CD_Sentinel")'),
  healthEndpoint: z.string().url('Health endpoint must be a valid URL'),
  environment: z.enum(['production', 'staging', 'development']).optional(),
  pathFilter: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  rollbackStrategy: z.enum(['rerun', 'workflow_dispatch']).optional(),
});

const bulkServiceSchema = z.object({
  services: z.array(
    z.object({
      name: z.string().min(1),
      repo: z.string().min(1).regex(/^[^/]+\/[^/]+$/),
      health_url: z.string().url(),
      environment: z.string().optional(),
      path_filter: z.string().optional(),
      dependencies: z.array(z.string()).optional(),
      rollback_strategy: z.enum(['rerun', 'workflow_dispatch']).optional(),
    })
  ),
});

// ─── GET /api/services ───────────────────────────────────────────────────────

router.get('/', async (_req: Request, res: Response) => {
  try {
    const services = await getAllServices();
    res.json({ data: services, count: services.length });
  } catch (err) {
    console.error('[service.routes] GET /services error:', err);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

// ─── GET /api/services/:id ───────────────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const service = await getServiceById(req.params.id);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }
    res.json({ data: service });
  } catch (err) {
    console.error('[service.routes] GET /services/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch service' });
  }
});

// ─── POST /api/services ──────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = createServiceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const service = await createService(parsed.data);
    res.status(201).json({ data: service });
  } catch (err) {
    console.error('[service.routes] POST /services error:', err);
    res.status(500).json({ error: 'Failed to create service' });
  }
});

// ─── POST /api/services/import ───────────────────────────────────────────────

router.post('/import', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Send a YAML file in the "file" field.' });
    }

    // Parse YAML from the uploaded buffer
    const yamlContent = req.file.buffer.toString('utf8');
    let parsed: unknown;
    try {
      parsed = yaml.load(yamlContent);
    } catch (yamlErr: any) {
      return res.status(400).json({ error: `Invalid YAML: ${yamlErr.message}` });
    }

    // Validate structure
    const validated = bulkServiceSchema.safeParse(parsed);
    if (!validated.success) {
      return res.status(400).json({
        error: 'YAML validation failed',
        details: validated.error.flatten().fieldErrors,
      });
    }

    const result = await bulkCreateServices(validated.data.services as BulkServiceConfig[]);

    res.status(201).json({
      message: 'Bulk import completed',
      ...result,
    });
  } catch (err) {
    console.error('[service.routes] POST /services/import error:', err);
    res.status(500).json({ error: 'Failed to import services' });
  }
});

// ─── DELETE /api/services/:id ────────────────────────────────────────────────

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await deleteService(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Service not found' });
    }
    res.json({ message: 'Service deleted' });
  } catch (err) {
    console.error('[service.routes] DELETE /services/:id error:', err);
    res.status(500).json({ error: 'Failed to delete service' });
  }
});

export default router;
