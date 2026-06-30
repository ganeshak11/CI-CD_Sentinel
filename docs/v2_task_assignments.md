# V2 Task Assignments — "Fix Faster"

> **Sprint Goal:** By the end of V2, Sentinel can automatically detect *why* a deployment failed (RCA), trigger a rollback to the last healthy deployment, and notify the team via Slack and Email — all within 60 seconds of a failure landing in Neo4j.

**Start Date:** 01/07/2026
**Sprint Duration:** ~3 Weeks (until V2 is stable on `dev`)
**Integration Lead (Review all PRs into `dev`):** Ganesh

---

## Ground Rules

- **Never push directly to `main` or `dev`.** Always work on a `feature/` branch.
- Use `./push.sh` (Linux/macOS) or `.\push.ps1` (Windows) to push your branch.
- Open a **Draft PR** into `dev` as soon as you create your branch.
- If you're stuck for more than **30 minutes**, ask in the group chat. Don't suffer silently.
- All V2 features depend on V1 data being present. Make sure `docker compose up -d` is running and Neo4j has at least one `Deployment` node before starting.

---

## 🔵 Ganesh — DevOps / Integration Lead + Graph Queries

**Branch:** `feature/v2-graph-intelligence`

### Responsibilities
You own the Neo4j graph layer for V2 — new node types, new relationships, and the queries that power RCA and rollback. You also own CI and integration.

### Tasks

- [ ] **New Graph Schema:** Extend `backend/src/db/applySchema.ts` for V2 nodes
  - Add `UNIQUE` constraint on `ErrorPattern.id`
  - Add `UNIQUE` constraint on `File.path`
  - Add index on `ErrorPattern.type` and `ErrorPattern.severity`
  - Add index on `Rollback.triggeredAt`

