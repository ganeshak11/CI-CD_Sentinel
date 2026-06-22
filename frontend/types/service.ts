export interface Service {
  id: string;
  name: string;
  repoUrl: string;
  pathFilter?: string;
  healthEndpoint: string;
  environment: string;
  lastDeploymentTime?: string;
}
