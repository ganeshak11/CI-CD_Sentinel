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

// Route imports
import deploymentRoutes from './routes/deployment.routes';
import healthRoutes from './routes/health.routes';
import webhookRoutes from './routes/webhookRoutes';
import serviceRoutes from './routes/service.routes';
import { startHealthWorker } from './services/healthWorker';

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

// ─── Webhook route MUST be mounted BEFORE express.json() ──────────────────────
// express.raw() is applied per-route in webhookRoutes. If express.json() runs
// first (as global middleware), it consumes the body stream and sets req.body
// to a parsed object — destroying the raw Buffer needed for HMAC-SHA256 validation.
app.use('/webhooks', webhookRoutes);

// JSON body parser — for all other routes (API, health, etc.)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Health Ping + Health endpoint ───────────────────────────────────────────
app.get('/ping', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// /health — standard health check endpoint (used by the health worker)
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/services', serviceRoutes);
app.use('/api/deployments', deploymentRoutes);
app.use('/api/health-status', healthRoutes);

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

    // 3. Start the health worker before the server starts accepting requests
    startHealthWorker();

    // 4. Start Express server
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
