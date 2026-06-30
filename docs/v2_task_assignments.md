# V2 Task Assignments — "Fix Faster"

> **Sprint Goal:** By the end of V2, Sentinel can automatically detect *why* a deployment failed (RCA), trigger a rollback to the last healthy deployment, and notify the team via Slack and Email — all within 60 seconds of a failure.

**Start Date:** 01/07/2026
**Sprint Duration:** ~3 Weeks

---

## Dependency Map

Understanding who blocks who is critical. Do not start Phase 2 work until Phase 1 is merged into `dev`.

```
┌─────────────────────────────────────────────────────────────┐
│  PHASE 1 — Foundation (Week 1)                              │
│  🔵 Ganesh: Graph schema + graphService functions           │
│  ⚡ EVERYONE IS BLOCKED until this is merged                │
└───────────────────┬─────────────────────┬───────────────────┘
                    │                     │
        ┌───────────▼──────┐   ┌──────────▼──────────┐
        │  PHASE 2A        │   │  PHASE 2B           │
        │  🟢 Chinmay      │   │  🟠 Abdul           │
        │  LogFetch + RCA  │   │  Rollback + Notifs  │
        │  (parallel)      │   │  (parallel)         │
        └───────────┬──────┘   └──────────┬──────────┘
                    │                     │
        ┌───────────▼─────────────────────▼───────────┐
        │  PHASE 3 — Frontend (Week 3)                │
        │  🟣 Varsha: RCA Panel + Rollback Console    │
        │  Blocked until BOTH Chinmay & Abdul done    │
        └─────────────────────────────────────────────┘
```

---

## ⚠️ Ground Rules

- **Never push directly to `main` or `dev`.** Always work on a `feature/` branch.
- Use `./push.sh` (Linux/macOS) or `.\push.ps1` (Windows) to push your branch.
- Open a **Draft PR** into `dev` as soon as you create your branch.
- **Phase 2 cannot start until Ganesh's PR is merged.** Ping in the group chat when Phase 1 is done.
- If you're stuck for more than **30 minutes**, ask in the group chat.

---

## PHASE 1 — 🔵 Ganesh (Graph Foundation)

**Branch:** `feature/v2-graph-intelligence`
**Deadline: End of Week 1**
**Who is blocked by this:** Everyone (Chinmay, Abdul, Varsha all depend on these functions)

### Why I go first
Need `createErrorPattern()` and `createFileChange()` to write RCA results into Neo4j.
Need `createRollback()` and `getLastHealthyDeployment()` to build the rollback engine.
Need the API endpoints that Chinmay and Abdul expose — which themselves depend on these graph functions.
**Nothing in V2 works without this layer.**

### Tasks

- [ ] **Extend Schema** — add to `backend/src/db/applySchema.ts`:
  - `UNIQUE` constraint on `ErrorPattern.id`
  - `UNIQUE` constraint on `File.path`
  - Index on `ErrorPattern.type`, `ErrorPattern.severity`
  - Index on `Rollback.triggeredAt`

- [ ] **New Types** — extend `backend/src/types/deployment.types.ts`:
  ```ts
  interface ErrorPattern {
    id: string;
    type: 'build_failure' | 'test_failure' | 'oom_kill' | 'timeout' |
          'missing_secret' | 'network_error' | 'dependency_conflict' | 'lint_error';
    message: string;
    severity: 'critical' | 'warning' | 'info';
    confidence: number;    // 0.0–1.0
    detectedAt: string;
  }

  interface File {
    path: string;
    changeType: 'added' | 'modified' | 'deleted';
  }

  interface Rollback {
    id: string;
    triggeredAt: string;
    trigger: 'automatic' | 'manual';
    strategy: 'rerun' | 'workflow_dispatch';
    targetDeploymentId: string;
    status: 'pending' | 'triggered' | 'failed';
  }
  ```

- [ ] **New graphService functions** — add to `backend/src/services/graphService.ts`:
  - `createErrorPattern(deploymentId, pattern)` — creates `(:ErrorPattern)` + `[:CAUSED_ERROR]` from Deployment
  - `createFileChange(commitSha, filePath, changeType)` — creates `(:File)` + `[:CHANGED_FILE]` from Commit
  - `getLastHealthyDeployment(serviceId)` — returns the most recent Deployment with `conclusion = 'success'`
  - `createRollback(rollbackData)` — creates `(:Rollback)` + `[:TRIGGERED_ROLLBACK]` from Deployment
  - `getDeploymentWithRCA(deploymentId)` — single traversal returning: deployment + errorPatterns + commit + changedFiles
  - `getDeploymentChain(serviceId, limit)` — ordered deployment history for visualization

