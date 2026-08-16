jest.mock('./graphService', () => ({
  getDeploymentById: jest.fn(),
  getServiceById: jest.fn(),
  getLastHealthyDeployment: jest.fn(),
  getDeployments: jest.fn(),
  getDependentServices: jest.fn(),
  createRollback: jest.fn(),
}));

jest.mock('./notificationService', () => ({
  sendRollbackAlert: jest.fn(),
  sendRollbackEmail: jest.fn(),
  sendDeploymentAlert: jest.fn(),
  sendDeploymentFailureEmail: jest.fn(),
  sendEmailAlert: jest.fn(),
}));

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

import axios from 'axios';
import * as graphService from './graphService';
import { triggerRedeploy } from './rollbackService';

describe('rollbackService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, GITHUB_TOKEN: 'token-123', ALERT_EMAIL: 'alerts@example.com' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should trigger redeploy using the same workflow run id', async () => {
    const mockDeployment = {
      id: 'dep-1',
      workflowRunId: 456,
      serviceId: 'svc-1',
      branch: 'main',
      workflowName: 'CI/CD',
      status: 'completed',
      conclusion: 'failure',
      triggeredBy: 'alice',
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:05:00.000Z',
      duration: 300,
      commit: null,
    };

    const mockService = {
      id: 'svc-1',
      name: 'api-service',
      repoUrl: 'acme/api-service',
      healthEndpoint: 'https://example.com/health',
      environment: 'production',
      pathFilter: '',
      rollbackStrategy: 'rerun',
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    (graphService.getDeploymentById as jest.Mock).mockResolvedValue(mockDeployment);
    (graphService.getServiceById as jest.Mock).mockResolvedValue(mockService);
    (axios.post as jest.Mock).mockResolvedValue({ status: 201 });

    const result = await triggerRedeploy('dep-1');

    expect(graphService.getDeploymentById).toHaveBeenCalledWith('dep-1');
    expect(graphService.getServiceById).toHaveBeenCalledWith('svc-1');
    expect(axios.post).toHaveBeenCalledWith(
      'https://api.github.com/repos/acme/api-service/actions/runs/456/rerun',
      {},
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
        }),
      })
    );
    expect(result).toMatchObject({
      deploymentId: 'dep-1',
      status: 'triggered',
    });
  });
});
