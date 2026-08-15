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
 *  - Repo identifiers use org/repo format (GitHub's repository.full_name).
 */

import neo4j from 'neo4j-driver';
import { v4 as uuidv4 } from 'uuid';
import { driver, executeQuery } from '../db/index';
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
  BulkServiceConfig,
  BulkImportResult,
} from '../types/deployment.types';

// ─── Service Queries ──────────────────────────────────────────────────────────

/**
 * Create or retrieve a :Service node.
 * Uses MERGE on `name` to prevent duplicate registrations.
 *
 * After the node is created/updated, DEPENDS_ON relationships are
 * established for each dependency name (if any).
 *
 * @param input.repoUrl — must be in org/repo format (e.g. "ganeshak11/CI-CD_Sentinel")
 * @param input.pathFilter — optional glob for monorepo scoping (e.g. "services/payment/**")
 * @param input.dependencies — optional list of other service names this depends on
 * @param input.rollbackStrategy — "rerun" (default) or "workflow_dispatch"
 */
export async function createService(input: CreateServiceInput): Promise<Service> {
  const id = uuidv4();
  const now = new Date().toISOString();
  const environment = input.environment ?? 'production';
  const pathFilter = input.pathFilter ?? '';
  const rollbackStrategy = input.rollbackStrategy ?? 'rerun';

  const query = `
    MERGE (s:Service { name: $name })
    ON CREATE SET
      s.id               = $id,
      s.repoUrl          = $repoUrl,
      s.healthEndpoint   = $healthEndpoint,
      s.environment      = $environment,
      s.pathFilter       = $pathFilter,
      s.rollbackStrategy = $rollbackStrategy,
      s.createdAt        = $createdAt
    ON MATCH SET
      s.repoUrl          = $repoUrl,
      s.healthEndpoint   = $healthEndpoint,
      s.environment      = $environment,
      s.pathFilter       = $pathFilter,
      s.rollbackStrategy = $rollbackStrategy
    RETURN s
  `;

  const result = await executeQuery(query, {
    id,
    name: input.name,
    repoUrl: input.repoUrl,
    healthEndpoint: input.healthEndpoint,
    environment,
    pathFilter,
    rollbackStrategy,
    createdAt: now,
  });

  const service = result.records[0].get('s').properties as Service;

  // Create DEPENDS_ON relationships if dependencies are specified
  if (input.dependencies && input.dependencies.length > 0) {
    for (const depName of input.dependencies) {
      await executeQuery(
        `
        MATCH (s:Service { name: $name })
        MATCH (dep:Service { name: $depName })
        MERGE (s)-[:DEPENDS_ON]->(dep)
        `,
        { name: input.name, depName }
      );
    }
  }

  return service;
}

/**
 * Find all :Service nodes registered to a given repo.
 *
 * This is the primary lookup used by the webhook processor:
 * - Returns an array (may be 1 for microservice repos, N for monorepos)
 * - Returns empty array if the repo is not tracked (webhook is silently skipped)
 *
 * @param repoFullName — GitHub repository.full_name (org/repo format, e.g. "ganeshak11/CI-CD_Sentinel")
 */
