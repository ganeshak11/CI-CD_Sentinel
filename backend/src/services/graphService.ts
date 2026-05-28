/**
 * graphService.ts — Neo4j Graph Query Layer
 *
 * This is the SINGLE source of truth for all Neo4j reads and writes.
 * Every other service (webhook, health, deployment) goes through here.
 *
 * Key rules enforced here:
 *  - MERGE is always used instead of CREATE to guarantee idempotency.
 *  - All node IDs use uuid v4 (except Commit which uses SHA as the natural key).
 *  - Relationships are always created with MERGE to avoid duplicates.
 */

import { v4 as uuidv4 } from 'uuid';
import { executeQuery } from '../db/index';
import {
  Service,
  CreateServiceInput,
  Deployment,
  CreateDeploymentInput,
  Commit,
  CreateCommitInput,
  HealthCheck,
  HealthStatus,
  ServiceWithHealth,
  DeploymentWithCommit,
} from '../types/deployment.types';

// ─── Service Queries ──────────────────────────────────────────────────────────

/**
 * Create or retrieve a :Service node.
 * Uses MERGE on `name` to prevent duplicate registrations.
 */
export async function createService(input: CreateServiceInput): Promise<Service> {
  const id = uuidv4();
  const now = new Date().toISOString();
  const environment = input.environment ?? 'production';

  const query = `
    MERGE (s:Service { name: $name })
    ON CREATE SET
      s.id              = $id,
      s.repoUrl         = $repoUrl,
      s.healthEndpoint  = $healthEndpoint,
      s.environment     = $environment,
      s.createdAt       = $createdAt
    ON MATCH SET
      s.repoUrl         = $repoUrl,
      s.healthEndpoint  = $healthEndpoint,
      s.environment     = $environment
    RETURN s
  `;

  const result = await executeQuery(query, {
    id,
    name: input.name,
    repoUrl: input.repoUrl,
    healthEndpoint: input.healthEndpoint,
    environment,
    createdAt: now,
  });

  return result.records[0].get('s').properties as Service;
}

/**
 * Fetch a single :Service by its internal id, including the latest deployment.
 */
export async function getServiceById(id: string): Promise<ServiceWithHealth | null> {
  const query = `
    MATCH (s:Service { id: $id })
    OPTIONAL MATCH (d:Deployment)-[:DEPLOYED_TO]->(s)
    OPTIONAL MATCH (d)-[:HAS_HEALTH]->(h:HealthCheck)
    WITH s, d, h
    ORDER BY d.startedAt DESC, h.checkedAt DESC
    WITH s, collect(d)[0] AS latestDeployment, collect(h)[0] AS latestHealth
    RETURN s, latestDeployment, latestHealth
  `;

  const result = await executeQuery(query, { id });
  if (result.records.length === 0) return null;

  const row = result.records[0];
  return {
    ...(row.get('s').properties as Service),
    latestDeployment: row.get('latestDeployment')?.properties ?? null,
    latestHealth: row.get('latestHealth')?.properties ?? null,
  };
}

/**
 * Fetch all :Service nodes with their latest deployment and health check.
 * Used by the health worker and the dashboard overview page.
 */
export async function getAllServices(): Promise<ServiceWithHealth[]> {
  const query = `
    MATCH (s:Service)
    OPTIONAL MATCH (d:Deployment)-[:DEPLOYED_TO]->(s)
    OPTIONAL MATCH (d)-[:HAS_HEALTH]->(h:HealthCheck)
    WITH s, d, h
    ORDER BY d.startedAt DESC, h.checkedAt DESC
    WITH s, collect(d)[0] AS latestDeployment, collect(h)[0] AS latestHealth
    RETURN s, latestDeployment, latestHealth
    ORDER BY s.name ASC
  `;

  const result = await executeQuery(query, {});
  return result.records.map((row) => ({
    ...(row.get('s').properties as Service),
    latestDeployment: row.get('latestDeployment')?.properties ?? null,
    latestHealth: row.get('latestHealth')?.properties ?? null,
  }));
}

// ─── Deployment Queries ───────────────────────────────────────────────────────

/**
 * Create or update a :Deployment node and link it to its :Service.
 *
 * MERGE is on workflowRunId — this is the idempotency key.
 * Calling this twice with the same workflowRunId is safe (no duplicates).
 *
 * Relationship: (:Deployment)-[:DEPLOYED_TO]->(:Service)
 */
