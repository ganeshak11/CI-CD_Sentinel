export interface Deployment {
  id: string;
  branch: string;
  commitSha: string;
  status: string;
  startedAt: string;
  duration: string;
}