export async function findServicesByRepo(repoFullName: string): Promise<Service[]> {
  const query = `
    MATCH (s:Service { repoUrl: $repoFullName })
    RETURN s
    ORDER BY s.name ASC
  `;

  const result = await executeQuery(query, { repoFullName });
  return result.records.map((row) => row.get('s').properties as Service);
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

/**
 * Bulk-create services from a parsed YAML config.
 *
 * Runs in a SINGLE Neo4j transaction to ensure atomicity:
 *  1. Pass 1 — MERGE all Service nodes
 *  2. Pass 2 — MERGE all DEPENDS_ON relationships
 *
 * @param services — parsed array from sentinel-services.yml
 * @returns BulkImportResult with counts and errors
 */
export async function bulkCreateServices(
  services: BulkServiceConfig[]
): Promise<BulkImportResult> {
  const result: BulkImportResult = {
    created: 0,
    updated: 0,
    dependenciesLinked: 0,
    errors: [],
  };

  const session = driver.session();
  const txc = session.beginTransaction();

  try {
    // ── Pass 1: Create/update all Service nodes ──────────────────────────────
    for (const svc of services) {
      try {
        const id = uuidv4();
        const now = new Date().toISOString();

        const res = await txc.run(
          `
          MERGE (s:Service { name: $name })
          ON CREATE SET
            s.id               = $id,
            s.repoUrl          = $repoUrl,
            s.healthEndpoint   = $healthEndpoint,
            s.environment      = $environment,
            s.pathFilter       = $pathFilter,
            s.rollbackStrategy = $rollbackStrategy,
            s.createdAt        = $createdAt
          ON MATCH SET
            s.repoUrl          = $repoUrl,
            s.healthEndpoint   = $healthEndpoint,
            s.environment      = $environment,
            s.pathFilter       = $pathFilter,
            s.rollbackStrategy = $rollbackStrategy
          RETURN s, s.createdAt = $createdAt AS isNew
          `,
          {
            id,
            name: svc.name,
            repoUrl: svc.repo,
            healthEndpoint: svc.health_url,
            environment: svc.environment ?? 'production',
            pathFilter: svc.path_filter ?? '',
            rollbackStrategy: svc.rollback_strategy ?? 'rerun',
            createdAt: now,
          }
        );

        const isNew = res.records[0].get('isNew');
        if (isNew) {
          result.created++;
        } else {
          result.updated++;
        }
      } catch (err: any) {
        result.errors.push({ service: svc.name, error: err.message });
      }
    }

    // ── Pass 2: Create DEPENDS_ON relationships ──────────────────────────────
    for (const svc of services) {
      if (!svc.dependencies || svc.dependencies.length === 0) continue;

      for (const depName of svc.dependencies) {
        try {
          await txc.run(
            `
            MATCH (s:Service { name: $name })
            MATCH (dep:Service { name: $depName })
            MERGE (s)-[:DEPENDS_ON]->(dep)
            `,
            { name: svc.name, depName }
          );
          result.dependenciesLinked++;
        } catch (err: any) {
          result.errors.push({
            service: svc.name,
            error: `Failed to link dependency ${depName}: ${err.message}`,
          });
        }
      }
    }

    await txc.commit();
  } catch (err) {
    await txc.rollback();
    throw err;
  } finally {
    await session.close();
  }

  return result;
}

/**
 * Delete a :Service node and all its relationships.
 * Useful for cleanup and testing.
 */
export async function deleteService(id: string): Promise<boolean> {
  const query = `
    MATCH (s:Service { id: $id })
    DETACH DELETE s
    RETURN count(s) AS deleted
  `;

  const result = await executeQuery(query, { id });
  const deleted = result.records[0]?.get('deleted')?.toNumber?.() ?? 0;
  return deleted > 0;
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
    workflowRunId: neo4j.int(input.workflowRunId),
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
    SKIP toInteger($offset)
    LIMIT toInteger($limit)
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
    workflowRunId: neo4j.int(workflowRunId),
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
    OPTIONAL MATCH (d:Deployment)-[:DEPLOYED_TO]->(s)
    WITH s, d
    ORDER BY d.startedAt DESC
    LIMIT 1
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
    FOREACH (_ IN CASE WHEN d IS NULL THEN [] ELSE [1] END |
      MERGE (d)-[:HAS_HEALTH]->(h)
    )
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
    LIMIT toInteger($limit)
  `;

  const result = await executeQuery(query, { serviceId, limit });
  return result.records.map((row) => row.get('h').properties as HealthCheck);
}

// ─── Rollback Queries ───────────────────────────────────────────────────────

/**
 * Get the most recent successful deployment for a service.
 * Used by rollbackService to find the target deployment for rollback.
 *
 * @param serviceId The service ID
 * @returns The most recent Deployment with conclusion = 'success', or null
 */
export async function getLastHealthyDeployment(serviceId: string): Promise<Deployment | null> {
  const query = `
    MATCH (s:Service { id: $serviceId })-[:DEPLOYED]->(d:Deployment)
    WHERE d.conclusion = 'success'
    RETURN d
    ORDER BY d.completedAt DESC
    LIMIT 1
  `;

  const result = await executeQuery(query, { serviceId });
  if (result.records.length === 0) {
    return null;
  }

  return result.records[0].get('d').properties as Deployment;
}

/**
 * Create a Rollback node and link it to a deployment.
 * Called by rollbackService after triggering a rollback.
 *
 * @param rollbackData Object with rollback details
 * @returns The created Rollback node properties
 */
export async function createRollback(rollbackData: any): Promise<any> {
  const query = `
    MATCH (d:Deployment { id: $deploymentId })
    MERGE (r:Rollback { id: $id })
    ON CREATE SET
      r.deploymentId     = $deploymentId,
      r.triggeredAt      = $triggeredAt,
      r.trigger          = $trigger,
      r.strategy         = $strategy,
      r.targetDeploymentId = $targetDeploymentId,
      r.status           = $status
    MERGE (d)-[:TRIGGERED_ROLLBACK]->(r)
    RETURN r
  `;

  const result = await executeQuery(query, {
    id: rollbackData.id,
    deploymentId: rollbackData.deploymentId,
    triggeredAt: rollbackData.triggeredAt,
    trigger: rollbackData.trigger,
    strategy: rollbackData.strategy,
    targetDeploymentId: rollbackData.targetDeploymentId,
    status: rollbackData.status,
  });

  return result.records[0].get('r').properties;
}

/**
 * Get all services that depend on the given service.
 * Used by rollbackService to calculate dependent services for rollback preview.
 *
 * @param serviceId The service ID
 * @returns Array of dependent Service objects
 */
export async function getDependentServices(serviceId: string): Promise<Service[]> {
  const query = `
    MATCH (s:Service { id: $serviceId })<-[:DEPENDS_ON]-(dep:Service)
    RETURN dep
  `;

  const result = await executeQuery(query, { serviceId });
  return result.records.map((row) => row.get('dep').properties as Service);
}
