export interface HealthStatus {
  serviceId: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  statusCode: number | null;
  responseTimeMs: number | null;
  error: string | null;
  checkedAt: string;
}

export interface LatestDeployment {
  id: string;
  workflowRunId: number;
  status: string;
  conclusion: string | null;
  branch: string;
  startedAt: string;
  completedAt: string | null;
}

export interface Service {
  id: string;
  name: string;
  repoUrl: string;
  pathFilter?: string;
  healthEndpoint: string;
  environment: string;
  latestDeployment?: LatestDeployment | null;
  latestHealth?: HealthStatus | null;
}
