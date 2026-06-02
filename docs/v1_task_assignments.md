# V1 Task Assignments — "See Everything"

> **Sprint Goal:** By the end of V1, Sentinel can ingest a real GitHub Actions webhook, store the deployment in Neo4j, poll health endpoints, and display everything on a live dashboard.

**Start Date:** 01/06/2026
**Sprint Duration:** ~2 Weeks (until V1 is stable on `dev`)
**Integration Lead (Review all PRs into `dev`):** Ganesh

---

## Ground Rules

- **Never push directly to `main` or `dev`.** Always work on a `feature/` branch.
- Use `./push.sh` (Linux/macOS) or `.\push.ps1` (Windows) to push your branch.
- Open a **Draft PR** into `dev` as soon as you create your branch.
- If you're stuck for more than **30 minutes**, ask in the group chat. Don't suffer silently.
- **Docker Compose must be running** on your machine before you write a single line of code. Run `docker compose up -d` and verify Neo4j is up at `http://localhost:7474`.

---

## 🔵 Ganesh — DevOps / Integration Lead

**Branch:** `feature/infra-foundation`

### Responsibilities
You own the foundation that everyone else builds on top of. Your work should be merged first.

### Tasks

- [x] **Neo4j Schema:** Finalize `backend/src/db/schema.cypher`
  - Constraints: `UNIQUE` on `Service.id`, `Deployment.workflow_run_id`, `Commit.sha`
  - Indexes: `Deployment.status`, `Deployment.created_at`, `HealthCheck.timestamp`
  - Document each constraint with a comment explaining *why* it exists

- [ ] **Graph Service:** Build `backend/src/services/graphService.ts`
  - `createService(name, repoUrl, healthEndpoint, environment, dependencies, pathFilter?)` — creates a `:Service` node. `pathFilter` is an optional glob pattern for monorepo support (e.g., `services/payment/**`). If empty, service matches all webhooks from the repo.
  - `findServicesByRepo(repoFullName)` — returns **all** services registered to a repo URL (returns an array — may be 1 for microservice repos or N for monorepos). Returns empty array if repo is not tracked.
  - `createDeployment(data)` — creates a `:Deployment` node with `[:DEPLOYED_TO]` relationship
  - `createCommit(data)` — creates a `:Commit` node with `[:BASED_ON]` relationship
  - `getServiceById(id)` — returns service + latest deployment status
  - `getAllServices()` — returns all services with their current health
  - `bulkCreateServices(yamlConfig)` — parses `sentinel-services.yml` and creates all `Service` nodes + `DEPENDS_ON` relationships in a single transaction

- [ ] **Bulk Import CLI:** Create `sentinel import --file <path>` command
  - Parses `sentinel-services.yml` (name, repo, health_url, environment, dependencies per service)
  - Calls `graphService.bulkCreateServices()` to register all in one Neo4j transaction
  - Reports: services created, dependencies linked, errors encountered

- [x] **Neo4j Driver:** Verify `backend/src/db/index.ts` driver singleton is stable (connection retries, graceful shutdown)

- [x] **Environment Config:** Confirm `backend/.env.example` has every variable needed for V1, update if needed

- [ ] **Integration Reviews:** Review all PRs from Chinmay, Varsha, and Abdul before merging to `dev`

### Pre-requisites also completed ✅
- [x] **CI Pipeline** (`ci.yml`) — runs on every PR to `dev` and `main`
- [x] **Dockerfile** — backend `Dockerfile` exists
- [x] **`docker-compose.yml`** — local stack (Neo4j, Redis, Backend, Frontend)
- [x] **Issue & PR Templates** — `.github/ISSUE_TEMPLATE` and `PULL_REQUEST_TEMPLATE.md`
- [x] **Linting & Formatting** — ESLint + Prettier configured
- [x] **Push Scripts** — `push.sh` and `push.ps1` for branch enforcement

### Acceptance Criteria
- `docker compose up -d` starts Neo4j, Redis, Backend, and Frontend cleanly
- All Neo4j constraints and indexes are created on first boot via `schema.cypher`
- `graphService.ts` functions are unit-tested with mock Neo4j driver

---

## 🟢 Chinmay — Backend (Webhook & Deployment Ingestion)

**Branch:** `feature/v1-webhook-ingest`

### Responsibilities
You are the entry point for all data into Sentinel. Every deployment the team will ever see starts with your webhook processor.

### Tasks

- [ ] **Webhook Route:** Create `backend/src/routes/webhookRoutes.ts`
  - `POST /webhooks/github` — entry point for GitHub Actions events
  - Validate the HMAC-SHA256 signature using `GITHUB_WEBHOOK_SECRET` (reject invalid requests with 401)

- [ ] **Webhook Service:** Create `backend/src/services/webhookService.ts`
  - Handle the `workflow_run` event from GitHub Actions
  - Extract: `workflow_run_id`, `repo`, `commit_sha`, `branch`, `status` (`in_progress`, `completed`), `conclusion` (`success`, `failure`, `cancelled`)
  - Call `graphService.findServicesByRepo()` — if returns empty array, skip processing (unregistered repo)
  - **Microservice path:** If 1 service returned → create deployment for that service
  - **Monorepo path:** If N services returned → fetch changed files via GitHub API (`GET /repos/{owner}/{repo}/commits/{sha}`), match each service's `path_filter` against changed file paths, create `Deployment` nodes only for services whose paths were touched
  - Call `graphService.createDeployment()` per matched service (idempotent — use `MERGE` not `CREATE`)
  - Call `graphService.createCommit()` to link the commit

- [ ] **Controller:** Create `backend/src/controllers/webhookController.ts`
  - Parse the raw body (needed for HMAC validation — `express.raw()` before `express.json()`)
  - Route to the correct handler based on `X-GitHub-Event` header

