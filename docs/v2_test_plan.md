# V2 Test Plan — Graph Intelligence

This document outlines the testing strategy for the Phase 1 Graph Intelligence features introduced in `feature/v2-graph-intelligence`.

## 1. Schema Validation

**Goal:** Ensure the Neo4j schema includes all constraints and indexes required by V2.

**Steps:**
1. Run `docker compose up -d` to start Neo4j.
2. The `backend` service should run the startup script (`applySchema.ts`).
3. Connect to the Neo4j browser at `http://localhost:7474`.
4. Run the query: `SHOW CONSTRAINTS;`
   - Verify that `errorpattern_id` and `file_path` are present.
5. Run the query: `SHOW INDEXES;`
   - Verify that `errorpattern_type`, `errorpattern_severity`, and `rollback_triggered_at` are present.

## 2. Testing `graphService` Functions

**Goal:** Ensure new V2 models can be persisted correctly and relationships are formed.

### 2.1. `createErrorPattern`
- Create a test Deployment.
- Call `createErrorPattern(deploymentId, patternData)`.
- Query `MATCH (d:Deployment)-[r:CAUSED_ERROR]->(e:ErrorPattern) RETURN d, r, e`.
- **Expected:** The relationship exists and node `e` contains all properties (`type`, `severity`, `confidence`, `message`).

### 2.2. `createFileChange`
- Create a test Commit.
- Call `createFileChange(commitSha, 'src/index.ts', 'modified')`.
- Query `MATCH (c:Commit)-[r:CHANGED_FILE]->(f:File) RETURN c, r, f`.
- **Expected:** The relationship exists, node `f` has `path = 'src/index.ts'` and `changeType = 'modified'`.

### 2.3. `getLastHealthyDeployment`
- Create 3 deployments for `serviceId = 'service-1'`. Set the latest one's conclusion to `failure` and the middle one to `success`.
- Call `getLastHealthyDeployment('service-1')`.
- **Expected:** It returns the middle deployment (the most recent one with `success` conclusion).

### 2.4. `createRollback`
- Choose a healthy target deployment ID.
- Call `createRollback({ targetDeploymentId, trigger: 'automatic', strategy: 'rerun' })`.
- Query `MATCH (d:Deployment)-[r:TRIGGERED_ROLLBACK]->(rb:Rollback) RETURN d, r, rb`.
- **Expected:** The relationship exists, linking the target deployment to the rollback record.

### 2.5. `getDeploymentWithRCA`
- Use the mock data created in 2.1 and 2.2.
- Call `getDeploymentWithRCA(deploymentId)`.
- **Expected:** It returns an object containing:
  - `deployment` (the base deployment)
  - `errorPatterns` (array with the created pattern)
  - `commit` (the associated commit)
  - `changedFiles` (array with the changed file)
- **Note:** Ensure this returns a complete object in a single DB call without multiple sequential queries.

### 2.6. `getDeploymentChain`
- Call `getDeploymentChain(serviceId, 5)`.
- **Expected:** It returns an array of up to 5 deployments, ordered by `startedAt DESC`.

## 3. Integration Hand-off
Once these tests pass, `feature/v2-graph-intelligence` is ready to be merged into `dev`, unblocking **Phase 2** (Chinmay and Abdul).
