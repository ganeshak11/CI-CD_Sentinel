import express, { Router } from 'express';
import { handleWebhook } from '../controllers/webhookController';

const router = Router();

// POST /webhooks/github (mounted at /webhooks)
router.post('/github', express.raw({ type: 'application/json' }), handleWebhook);

export default router;
