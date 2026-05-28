/**
 * deployment.service.ts
 *
 * Thin wrapper around graphService for deployment-related business logic.
 * Chinmay's webhookService will import createDeployment and createCommit from here.
 */

export {
  createDeployment,
  getDeploymentById,
  getDeployments,
  createCommit,
} from './graphService';