export async function createDeployment(input: CreateDeploymentInput): Promise<Deployment> {
  const id = uuidv4();

  const query = `
    MATCH (s:Service { id: $serviceId })
    MERGE (d:Deployment { workflowRunId: $workflowRunId })
    ON CREATE SET
      d.id            = $id,
      d.workflowName  = $workflowName,
      d.branch        = $branch,
      d.status        = $status,
      d.conclusion    = $conclusion,
      d.triggeredBy   = $triggeredBy,
      d.startedAt     = $startedAt,
      d.completedAt   = $completedAt,
      d.duration      = $duration,
      d.serviceId     = $serviceId
    ON MATCH SET
      d.status        = $status,
      d.conclusion    = $conclusion,
      d.completedAt   = $completedAt,
      d.duration      = $duration
    MERGE (d)-[:DEPLOYED_TO]->(s)
    RETURN d
  `;

  // Calculate duration in seconds if completedAt is available
  const duration =
    input.completedAt && input.startedAt
      ? Math.round(
          (new Date(input.completedAt).getTime() -
            new Date(input.startedAt).getTime()) /
            1000
        )
      : null;

  const result = await executeQuery(query, {
    id,
    workflowRunId: input.workflowRunId,
    workflowName: input.workflowName,
    branch: input.branch,
    status: input.status,
    conclusion: input.conclusion ?? null,
    triggeredBy: input.triggeredBy,
    startedAt: input.startedAt,
    completedAt: input.completedAt ?? null,
    duration,
    serviceId: input.serviceId,
  });

  return result.records[0].get('d').properties as Deployment;
}

/**
 * Fetch a single deployment by its internal id.
 */
export async function getDeploymentById(
  id: string
): Promise<DeploymentWithCommit | null> {
  const query = `
    MATCH (d:Deployment { id: $id })
    OPTIONAL MATCH (d)-[:BASED_ON]->(c:Commit)
    RETURN d, c
  `;

  const result = await executeQuery(query, { id });
  if (result.records.length === 0) return null;

  const row = result.records[0];
  return {
    ...(row.get('d').properties as Deployment),
    commit: row.get('c')?.properties ?? null,
  };
}

/**
 * Fetch paginated deployment history, optionally filtered by serviceId.
 */
export async function getDeployments(
  serviceId?: string,
  limit = 50,
  offset = 0
): Promise<DeploymentWithCommit[]> {
  const serviceFilter = serviceId ? 'AND d.serviceId = $serviceId' : '';

  const query = `
    MATCH (d:Deployment)
    WHERE true ${serviceFilter}
    OPTIONAL MATCH (d)-[:BASED_ON]->(c:Commit)
    RETURN d, c
    ORDER BY d.startedAt DESC
    SKIP $offset
    LIMIT $limit
  `;

  const result = await executeQuery(query, {
    serviceId: serviceId ?? null,
    limit,
    offset,
  });

  return result.records.map((row) => ({
    ...(row.get('d').properties as Deployment),
    commit: row.get('c')?.properties ?? null,
  }));
}

// ─── Commit Queries ───────────────────────────────────────────────────────────

/**
 * Create or retrieve a :Commit node and link it to its :Deployment.
 *
 * MERGE is on sha — the git commit hash is the natural unique key.
 *
 * Relationship: (:Deployment)-[:BASED_ON]->(:Commit)
 */
export async function createCommit(
  input: CreateCommitInput,
  workflowRunId: number
): Promise<Commit> {
  const query = `
    MATCH (d:Deployment { workflowRunId: $workflowRunId })
    MERGE (c:Commit { sha: $sha })
    ON CREATE SET
      c.message     = $message,
      c.author      = $author,
      c.authorEmail = $authorEmail,
      c.timestamp   = $timestamp,
      c.repoUrl     = $repoUrl
    MERGE (d)-[:BASED_ON]->(c)
    RETURN c
  `;

  const result = await executeQuery(query, {
    sha: input.sha,
    message: input.message,
    author: input.author,
    authorEmail: input.authorEmail,
    timestamp: input.timestamp,
    repoUrl: input.repoUrl,
    workflowRunId,
  });

  return result.records[0].get('c').properties as Commit;
}

// ─── HealthCheck Queries ──────────────────────────────────────────────────────

/**
 * Persist a :HealthCheck node and link it to its :Service.
 * Called by the health worker every 60 seconds.
 *
 * Relationship: (:Service)-[:HAS_HEALTH]->(:HealthCheck)
 */
export async function createHealthCheck(
  serviceId: string,
  status: HealthStatus,
  statusCode: number | null,
  responseTimeMs: number | null,
  error: string | null
): Promise<HealthCheck> {
  const id = uuidv4();
  const checkedAt = new Date().toISOString();

  const query = `
    MATCH (s:Service { id: $serviceId })
    CREATE (h:HealthCheck {
      id:             $id,
      serviceId:      $serviceId,
      status:         $status,
      statusCode:     $statusCode,
      responseTimeMs: $responseTimeMs,
      error:          $error,
      checkedAt:      $checkedAt
    })
    MERGE (s)-[:HAS_HEALTH]->(h)
    RETURN h
  `;

  const result = await executeQuery(query, {
    id,
    serviceId,
    status,
    statusCode,
    responseTimeMs,
    error,
    checkedAt,
  });

  return result.records[0].get('h').properties as HealthCheck;
}

/**
 * Fetch the last N health checks for a given service, newest first.
 * Used by Abdul's health API route: GET /api/health-status/:serviceId
 */
export async function getHealthHistory(
  serviceId: string,
  limit = 10
): Promise<HealthCheck[]> {
  const query = `
    MATCH (s:Service { id: $serviceId })-[:HAS_HEALTH]->(h:HealthCheck)
    RETURN h
    ORDER BY h.checkedAt DESC
    LIMIT $limit
  `;

  const result = await executeQuery(query, { serviceId, limit });
  return result.records.map((row) => row.get('h').properties as HealthCheck);
}