- [ ] **Integration Reviews** — Review all PRs from Chinmay, Abdul, Varsha before merging to `dev`

- [ ] **V2 Test Plan** — Create `docs/v2_test_plan.md`

### Acceptance Criteria
- All new schema constraints are applied on `docker compose up -d` (verify with `SHOW CONSTRAINTS`)
- `getLastHealthyDeployment()` returns the correct node — test via Neo4j browser
- `getDeploymentWithRCA()` returns a complete object in a single DB call
- All new types are fully TypeScript-typed — no `any`
- **Merge PR and ping the team before Chinmay and Abdul start Phase 2**

---

## PHASE 2A — 🟢 Chinmay (Log Fetcher + RCA Engine)

**Branch:** `feature/v2-rca-engine`

### Tasks

- [ ] **Error Patterns Library** — create `backend/src/utils/errorPatterns.ts` first (no dependencies, can start immediately after Ganesh merges):
  Export all 8 regex patterns as named constants:

  | Pattern Type | Regex Signals |
  |---|---|
  | `build_failure` | `Cannot find module`, `SyntaxError`, `tsc: error TS` |
  | `test_failure` | `FAIL src/`, `● Test suite failed`, `AssertionError` |
  | `oom_kill` | `Out of memory`, `Killed`, `exit code 137` |
  | `timeout` | `Timeout of`, `timed out after`, `ETIMEDOUT` |
  | `missing_secret` | `secret.*not found`, `undefined.*SECRET`, `Error: GITHUB_TOKEN` |
  | `network_error` | `ECONNREFUSED`, `ENOTFOUND`, `fetch failed` |
  | `dependency_conflict` | `peer dep`, `ERESOLVE`, `version conflict` |
  | `lint_error` | `ESLint:`, `Prettier:`, `no-unused`, `Parsing error:` |

- [ ] **Log Fetcher** — create `backend/src/services/logFetchJob.ts`:
  - `fetchLogs(repoFullName, workflowRunId)` → calls GitHub API: `GET /repos/{owner}/{repo}/actions/runs/{run_id}/logs`
  - Response is a ZIP — download and extract in-memory using `adm-zip` or `jszip`
  - Concatenate all `.txt` log files into one string
  - Store last **500 lines** in Redis: key `logs:{workflowRunId}`, TTL 1 hour
  - Retry with exponential backoff (max 3 attempts — logs may not be ready immediately after a run)
  - Auth: `Authorization: Bearer ${GITHUB_TOKEN}`

- [ ] **RCA Engine** — create `backend/src/services/rcaService.ts`:
  - `analyzeLog(logText)` — returns `ErrorPattern[]` ordered by confidence DESC
  - Use patterns from `errorPatterns.ts` (not hardcoded)
  - Severity rules: `oom_kill` + `missing_secret` → `critical`; `build_failure` + `test_failure` → `warning`; others → `info`
  - Confidence: exact key phrase match → 0.9; partial → 0.6

- [ ] **Wire into webhook pipeline** — update `webhookService.ts`:
  After `createDeployment()`, if `conclusion === 'failure'`:
  1. Call `logFetchJob.fetchLogs(repoFullName, workflowRunId)` — non-blocking, catch errors
  2. Run `rcaService.analyzeLog(logText)` on the result
  3. For each pattern found → call `graphService.createErrorPattern(deploymentId, pattern)`
  4. For each changed file from the commit → call `graphService.createFileChange(commitSha, filePath, changeType)`

- [ ] **RCA + Log API Endpoints** — add to `backend/src/routes/deployment.routes.ts`:
  - `GET /api/deployments/:id/rca` → calls `graphService.getDeploymentWithRCA(id)` → returns `{ deployment, errorPatterns, commit, changedFiles }`
  - `GET /api/deployments/:id/logs` → reads from Redis key `logs:{workflowRunId}` → returns last 500 lines (empty array if not cached)

