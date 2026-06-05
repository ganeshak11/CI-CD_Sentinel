import { Request, Response } from 'express';
import crypto from 'crypto';
import * as webhookService from '../services/webhookService';

/**
 * Verify HMAC-SHA256 signature from GitHub webhook.
 */
function verifySignature(req: Request): boolean {
  const signature = req.headers['x-hub-signature-256'] as string;
  if (!signature) {
    console.warn('[WebhookController] Missing x-hub-signature-256 header.');
    return false;
  }

  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('[WebhookController] GITHUB_WEBHOOK_SECRET is not set.');
    return false;
  }

  const hmac = crypto.createHmac('sha256', secret);
  // req.body is a Buffer since express.raw() was applied in routes
  const digest = 'sha256=' + hmac.update(req.body).digest('hex');

  try {
    const signatureBuffer = Buffer.from(signature);
    const digestBuffer = Buffer.from(digest);
    if (signatureBuffer.length !== digestBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(signatureBuffer, digestBuffer);
  } catch (error) {
    return false;
  }
}

/**
 * Handle incoming GitHub Webhooks.
 */
export async function handleWebhook(req: Request, res: Response) {
  try {
    // 1. Validate signature
    if (!verifySignature(req)) {
      console.warn('[WebhookController] Invalid signature verification failed.');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 2. Check X-GitHub-Event header
    const event = req.headers['x-github-event'] as string;
    if (!event) {
      return res.status(400).json({ error: 'Missing X-GitHub-Event header' });
    }

    console.log(`[WebhookController] Received event: ${event}`);

    // We only process workflow_run events
    if (event !== 'workflow_run') {
      console.log(`[WebhookController] Ignoring unhandled event: ${event}`);
      return res.status(200).json({ message: `Event '${event}' accepted but skipped.` });
    }

    // 3. Parse JSON payload from the raw body buffer
    let payload: any;
    try {
      const bodyStr = req.body instanceof Buffer ? req.body.toString('utf8') : req.body;
      payload = typeof bodyStr === 'string' ? JSON.parse(bodyStr) : bodyStr;
    } catch (parseError) {
      console.error('[WebhookController] Failed to parse payload JSON:', parseError);
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }

    // 4. Delegate to webhook service
    const result = await webhookService.handleWorkflowRun(payload);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('[WebhookController] Error handling webhook:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
