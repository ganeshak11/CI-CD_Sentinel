# V1 End-to-End Test Plan

This document tracks the final step-by-step verification of all V1 requirements before declaring the sprint complete.

## 1. Infrastructure
- [x] `docker compose up -d` starts all containers.
- [x] All 4 containers (`sentinel-neo4j`, `sentinel-redis`, `sentinel-backend`, `sentinel-frontend`) are healthy/up.

## 2. Neo4j & Schema
- [x] Backend connects to Neo4j successfully on boot.
- [x] Schema constraints (`Service.id`, `Deployment.workflow_run_id`, `Commit.sha`) are applied.
  - *Test command:* `docker exec sentinel-neo4j cypher-shell -u neo4j -p sentinel_password "SHOW CONSTRAINTS;"`
  - *Current Status:* **Passed**. All 4 uniqueness constraints verified.

## 3. Webhook & Ingestion
- [x] Register a new service via the UI (`http://localhost:3000/services/new`).
  - *Current Status:* **Passed**. Service `CI/CD Sentinel` (id: `56177f17-35ca-4119-983f-1439b4289325`) created. Uniqueness constraint prevented duplicate entries.
- [x] Run `node test-webhook.js` to simulate a GitHub Actions payload.
  - *Current Status:* **Passed**. `200 OK`, `{"message":"Successfully registered deployment for services: [CI/CD Sentinel]"}`
- [x] Payload is accepted and a `Deployment` node is created in Neo4j.
  - *Current Status:* **Passed**. Node confirmed: `workflowRunId: 123456789, status: completed, conclusion: failure, branch: main`
- [x] Duplicate payload execution creates NO duplicate nodes (idempotency test).
  - *Current Status:* **Passed**. Ran 6 times — only 1 `Deployment` node exists in Neo4j.

## 4. Health Worker
- [x] Health Worker automatically polls endpoints every 60 seconds.
  - *Current Status:* **Passed**. Checks recorded at 16:20, 16:21, 16:22, 16:23 UTC.
- [x] Neo4j contains `HealthCheck` nodes.
  - *Current Status:* **Passed**. 5 nodes confirmed — status transitioned from `unhealthy` (404, before fix) to `healthy` (200, after `/health` endpoint added).
- [x] Redis contains the cached health state.
  - *Current Status:* **Passed**. Key: `health:56177f17-35ca-4119-983f-1439b4289325` present in Redis.

## 5. Dashboard (UI)
- [x] Dashboard at `localhost:3000` loads without errors.
  - *Current Status:* **Passed**. Dashboard renders with navbar and service cards.
- [x] The newly registered service appears on the Dashboard.
  - *Current Status:* **Passed**. `CI/CD Sentinel` card visible with `ganeshak11/CI-CD_Sentinel`.
- [x] The simulated webhook deployment appears in the Deployments table.
  - *Current Status:* **Passed**. Shows `failure on main (30/06/2026, 21:52:17)`.
- [x] Health status badge shows correct live state.
  - *Current Status:* **Passed**. Shows 🟢 Healthy.

---

## ✅ V1 Sprint — COMPLETE

All requirements verified as of 2026-06-30. Bugs found and fixed during testing:
- Fixed misleading `Repository URL` placeholder (must be `org/repo` format)
- Fixed webhook setup page showing wrong port and literal env var name
- Fixed `test-webhook.js` payload structure (`repository` must be top-level)
- Added missing `/health` endpoint to backend
- Fixed frontend types (`HealthStatus`, `Service`) to match actual API responses
- Fixed dashboard to read `latestHealth.status` and `latestDeployment` from API
