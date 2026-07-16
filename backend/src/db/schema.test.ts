import { driver } from './index';
import { applySchema } from './applySchema';

describe('Neo4j Schema Validation', () => {
  beforeAll(async () => {
    // Apply the schema before running validation tests
    await applySchema();
  });

  afterAll(async () => {
    // Close the driver connection after tests
    await driver.close();
  });

  it('should have required constraints', async () => {
    const session = driver.session();
    try {
      const result = await session.run('SHOW CONSTRAINTS');
      const constraints = result.records.map(record => record.get('name'));
      
      // Expected V2 Constraints
      expect(constraints).toContain('errorpattern_id');
      expect(constraints).toContain('file_path');
      
      // Some V1 constraints to be safe
      expect(constraints).toContain('service_id');
      expect(constraints).toContain('deployment_id');
    } finally {
      await session.close();
    }
  });

  it('should have required indexes', async () => {
    const session = driver.session();
    try {
      const result = await session.run('SHOW INDEXES');
      const indexes = result.records.map(record => record.get('name'));
      
      // Expected V2 Indexes
      expect(indexes).toContain('errorpattern_type');
      expect(indexes).toContain('errorpattern_severity');
      expect(indexes).toContain('rollback_triggered_at');
    } finally {
      await session.close();
    }
  });
});