- [ ] **Unit Tests** — `backend/src/services/rcaService.test.ts`:
  - At least 3 test cases per pattern type (24 total minimum)
  - Test that `fetchLogs` failure does NOT crash the webhook response

### Acceptance Criteria
- Send a `failure` webhook → `ErrorPattern` nodes appear in Neo4j within 10 seconds
- `GET /api/deployments/:id/rca` returns at least 1 error pattern for a known failure
- `GET /api/deployments/:id/logs` returns log lines from Redis
- Log fetch failure returns 200 from the webhook (error is caught and logged, not propagated)
- **Merge PR and ping Varsha when done — she is blocked on this**

---

## PHASE 2B — 🟠 Abdul (Rollback Engine + Notifications)

**Branch:** `feature/v2-rollback-notifications`

### Why Abdul is Phase 2 (not Phase 1)
Abdul needs `graphService.createRollback()` and `graphService.getLastHealthyDeployment()` from Ganesh's Phase 1. The Notification service also needs to know which deployment triggered a rollback — that data model comes from Ganesh too.

### Why Abdul runs parallel to Chinmay (not after)
The rollback engine and notification service are **independent** of Chinmay's RCA engine. Abdul reads from `HealthCheck` nodes (built in V1) and existing `Deployment` nodes — he doesn't need Chinmay's `ErrorPattern` nodes to function.

### Tasks

- [ ] **Notification Service** (start here — no graph dependencies, only needs V1 data):
  Create `backend/src/services/notificationService.ts`:

  **Slack** (using `@slack/webhook`):
  - `sendDeploymentAlert(deployment, service)` — triggered on every `conclusion: 'failure'`
  - `sendRollbackAlert(rollback, service, targetDeployment)` — triggered when auto-rollback fires
  - Message format: service name, branch, conclusion, link to GitHub Actions run

  **Email** (using `nodemailer` + SMTP from env):
  - `sendEmailAlert(subject, body, to)` — called for critical failures alongside Slack
  - HTML template: failure summary table + "View Logs" and "Trigger Rollback" buttons

  **Wire into webhook pipeline** — update `webhookService.ts`:
  - After `createDeployment()`, if `conclusion === 'failure'` → call `notificationService.sendDeploymentAlert()` (non-blocking)

- [ ] **Rollback Engine** — create `backend/src/services/rollbackService.ts`:

  **Tier 1 — Automatic Rollback:**
  - In `healthWorker.ts`, after writing an `unhealthy` HealthCheck: query Neo4j for the last 3 checks for this service
  - If all 3 are `unhealthy` → call `rollbackService.triggerAutoRollback(serviceId)`
  - `triggerAutoRollback(serviceId)`:
    1. `graphService.getLastHealthyDeployment(serviceId)` → find rollback target
    2. If no healthy deployment exists → log warning, skip
    3. Call GitHub API based on service's `rollbackStrategy`:
       - `rerun`: `POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun`
       - `workflow_dispatch`: `POST /repos/{owner}/{repo}/actions/workflows/{id}/dispatches`
    4. `graphService.createRollback(rollbackData)` → record the attempt in Neo4j
    5. `notificationService.sendRollbackAlert()` → notify the team

  **Tier 2 — Manual Rollback (API):**
  - `rollbackService.triggerManualRollback(deploymentId)` — same flow as auto but triggered via API

- [ ] **Rollback API Endpoints** — add to `backend/src/routes/deployment.routes.ts`:
  - `GET /api/deployments/:id/rollback-preview` — returns: target deployment, affected dependent services (via `DEPENDS_ON` traversal), risk estimate
  - `POST /api/deployments/:id/rollback` — triggers `rollbackService.triggerManualRollback()`
  - `POST /api/deployments/:id/redeploy` — re-triggers the exact same run (not a previous one)

### Acceptance Criteria
- Send a `failure` webhook → Slack message appears in the team channel within 5 seconds
- Send a `failure` webhook → Email received at `ALERT_EMAIL` within 30 seconds
- 3 consecutive unhealthy health checks → `Rollback` node created in Neo4j + GitHub API called
- `GET /api/deployments/:id/rollback-preview` returns the correct target deployment
- Notification failures are caught — no 500s propagated to the webhook or health worker
- **Merge PR and ping Varsha when done — she is blocked on this**

---

## PHASE 3 — 🟣 Varsha (Frontend Intelligence)

