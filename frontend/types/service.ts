import { HealthStatus, LatestDeployment } from './health';

export interface Service {
  id: string;
  name: string;
  repoUrl: string;
  pathFilter?: string;
  healthEndpoint: string;
  environment: string;
  createdAt: string;
  latestDeployment?: LatestDeployment | null;
  latestHealth?: HealthStatus | null;
}