- [ ] **Register in App:** Wire the webhook route into `backend/src/app.ts`

### Acceptance Criteria
- Send a simulated `workflow_run` payload using `curl` or Postman — it must be saved to Neo4j
- A duplicate payload (same `workflow_run_id`) must NOT create a duplicate node (idempotency)
- An invalid HMAC signature must return `401 Unauthorized`
- A webhook from an **unregistered repo** must return `200 OK` and create NO nodes (Sentinel skips repos not in the Service Registry)
- Check the Neo4j browser at `http://localhost:7474` and see your `Deployment` and `Commit` nodes

---

## 🟠 Abdul — Backend (Health Worker & Redis)

**Branch:** `feature/v1-health-worker`

### Responsibilities
You determine whether a deployed service is actually alive. Your worker is the heartbeat of Sentinel.

### Tasks

- [ ] **Health Worker:** Create `backend/src/services/healthWorker.ts`
  - Use `node-cron` to poll every **60 seconds**
  - For each `:Service` node (fetched from Neo4j via `graphService.getAllServices()`):
    - HTTP GET the service's `healthEndpoint` with a 5-second timeout
    - If status `200–299` → create a `:HealthCheck { status: 'healthy' }` node
    - If timeout or non-2xx → create a `:HealthCheck { status: 'unhealthy', error: '...' }` node
    - Link with `[:HAS_HEALTH]` relationship from the latest `Deployment` node

- [ ] **Redis Caching:** Cache the latest health status per service in Redis
  - Key: `health:serviceId`, Value: `{ status, timestamp }`
  - TTL: 90 seconds (so stale data auto-expires if the worker stops)

- [ ] **Health API Route:** Create `GET /api/health-status` endpoint
  - Returns all services with their latest health (read from Redis first, Neo4j as fallback)
  - Returns `GET /api/health-status/:serviceId` for per-service history (last 10 checks from Neo4j)

- [ ] **Start Worker:** Start the cron job in `backend/src/app.ts` on server boot

### Acceptance Criteria
- Worker starts automatically when the backend boots
- With `docker compose up`, point a health endpoint at `http://localhost:3001/ping` (add this route too) and confirm `:HealthCheck` nodes appear in Neo4j every 60 seconds
- Redis stores the latest status — confirm with `docker exec -it redis redis-cli GET health:<serviceId>`
- If a service health endpoint is unreachable, it gracefully logs the error and creates an `unhealthy` node (does NOT crash the worker)

---

## 🟣 Varsha — Frontend (Dashboard Shell)

**Branch:** `feature/v1-frontend-shell`

### Responsibilities
You own everything the user sees. By end of V1, the team should be able to open a browser and watch live deployments roll in.

### Tasks

- [ ] **Next.js Project Setup:** Confirm the Next.js 14 (App Router) project in `frontend/` runs cleanly
  - `npm install` → `npm run dev` → visible at `http://localhost:3000`
  - Configure `frontend/.env.local` with `NEXT_PUBLIC_API_URL=http://localhost:3001`

- [ ] **API Client:** Create `frontend/services/api.ts`
  - `getServices()` → `GET /api/services`
  - `getDeployments(serviceId?)` → `GET /api/deployments`
  - `getHealthStatus()` → `GET /api/health-status`

- [ ] **Main Dashboard Page** (`frontend/app/page.tsx`)
  - Services cards showing: name, repo URL, current health status (🟢 / 🔴), last deployment time
  - Auto-refresh every 30 seconds (use `setInterval` or React Query's `refetchInterval`)

- [ ] **Deployments List Page** (`frontend/app/deployments/page.tsx`)
  - Table with columns: Deployment ID, Branch, Commit SHA, Status, Started At, Duration
  - Status badge: 🟡 In Progress, 🟢 Success, 🔴 Failure, ⚫ Cancelled
  - Click a row → navigate to `/deployments/:id` (detail page, can be a stub for V1)

- [ ] **Basic Navigation:** Sidebar or top nav with links to: Dashboard, Deployments, Services

- [ ] **Service Registration Page** (`frontend/app/services/new/page.tsx`)
  - Form fields: Service Name, Repository URL, Path Filter (optional glob for monorepos, e.g., `services/payment/**`), Health Endpoint URL, Environment (dropdown), Dependencies (multi-select of existing services), Rollback Strategy (radio: rerun / workflow_dispatch)
  - On submit → `POST /api/services`
  - After success → redirect to "Setup Webhook" page showing the exact webhook URL and secret to copy into GitHub

- [ ] **Loading & Error States:** Every data-fetching component must handle loading spinners and error messages (don't show blank screens)

### Acceptance Criteria
- Dashboard is visible at `http://localhost:3000` with no console errors
- Services and their health statuses are fetched from the real backend API (not mock data)
- When Chinmay sends a webhook, a new entry appears in the Deployments table on next refresh
- The UI is responsive and doesn't break on a standard laptop screen

---

## Shared / Everyone

- [ ] **Git Setup:** Clone the repo, checkout `dev`, verify `docker compose up -d` works on your machine — **do this before Monday**
- [ ] **Research Report:** Submit a 3–4 page written summary of your holiday research (CI/CD concepts, pipelines, why they fail) — share in the group chat before Monday's kickoff

---

## V1 Definition of Done

The sprint is complete when **all of the following are true:**

1. A real GitHub Actions `workflow_run` webhook is received and a `Deployment` node exists in Neo4j
2. Health checks are running every 60 seconds and `HealthCheck` nodes are being created
3. The dashboard at `http://localhost:3000` shows live services and deployment history
4. All code is on the `dev` branch, reviewed and approved by Ganesh
5. `docker compose up -d` is the only command needed to run the full stack

---

*Questions? Ask in the group chat.*
