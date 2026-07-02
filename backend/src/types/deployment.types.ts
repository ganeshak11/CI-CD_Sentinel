// ─── Service ────────────────────────────────────────────────────────────────

export type RollbackStrategy = 'rerun' | 'workflow_dispatch';

export interface Service {
  id: string;
  name: string;
  repoUrl: string;           // org/repo format (matches GitHub repository.full_name)
  healthEndpoint: string;
  environment: string;        // e.g. "production" | "staging"
  pathFilter: string;         // glob pattern for monorepo support, empty string = match all
  rollbackStrategy: RollbackStrategy;
  createdAt: string;          // ISO timestamp
}

export interface CreateServiceInput {
  name: string;
  repoUrl: string;            // org/repo format (e.g. "ganeshak11/CI-CD_Sentinel")
  healthEndpoint: string;
  environment?: string;
  pathFilter?: string;        // optional glob for monorepos (e.g. "services/payment/**")
  dependencies?: string[];    // names of other services this depends on → creates DEPENDS_ON edges
  rollbackStrategy?: RollbackStrategy;
}

// ─── Bulk Import ─────────────────────────────────────────────────────────────

/** Shape of a single service entry in sentinel-services.yml */
export interface BulkServiceConfig {
  name: string;
  repo: string;               // org/repo format
  health_url: string;
  environment?: string;
  path_filter?: string;
  dependencies?: string[];
  rollback_strategy?: RollbackStrategy;
}

/** Result returned by bulkCreateServices() */
export interface BulkImportResult {
  created: number;
  updated: number;
  dependenciesLinked: number;
  errors: Array<{ service: string; error: string }>;
}

// ─── Deployment ──────────────────────────────────────────────────────────────

export type DeploymentStatus = 'in_progress' | 'completed';
export type DeploymentConclusion =
  | 'success'
  | 'failure'
  | 'cancelled'
  | 'timed_out'
  | 'skipped'
  | null;

export interface Deployment {
  id: string;
  workflowRunId: number;
  workflowName: string;
  branch: string;
  status: DeploymentStatus;
  conclusion: DeploymentConclusion;
  triggeredBy: string;  // GitHub actor login
  startedAt: string;    // ISO timestamp
  completedAt: string | null;
  duration: number | null; // seconds
  serviceId: string;
}

export interface CreateDeploymentInput {
  workflowRunId: number;
  workflowName: string;
  branch: string;
  status: DeploymentStatus;
  conclusion: DeploymentConclusion;
  triggeredBy: string;
  startedAt: string;
  completedAt?: string | null;
  serviceId: string;
  commitSha: string;
}

// ─── Commit ───────────────────────────────────────────────────────────────────

export interface Commit {
  sha: string;
  message: string;
  author: string;
  authorEmail: string;
  timestamp: string; // ISO timestamp
  repoUrl: string;
}

export interface CreateCommitInput {
  sha: string;
  message: string;
  author: string;
  authorEmail: string;
  timestamp: string;
  repoUrl: string;
}

// ─── HealthCheck ─────────────────────────────────────────────────────────────

export type HealthStatus = 'healthy' | 'unhealthy' | 'unknown';

export interface HealthCheck {
  id: string;
  serviceId: string;
  status: HealthStatus;
  statusCode: number | null;
  responseTimeMs: number | null;
  error: string | null;
  checkedAt: string; // ISO timestamp
}

// ─── RCA & Analytics (V2) ─────────────────────────────────────────────────────

export interface ErrorPattern {
  id: string;
  type:
    | 'build_failure'
    | 'test_failure'
    | 'oom_kill'
    | 'timeout'
    | 'missing_secret'
    | 'network_error'
    | 'dependency_conflict'
    | 'lint_error';
  message: string;
  severity: 'critical' | 'warning' | 'info';
  confidence: number;
  detectedAt: string;
}

export interface File {
  path: string;
  changeType: 'added' | 'modified' | 'deleted';
}

export interface Rollback {
  id: string;
  triggeredAt: string;
  trigger: 'automatic' | 'manual';
  strategy: 'rerun' | 'workflow_dispatch';
  targetDeploymentId: string;
  status: 'pending' | 'triggered' | 'failed';
}

// ─── Query results ───────────────────────────────────────────────────────────

export interface ServiceWithHealth extends Service {
  latestDeployment: Deployment | null;
  latestHealth: HealthCheck | null;
}

export interface DeploymentWithCommit extends Deployment {
  commit: Commit | null;
}

export interface DeploymentWithRCA {
  deployment: Deployment;
  errorPatterns: ErrorPattern[];
  commit: Commit | null;
  changedFiles: File[];
}
