// ─── 1. Constraints ─────────────────────────────────────────────────────────
// Ensure uniqueness and prevent duplicate nodes from idempotent operations.

// Service.id — internal UUID assigned on registration. Guarantees no two
// services share the same id even if names differ across environments.
CREATE CONSTRAINT service_id IF NOT EXISTS FOR (s:Service) REQUIRE s.id IS UNIQUE;

// Service.name — user-facing name (e.g. "payment-service"). Prevents
// duplicate registrations via MERGE in graphService.createService().
CREATE CONSTRAINT service_name IF NOT EXISTS FOR (s:Service) REQUIRE s.name IS UNIQUE;

// Deployment.id — internal UUID. Each workflow run maps to exactly one
// deployment node per matched service.
CREATE CONSTRAINT deployment_id IF NOT EXISTS FOR (d:Deployment) REQUIRE d.id IS UNIQUE;

// Commit.sha — git commit hash is the natural unique key. MERGE on sha
// guarantees idempotency when the same commit appears in multiple webhooks.
CREATE CONSTRAINT commit_sha IF NOT EXISTS FOR (c:Commit) REQUIRE c.sha IS UNIQUE;

// ErrorPattern.id — internal UUID.
CREATE CONSTRAINT errorpattern_id IF NOT EXISTS FOR (e:ErrorPattern) REQUIRE e.id IS UNIQUE;

// File.path — exact path of the changed file.
CREATE CONSTRAINT file_path IF NOT EXISTS FOR (f:File) REQUIRE f.path IS UNIQUE;

// ─── 2. Indexes ─────────────────────────────────────────────────────────────
// Speed up the most common query patterns used by the dashboard and workers.

// Filter deployments by status (in_progress / completed) on the deployments list page.
CREATE INDEX deployment_status IF NOT EXISTS FOR (d:Deployment) ON (d.status);

// Sort deployments by start time (newest first) in the dashboard table.
CREATE INDEX deployment_started_at IF NOT EXISTS FOR (d:Deployment) ON (d.startedAt);

// Sort deployments by completion time for rollback target queries.
CREATE INDEX deployment_completed_at IF NOT EXISTS FOR (d:Deployment) ON (d.completedAt);

// Sort health checks by timestamp for the health history API (last N checks).
CREATE INDEX healthcheck_checked_at IF NOT EXISTS FOR (h:HealthCheck) ON (h.checkedAt);

// Filter services by environment on the dashboard overview.
CREATE INDEX service_env IF NOT EXISTS FOR (s:Service) ON (s.environment);

// Filter error patterns by type (e.g. all out-of-memory errors).
CREATE INDEX errorpattern_type IF NOT EXISTS FOR (e:ErrorPattern) ON (e.type);

// Filter error patterns by severity.
CREATE INDEX errorpattern_severity IF NOT EXISTS FOR (e:ErrorPattern) ON (e.severity);

// Sort rollbacks by when they were triggered.
CREATE INDEX rollback_triggered_at IF NOT EXISTS FOR (r:Rollback) ON (r.triggeredAt);