**Branch:** `feature/v2-frontend-intelligence`

### Tasks

- [ ] **New API Client methods** — add to `frontend/services/api.ts`:
  - `getDeploymentRCA(id)` → `GET /api/deployments/:id/rca`
  - `getDeploymentLogs(id)` → `GET /api/deployments/:id/logs`
  - `getRollbackPreview(id)` → `GET /api/deployments/:id/rollback-preview`
  - `triggerRollback(id)` → `POST /api/deployments/:id/rollback`
  - `triggerRedeploy(id)` → `POST /api/deployments/:id/redeploy`

- [ ] **Update Frontend Types** — add to `frontend/types/`:
  - `ErrorPattern`, `RCAResult`, `RollbackPreview` interfaces matching backend responses

- [ ] **Deployment Detail Page** — create `frontend/app/deployments/[id]/page.tsx`:
  - Fetch `GET /api/deployments/:id/rca` on load
  - **Deployment Summary card**: service name, branch, commit SHA, status badge, duration
  - **Error Patterns section**: each pattern as a card — type badge (color-coded by severity), confidence bar (0–100%), raw log message snippet
  - **Changed Files list**: each file with `added` / `modified` / `deleted` label
  - **Commit card**: SHA (first 7 chars), author, message, timestamp

- [ ] **Log Viewer Panel** (within Deployment Detail page):
  - Fetch `GET /api/deployments/:id/logs`
  - Render in a scrollable dark terminal-style `<pre>` block (max height, overflow scroll)
  - Highlight lines matching error keywords in red / yellow
  - "Copy Logs" button

- [ ] **Rollback Console Panel** (within Deployment Detail page):
  - **"Preview Rollback" button** → `GET /api/deployments/:id/rollback-preview` → opens a modal showing:
    - Target deployment (SHA, date, status)
    - Affected dependent services (from `DEPENDS_ON`)
    - Risk level badge (low / medium / high)
  - **"Confirm Rollback" button** (inside modal) → `POST /api/deployments/:id/rollback` → success/error toast
  - **"Redeploy Same Commit" button** → `POST /api/deployments/:id/redeploy`

- [ ] **Upgrade Main Dashboard** (`frontend/app/page.tsx`):
  - Service cards: add time-since-last-deploy, conclusion badge on last deployment
  - "Recent Failures" section below grid: last 5 failed deployments across all services, each linking to `/deployments/:id`
  - Clicking a service card navigates to `/services/:id` (stub page is fine)

### Acceptance Criteria
- Clicking a deployment row navigates to the detail page with RCA data loaded
- At least 1 error pattern is shown for a `failure` deployment
- "Preview Rollback" modal opens with correct target deployment data
- Log viewer renders and highlights error lines
- No TypeScript `any` in new files — all API responses are properly typed
- No console errors on any page

---

## Shared / Everyone

- [ ] **`docs/v2_test_plan.md`** — Ganesh creates this in Phase 1
- [ ] **Peer Review** — every PR needs 1 team review before Ganesh approves into `dev`

---

## Sprint Timeline

| Week | Who | What |
|---|---|---|
| **Week 1** | 🔵 Ganesh | Schema + all graphService functions. Everyone else: research, branch setup |
| **Week 2** | 🟢 Chinmay + 🟠 Abdul | Parallel — RCA engine AND rollback+notifications. Varsha: build UI shell with mocks |
| **Week 3** | 🟣 Varsha | Replace mocks with real APIs. Full integration. Ganesh reviews all PRs |

---

## V2 Definition of Done

The sprint is complete when **all of the following are true:**

1. A `failure` webhook triggers log fetching, RCA parsing, and `ErrorPattern` nodes appear in Neo4j within 10 seconds
2. A Slack message is sent within 5 seconds of a failure webhook
3. After 3 consecutive unhealthy health checks, a `Rollback` node is created and the GitHub API is called to re-trigger the workflow
4. `GET /api/deployments/:id/rca` returns `{ deployment, errorPatterns, commit, changedFiles }` in a single API call
5. The frontend Deployment Detail page shows error patterns, changed files, log viewer, and a working rollback console
6. All code is on the `dev` branch, reviewed and approved by Ganesh
7. `docker compose up -d` is the only command needed to run the full stack

---

*Questions? Ask in the group chat. V2 is where Sentinel becomes intelligent — make it count.*
