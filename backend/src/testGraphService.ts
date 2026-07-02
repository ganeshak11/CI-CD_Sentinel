import { driver } from './db/index';
import {
  createErrorPattern,
  createFileChange,
  getLastHealthyDeployment,
  createRollback,
  getDeploymentWithRCA,
  createDeployment,
  createCommit,
  createService
} from './services/graphService';

async function runTests() {
  console.log("Starting GraphService Tests...");

  try {
    // 1. Setup Test Data
    const service = await createService({
      name: 'test-service-v2',
      repoUrl: 'ganeshak11/test',
      healthEndpoint: 'http://localhost/health'
    });
    console.log("Created Service:", service.id);

    const deployment = await createDeployment({
      workflowRunId: 9999,
      workflowName: 'Test Workflow',
      branch: 'main',
      status: 'completed',
      conclusion: 'failure',
      triggeredBy: 'tester',
      startedAt: new Date().toISOString(),
      serviceId: service.id,
      commitSha: 'abc123test'
    });
    console.log("Created Deployment:", deployment.id);

    const commit = await createCommit({
      sha: 'abc123test',
      message: 'test commit',
      author: 'tester',
      authorEmail: 'test@test.com',
      timestamp: new Date().toISOString(),
      repoUrl: 'ganeshak11/test'
    }, 9999);
    console.log("Created Commit:", commit.sha);

    // 2. Test createErrorPattern
    const errorPattern = await createErrorPattern(deployment.id, {
      type: 'oom_kill',
      message: 'Out of memory',
      severity: 'critical',
      confidence: 0.95
    });
    console.log("✅ createErrorPattern:", errorPattern.id);

    // 3. Test createFileChange
    const file = await createFileChange(commit.sha, 'src/test.ts', 'modified');
    console.log("✅ createFileChange:", file.path);

    // 4. Test getDeploymentWithRCA
    const rca = await getDeploymentWithRCA(deployment.id);
    console.log("✅ getDeploymentWithRCA:");
    console.log("  - Deployment ID:", rca?.deployment.id);
    console.log("  - Error Patterns:", rca?.errorPatterns.length);
    console.log("  - Changed Files:", rca?.changedFiles.length);
    console.log("  - Commit SHA:", rca?.commit?.sha);

    // 5. Test getLastHealthyDeployment
    const healthyDeployment = await createDeployment({
      workflowRunId: 8888,
      workflowName: 'Test Workflow',
      branch: 'main',
      status: 'completed',
      conclusion: 'success',
      triggeredBy: 'tester',
      startedAt: new Date().toISOString(),
      serviceId: service.id,
      commitSha: 'healthy123'
    });
    
    const lastHealthy = await getLastHealthyDeployment(service.id);
    console.log("✅ getLastHealthyDeployment:", lastHealthy?.id === healthyDeployment.id ? 'Passed' : 'Failed');

    // 6. Test createRollback
    if (lastHealthy) {
      const rollback = await createRollback({
        targetDeploymentId: lastHealthy.id,
        trigger: 'automatic',
        strategy: 'rerun'
      });
      console.log("✅ createRollback:", rollback.id);
    }

  } catch (err) {
    console.error("Test failed:", err);
  } finally {
    await driver.close();
  }
}

runTests();