- [ ] **New Graph Types:** Extend `backend/src/types/deployment.types.ts`
  ```ts
  interface ErrorPattern {
    id: string;
    type: 'build_failure' | 'test_failure' | 'oom_kill' | 'timeout' |
          'missing_secret' | 'network_error' | 'dependency_conflict' | 'lint_error';
    message: string;
    severity: 'critical' | 'warning' | 'info';
    confidence: number;       // 0.0–1.0
    detectedAt: string;       // ISO timestamp
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

- [ ] **New graphService functions** in `backend/src/services/graphService.ts`
  - `createErrorPattern(deploymentId, pattern)` — creates `(:ErrorPattern)` node + `[:CAUSED_ERROR]` relationship from the Deployment
  - `createFileChange(commitSha, filePath, changeType)` — creates `(:File)` node + `[:CHANGED_FILE]` relationship from the Commit
  - `getLastHealthyDeployment(serviceId)` — returns the most recent `Deployment` where `conclusion = 'success'`
  - `createRollback(rollbackData)` — creates `(:Rollback)` node + `[:TRIGGERED_ROLLBACK]` relationship from the Deployment
  - `getDeploymentWithRCA(deploymentId)` — returns full deployment context: deployment + error patterns + commit + changed files (single traversal)
  - `getDeploymentChain(serviceId, limit)` — returns ordered deployment history for graph visualization

- [ ] **Integration Reviews:** Review all PRs from Chinmay, Varsha, and Abdul before merging to `dev`

- [ ] **V2 Test Plan:** Create `docs/v2_test_plan.md` based on the V2 Definition of Done

### Acceptance Criteria
- All new schema constraints applied on `docker compose up -d`
- `getLastHealthyDeployment()` returns the correct node when queried via Neo4j browser
- `getDeploymentWithRCA()` returns a complete object in a single DB call
- New types are fully TypeScript-typed (no `any`)

---

## 🟢 Chinmay — Backend (Log Fetcher + RCA Engine)

**Branch:** `feature/v2-rca-engine`

### Responsibilities
You are the intelligence layer. When a deployment fails, you fetch its logs, parse them for known error patterns, and write the findings into Neo4j — so the team knows *why* it failed within seconds.

### Tasks

- [ ] **Log Fetcher:** Create `backend/src/services/logFetchJob.ts`
  - Triggered automatically when `webhookService` processes a `conclusion: 'failure'` event
  - Use GitHub API: `GET /repos/{owner}/{repo}/actions/runs/{run_id}/logs`
    - Returns a ZIP file — download, extract in-memory (use `adm-zip` or `jszip`)
    - Parse the extracted `.txt` log files into a single string
  - Handle auth: use `GITHUB_TOKEN` from env as Bearer token
  - Implement retry with exponential backoff (max 3 attempts, logs may not be ready immediately)
  - Store the last **500 lines** in Redis: key `logs:{workflowRunId}`, TTL 1 hour

- [ ] **RCA Engine:** Create `backend/src/services/rcaService.ts`
  - Called with the parsed log string from the log fetcher
  - Detect the following 8 error pattern types using regex matching:

  | Pattern Type | Example Log Signal |
  |---|---|
  | `build_failure` | `Error: Cannot find module`, `SyntaxError`, `tsc: error TS` |
  | `test_failure` | `FAIL src/`, `● Test suite failed`, `AssertionError` |
  | `oom_kill` | `Out of memory`, `Killed`, `exit code 137` |
  | `timeout` | `Error: Timeout of`, `timed out after`, `ETIMEDOUT` |
  | `missing_secret` | `secret.*not found`, `undefined.*SECRET`, `Error: GITHUB_TOKEN` |
  | `network_error` | `ECONNREFUSED`, `ENOTFOUND`, `fetch failed` |
  | `dependency_conflict` | `peer dep`, `ERESOLVE`, `incompatible`, `version conflict` |
  | `lint_error` | `ESLint:`, `Prettier:`, `error  no-unused`, `Parsing error:` |

  - Return an array of `{ type, message, severity, confidence }` — ordered by confidence DESC
  - Assign severity: `oom_kill`, `missing_secret` → `critical`; `build_failure`, `test_failure` → `warning`; others → `info`
  - Confidence: exact regex match on key phrase → 0.9; partial → 0.6

- [ ] **Wire RCA into webhook pipeline** in `webhookService.ts`
  - After `createDeployment()`, if `conclusion === 'failure'`:
    1. Trigger `logFetchJob.fetchLogs(repoFullName, workflowRunId)` (non-blocking — `await` but don't fail the webhook response if it errors)
    2. Run `rcaService.analyzeLog(logText)` on the result
    3. For each error pattern found, call `graphService.createErrorPattern(deploymentId, pattern)`

- [ ] **RCA API Endpoint:** Add to `backend/src/routes/deployment.routes.ts`
  - `GET /api/deployments/:id/rca` — returns `{ deployment, errorPatterns, commit, changedFiles }` using `graphService.getDeploymentWithRCA()`
  - `GET /api/deployments/:id/logs` — returns last 500 log lines from Redis (fallback: empty array)

- [ ] **Error Patterns Library:** Create `backend/src/utils/errorPatterns.ts`
  - Export all 8 regex patterns as named constants — not hardcoded inside `rcaService.ts`

### Acceptance Criteria
- Trigger a `conclusion: 'failure'` webhook → logs are fetched and parsed within 10 seconds
- `GET /api/deployments/:id/rca` returns at least 1 error pattern for a known failure log
- `GET /api/deployments/:id/logs` returns the last 500 lines from Redis
- Log fetch failure does NOT crash the webhook response (errors are caught and logged)
- All 8 pattern types have at least 3 test cases in `rcaService.test.ts`

---

## 🟠 Abdul — Backend (Rollback Engine + Notification Service)

**Branch:** `feature/v2-rollback-notifications`

### Responsibilities
You close the loop — when something breaks, Sentinel fixes it (or at least tries). You also make sure no failure goes unnoticed by the team.

### Tasks

- [ ] **Rollback Engine:** Create `backend/src/services/rollbackService.ts`

  **Tier 1 — Automatic Rollback (health-only trigger):**
  - In `healthWorker.ts`, after writing an `unhealthy` HealthCheck node, check: has this service been unhealthy for **3 consecutive checks** in Neo4j?
  - If yes → call `rollbackService.triggerAutoRollback(serviceId)`
  - `triggerAutoRollback(serviceId)`:
    1. Call `graphService.getLastHealthyDeployment(serviceId)` to find the target
    2. If no healthy deployment exists → log warning, skip rollback
    3. Call GitHub API to re-trigger the target workflow run:
       - Strategy `rerun`: `POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun`
       - Strategy `workflow_dispatch`: `POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches`
    4. Call `graphService.createRollback(rollbackData)` to record the attempt
    5. Emit a notification via `notificationService.sendRollbackAlert()`

  **Tier 2 — Manual Rollback API:**
  - `POST /api/deployments/:id/rollback` — triggers manual rollback to a specific deployment
  - `GET /api/deployments/:id/rollback-preview` — returns: target deployment, services that would be affected (via `DEPENDS_ON` traversal), estimated risk
  - `POST /api/deployments/:id/redeploy` — re-triggers the exact same run (not a rollback to previous)

- [ ] **Notification Service:** Create `backend/src/services/notificationService.ts`

  **Slack:**
  - Use `@slack/webhook` npm package
  - `sendDeploymentAlert(deployment, service)` — triggered on every `conclusion: 'failure'`
  - `sendRollbackAlert(rollback, service, targetDeployment)` — triggered when auto-rollback fires
  - Message format: include service name, branch, conclusion, direct link to GitHub Actions run

  **Email (SMTP):**
  - Use `nodemailer` with SMTP config from env
  - `sendEmailAlert(subject, body, to)` — called alongside Slack for critical failures
  - HTML email template: Sentinel logo header, failure summary table, action buttons (View Logs, Trigger Rollback)

  **Wiring:**
  - Call `notificationService.sendDeploymentAlert()` from `webhookService.ts` when `conclusion === 'failure'`
  - Both Slack and Email are **non-blocking** — failures in notification must NEVER crash the webhook pipeline

- [ ] **New Rollback Routes:** Add to `backend/src/routes/deployment.routes.ts`
  - `GET /api/deployments/:id/rollback-preview`
  - `POST /api/deployments/:id/rollback`
  - `POST /api/deployments/:id/redeploy`

### Acceptance Criteria
- Send a `failure` webhook → Slack message appears in the team channel within 5 seconds
- Send a `failure` webhook → Email is received at `ALERT_EMAIL` within 30 seconds
- 3 consecutive unhealthy health checks → auto rollback is triggered and a `Rollback` node appears in Neo4j
- `GET /api/deployments/:id/rollback-preview` returns the correct target deployment
- Notification failures are caught and logged (no 500s propagated to the webhook response)

---

## 🟣 Varsha — Frontend (RCA Dashboard + Rollback Console)

**Branch:** `feature/v2-frontend-intelligence`

### Responsibilities
You make the intelligence visible. Engineers need to see *why* something broke and act on it — all from the dashboard, without opening GitHub logs manually.

### Tasks

- [ ] **Deployment Detail Page:** Create `frontend/app/deployments/[id]/page.tsx`
  - Fetch `GET /api/deployments/:id/rca` on load
  - Show:
    - **Deployment summary** card: service, branch, commit SHA, status badge, duration
    - **Error Patterns** section: each pattern as a card with type badge, severity color, confidence bar, and the raw log message snippet
    - **Changed Files** list: files from the commit, each with `added` / `modified` / `deleted` label
    - **Commit** card: SHA, author, message, timestamp

- [ ] **Rollback Console Panel** (within the Deployment Detail page)
  - "Preview Rollback" button → calls `GET /api/deployments/:id/rollback-preview` → shows a modal with:
    - Target deployment (SHA, date, last known status)
    - Affected dependent services (from `DEPENDS_ON`)
    - Risk level badge
  - "Confirm Rollback" button → calls `POST /api/deployments/:id/rollback` → shows success/error toast
  - "Redeploy" button → calls `POST /api/deployments/:id/redeploy`

- [ ] **Upgrade Main Dashboard** (`frontend/app/page.tsx`)
  - Service cards now show: health status, last deployment conclusion badge, time since last deploy
  - Clicking a service card navigates to `/services/:id` (service detail — stub is fine)
  - Add a "Recent Failures" section below the service grid: last 5 failed deployments across all services, each linking to the deployment detail page

- [ ] **Log Viewer Panel** (within Deployment Detail page)
  - Fetch `GET /api/deployments/:id/logs` on load
  - Render logs in a scrollable dark terminal-style `<pre>` block
  - Highlight lines matching known error keywords (build_failure, test_failure, etc.) in red/yellow

- [ ] **New API Client methods** in `frontend/services/api.ts`
  - `getDeploymentRCA(id)` → `GET /api/deployments/:id/rca`
  - `getDeploymentLogs(id)` → `GET /api/deployments/:id/logs`
  - `getRollbackPreview(id)` → `GET /api/deployments/:id/rollback-preview`
  - `triggerRollback(id)` → `POST /api/deployments/:id/rollback`
  - `triggerRedeploy(id)` → `POST /api/deployments/:id/redeploy`

- [ ] **Update Frontend Types** in `frontend/types/`
  - Add `ErrorPattern`, `Rollback`, `RCAResult`, `RollbackPreview` interfaces matching backend responses

### Acceptance Criteria
- Clicking a deployment row in the Deployments table navigates to the detail page
- The detail page shows at least 1 error pattern for a known `failure` deployment
- "Preview Rollback" modal opens and shows the correct target deployment
- Log viewer renders the fetched logs and highlights error lines
- No TypeScript `any` in new files — all API responses are properly typed

---

## Shared / Everyone

- [ ] **`docs/v2_test_plan.md`** — Ganesh creates this based on V2 Definition of Done (below)
- [ ] **Update `README.md`** — change V1 status badge to ✅ Complete, V2 to 🔄 In Development
- [ ] **Peer Review** — Every PR must be reviewed by at least one other team member before Ganesh approves into `dev`

---

## V2 Definition of Done

The sprint is complete when **all of the following are true:**

1. A `failure` webhook triggers log fetching, RCA parsing, and `ErrorPattern` nodes appear in Neo4j within 10 seconds
2. A Slack message is sent within 5 seconds of a failure webhook
3. After 3 consecutive unhealthy health checks, a `Rollback` node is created and the GitHub API is called to re-trigger the workflow
4. `GET /api/deployments/:id/rca` returns `{ deployment, errorPatterns, commit, changedFiles }` in a single API call
5. The frontend Deployment Detail page shows error patterns, changed files, and a working rollback console
6. All code is on the `dev` branch, reviewed and approved by Ganesh
7. `docker compose up -d` is the only command needed to run the full stack

---

*Questions? Ask in the group chat. V2 is where Sentinel becomes intelligent — make it count.*
