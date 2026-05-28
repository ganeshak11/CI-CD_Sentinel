/**
 * webhook.routes.ts
 *
 * Entry point for all GitHub webhook events.
 * STUB — to be fully implemented by Chinmay in feature/v1-webhook-ingest.
 *
 * POST /webhooks/github — receives GitHub Actions workflow_run events
 *
 * IMPORTANT for Chinmay:
 *  - express.raw() MUST be applied BEFORE express.json() on this route
 *    so you have access to the raw buffer for HMAC-SHA256 signature validation.
 *  - Use the X-Hub-Signature-256 header to verify the payload.
 *  - Return 401 if signature is invalid — never process unverified payloads.
 */

import express, { Router } from 'express';

const router = Router();

// POST /webhooks/github
// Chinmay: replace this stub with your full implementation
router.post('/github', express.raw({ type: 'application/json' }), (_req, res) => {
  // TODO (Chinmay): implement HMAC validation and workflow_run handling
  res.status(200).json({ message: 'Webhook endpoint ready — implementation pending' });
});

export default router;
