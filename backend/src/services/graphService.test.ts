import { v4 as uuidv4 } from 'uuid';
import {
  createService,
  findServicesByRepo,
  bulkCreateServices,
  createHealthCheck,
  getHealthHistory,
} from './graphService';
import { driver, executeQuery } from '../db/index';

jest.mock('../db/index', () => ({
  driver: {
    session: jest.fn(),
    verifyConnectivity: jest.fn(),
    close: jest.fn(),
  },
  executeQuery: jest.fn(),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(),
}));

describe('Graph Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createService', () => {
    it('should create a service successfully', async () => {
      (uuidv4 as jest.Mock).mockReturnValue('mock-uuid-123');
      const mockResult = {
        records: [
          {
            get: jest.fn().mockReturnValue({
              properties: { id: 'mock-uuid-123', name: 'test-service' },
            }),
          },
        ],
      };
      (executeQuery as jest.Mock).mockResolvedValue(mockResult);

      const result = await createService({
        name: 'test-service',
        repoUrl: 'org/repo',
        healthEndpoint: 'http://health',
      });

      expect(executeQuery).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ id: 'mock-uuid-123', name: 'test-service' });
    });

    it('should create a service with dependencies', async () => {
      (uuidv4 as jest.Mock).mockReturnValue('mock-uuid-123');
      const mockResult = {
        records: [
          {
            get: jest.fn().mockReturnValue({
              properties: { id: 'mock-uuid-123', name: 'test-service' },
            }),
          },
        ],
      };
      (executeQuery as jest.Mock).mockResolvedValue(mockResult);

      const result = await createService({
        name: 'test-service',
        repoUrl: 'org/repo',
        healthEndpoint: 'http://health',
        dependencies: ['dep-1', 'dep-2'],
      });

      expect(executeQuery).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ id: 'mock-uuid-123', name: 'test-service' });
    });
  });

  describe('findServicesByRepo', () => {
    it('should return services by repo full name', async () => {
      const mockResult = {
        records: [
          { get: jest.fn().mockReturnValue({ properties: { id: '1', name: 's1' } }) },
          { get: jest.fn().mockReturnValue({ properties: { id: '2', name: 's2' } }) },
        ],
      };
      (executeQuery as jest.Mock).mockResolvedValue(mockResult);

      const result = await findServicesByRepo('org/repo');

      expect(executeQuery).toHaveBeenCalledWith(expect.any(String), { repoFullName: 'org/repo' });
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: '1', name: 's1' });
    });
  });

  describe('bulkCreateServices', () => {
    it('should bulk create services', async () => {
      const mockRun = jest.fn()
        .mockResolvedValueOnce({
          records: [{ get: jest.fn().mockReturnValue(true) }] // isNew = true
        });
      const mockTxc = {
        run: mockRun,
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      const mockSession = {
        beginTransaction: jest.fn().mockReturnValue(mockTxc),
        close: jest.fn(),
      };
      (driver.session as jest.Mock).mockReturnValue(mockSession);
      (uuidv4 as jest.Mock).mockReturnValue('mock-uuid');

      const result = await bulkCreateServices([
        { name: 'test-service', repo: 'org/repo', health_url: 'http://health' }
      ]);

      expect(mockTxc.run).toHaveBeenCalledTimes(1);
      expect(mockTxc.commit).toHaveBeenCalledTimes(1);
      expect(mockSession.close).toHaveBeenCalledTimes(1);
      expect(result.created).toBe(1);
    });
  });

  describe('HealthCheck functions', () => {
    it('should create a health check record', async () => {
      const mockResult = {
        records: [
          {
            get: jest.fn().mockReturnValue({
              properties: {
                id: 'health-1',
                serviceId: 'svc-1',
                status: 'healthy',
                statusCode: 200,
                responseTimeMs: 123,
                error: null,
                checkedAt: '2026-06-06T00:00:00.000Z',
              },
            }),
          },
        ],
      };
      (executeQuery as jest.Mock).mockResolvedValue(mockResult);

      const result = await createHealthCheck('svc-1', 'healthy', 200, 123, null);

      expect(executeQuery).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
        serviceId: 'svc-1',
        status: 'healthy',
        statusCode: 200,
      }));
      expect(result).toEqual({
        id: 'health-1',
        serviceId: 'svc-1',
        status: 'healthy',
        statusCode: 200,
        responseTimeMs: 123,
        error: null,
        checkedAt: '2026-06-06T00:00:00.000Z',
      });
    });

    it('should return health history for a service', async () => {
      const mockResult = {
        records: [
          { get: jest.fn().mockReturnValue({ properties: { id: 'health-1', serviceId: 'svc-1' } }) },
          { get: jest.fn().mockReturnValue({ properties: { id: 'health-2', serviceId: 'svc-1' } }) },
        ],
      };
      (executeQuery as jest.Mock).mockResolvedValue(mockResult);

      const result = await getHealthHistory('svc-1', 10);

      expect(executeQuery).toHaveBeenCalledWith(expect.any(String), { serviceId: 'svc-1', limit: 10 });
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: 'health-1', serviceId: 'svc-1' });
    });
  });
});
