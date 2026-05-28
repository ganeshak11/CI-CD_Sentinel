/**
 * app.ts — Express Application Entry Point
 *
 * Starts the backend server with all middleware, routes, and the Neo4j schema
 * applied on boot. The health worker cron job will be registered here by Abdul
 * in feature/v1-health-worker.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

import { driver } from './db/index';
import { applySchema } from './db/applySchema';

// Route imports (empty stubs — to be implemented by teammates)
import deploymentRoutes from './routes/deployment.routes';
import healthRoutes from './routes/health.routes';
import webhookRoutes from './routes/webhook.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3001;

// ─── Middleware ───────────────────────────────────────────────────────────────

// Security headers
app.use(helmet());

// CORS — allow Next.js frontend on port 3000
app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Request logging
app.use(morgan('dev'));

// Raw body MUST be parsed before json() for webhook HMAC validation
// Chinmay: express.raw() is applied per-route in webhookRoutes, not globally
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Health Ping (used by Abdul's worker to test the server itself) ───────────
app.get('/ping', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/deployments', deploymentRoutes);
app.use('/api/health-status', healthRoutes);
app.use('/webhooks', webhookRoutes);

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('[ERROR]', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
);

// ─── Boot sequence ────────────────────────────────────────────────────────────
async function start() {
  try {
    // 1. Verify Neo4j connection
    await driver.verifyConnectivity();
    console.log('[Neo4j] Connected successfully');

    // 2. Apply schema constraints and indexes on every boot
    //    This is idempotent — IF NOT EXISTS ensures no errors on repeat runs
    await applySchema();
    console.log('[Neo4j] Schema applied');

    // 3. Start Express server
    app.listen(PORT, () => {
      console.log(`[Server] Sentinel backend running on http://localhost:${PORT}`);
      console.log(`[Server] Webhook endpoint: POST http://localhost:${PORT}/webhooks/github`);
    });
  } catch (err) {
    console.error('[FATAL] Failed to start server:', err);
    await driver.close();
    process.exit(1);
  }
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM received — shutting down gracefully');
  await driver.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Server] SIGINT received — shutting down gracefully');
  await driver.close();
  process.exit(0);
});

start();
