/**
 * health.service.ts
 *
 * Thin wrapper around graphService for health-check-related business logic.
 * Abdul's healthWorker will import createHealthCheck and getHealthHistory from here.
 */

export {
  createHealthCheck,
  getHealthHistory,
  getAllServices,
} from './graphService';
