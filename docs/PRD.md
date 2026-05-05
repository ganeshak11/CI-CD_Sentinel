# CI/CD Sentinel — Product Requirements Document

![Version](https://img.shields.io/badge/version-v1.0--MVP-blue)
![Type](https://img.shields.io/badge/type-DevOps%20Control%20Plane-green)
![Status](https://img.shields.io/badge/status-In%20Planning-yellow)

---

## 1. Product Overview

**CI/CD Sentinel** is a centralized observability and recovery layer for the software deployment lifecycle.

It integrates with CI/CD pipelines (initially GitHub Actions) to track deployments, manage environment configurations, view logs, monitor health status, and perform rollback or redeployment — all from a single interface.

The system reduces operational complexity and improves deployment reliability by enabling engineers to manage post-deployment workflows without switching between multiple tools.

### Positioning

> **Deployment-centric root cause analysis for small teams**  
> When your deployment breaks at 3am, you don't want 50 dashboards.  
> You want: What changed? Why did it break? How do I fix it?  
> Sentinel answers those 3 questions in 30 seconds.

**Not competing with:**
- Datadog/New Relic → Full observability platforms (metrics, traces, logs)
- ArgoCD → Kubernetes GitOps heavy artillery
- Spinnaker → Enterprise deployment orchestration

**Solving:**
- "What broke?" panic after deployment
- Manual correlation between code changes and health degradation
- Hours of log analysis to find root cause
- Risky rollbacks without impact preview

**Key Differentiation:**

| Feature | Traditional Observability | CI/CD Sentinel |
|---|---|---|
| **Focus** | Monitor everything | Deployment-centric |
| **Root Cause** | Generic dashboards | Deployment comparison + error patterns |
| **Recovery** | Manual investigation | One-click rollback with impact preview |
| **Env Drift** | Not tracked | GitHub Secrets ↔ Runtime comparison |
| **Failure Analysis** | Logs + metrics | Git diff + error correlation |

**Mental Model:**
> Sentinel = deployment black box recorder with automated root cause analysis  
> Answers "what changed, why it broke, how to fix" in under 60 seconds.

---

## 2. Problem Statement

Modern CI/CD pipelines automate build and deployment but lack unified post-deployment control. After deployment, engineers must manually:

- Track deployed versions
- Access logs across multiple platforms
- Manage environment variables
- Perform rollbacks
- Verify service health
- Identify root cause of failures

This leads to:

| Pain Point | Impact |
|---|---|
| Scattered operational visibility | Slow incident response |
| Risky manual rollbacks | Potential data loss or downtime |
| Configuration inconsistencies | Environment drift |
| Inefficient debugging workflows | High MTTR |

> There is a need for a unified control interface that centralizes deployment observability and control operations.

---

## 3. Goals & Objectives

### Primary Goals
- Provide centralized visibility of the deployment lifecycle
- Enable safe rollback and redeployment
- Store deployment history and metadata
- Allow controlled environment configuration management
- Aggregate logs for easier debugging
- Provide deployment health status monitoring

### Secondary Goals
- Reduce debugging time
- Improve reliability awareness
- Simplify DevOps workflows for small teams

---

## 4. Target Users

### Primary Users
- DevOps learners
- Backend developers
- Small engineering teams
- Student developers deploying projects

### User Characteristics
- Use GitHub for version control
- Deploy apps using Docker or cloud platforms
- Require visibility into deployments
- Need simple rollback capability

---

## 5. User Stories

| # | Role | Goal | Benefit |
|---|---|---|---|
| US-01 | Developer | View all deployment versions | Know which version is running per environment |
| US-02 | Developer | Rollback to a previous version | Quickly recover from failed deployments |
| US-03 | Developer | Redeploy the latest build | Restart services after fixes |
| US-04 | Developer | View logs in one place | Faster debugging |
| US-05 | Developer | View and update environment variables safely | Prevent config changes from breaking production |
| US-06 | Developer | Check application health | Confirm deployment is functioning correctly |

---

## 6. Functional Requirements

### 6.1 CI/CD Integration

The system must:
- Connect with a GitHub repository
- Receive webhook events from GitHub Actions
- Store pipeline execution metadata
- Handle webhook idempotency (prevent duplicate records)
- Fetch git diff for each deployment via GitHub API

**Captured data:**
- Repository name
- Commit hash (SHA)
- Build status
- Artifact version
- Deployment timestamp
- Workflow run ID (for idempotency)
- Delivery ID (GitHub webhook identifier)
- Git diff (files changed, additions, deletions)

**Idempotency Strategy:**

GitHub retries failed webhooks. Without idempotency:
- 1 deployment event → 5 duplicate records → dashboard lies

**Solution:**
```sql
webhook_events (
  id,
  workflow_run_id UNIQUE,  -- prevents duplicates
  delivery_id,
  commit_sha,
  status,
  received_at
)
```

If duplicate webhook arrives → ignore (return 200 OK, don't process).

---

### 6.2 Deployment Tracking

The system must store and display:

| Field | Description |
|---|---|
| `service_name` | Name of the deployed service |
| `version` | Version number |
| `commit_ref` | Commit reference (SHA) |
| `environment` | Target environment (dev/staging/prod) |
| `status` | Deployment status |
| `timestamp` | Time of deployment |

The system must also display a deployment timeline view.

---

### 6.3 Rollback Mechanism

The system must:
- Maintain full version history
- Allow user to select a previous version
- Trigger redeployment of the selected version
- Store rollback event metadata

---

### 6.4 Redeploy Function

The system must support:
- Manual redeploy of the latest version via GitHub workflow dispatch
- Redeploy triggered via UI button
- Redeploy triggered via API call

**Implementation:**

Sentinel calls GitHub API to re-run the workflow:

```
POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches
```

**Captured:**
- Redeploy timestamp
- Triggered by (user)
- Target version/commit

> **Scope:** Trigger GitHub workflow only. Not storing artifacts or calling hosting providers directly.

---

### 6.5 Logs Viewer

The system must:
- Display **last 500 logs per deployment** (MVP scope)
- Filter logs by: `timestamp`, `service`, `environment`, `log level`
- Show logs from GitHub Actions workflow runs

**Log types:**
- Build logs (from GitHub Actions)
- Deployment logs
- Error logs

**Storage strategy:**
```sql
-- Store limited logs per deployment
LIMIT 500 per deployment_id
Retention: 7 days
```

**Log ingestion:**
- Fetch from GitHub Actions API after workflow completion
- Store in PostgreSQL (not building log aggregation pipeline)

> **Scope:** Simple log viewer, not Elasticsearch. Avoid building full log aggregation platform.

---

### 6.6 Environment Variable Management

**MVP Scope: READ-ONLY viewer**

The system must allow:
- **Viewing** environment variables per environment
- Masking sensitive values in the UI
- Showing last updated timestamp

**Out of MVP scope:**
- ❌ Editing environment variables (scope creep risk)
- ❌ Secret rotation
- ❌ Audit trail for changes
- ❌ Sync with cloud providers

**Why read-only?**

Editing secrets opens political/security questions:
- Who can edit what?
- Audit compliance requirements
- Secret rotation policies
- Drift sync with AWS Parameter Store / Vault

This quickly becomes competing with Doppler, Infisical, Vault.

**Security Approach:**

Sentinel acts as a **reference viewer**, not a secret store.

```
env value (from GitHub Secrets)
   ↓
fetch via GitHub API (read-only)
   ↓
display masked in UI as ***
```

**Security Rules:**
- Never store decrypted secrets in database
- Never log secrets
- Never send secrets to frontend
- Secrets are masked in UI as `***`

**Example:**
```
ENVIRONMENT: production
DATABASE_URL=***
API_KEY=***
REDIS_HOST=redis.internal

Last synced: 2 hours ago
```

> **Note:** This is a viewer for small teams, not a Vault replacement. Edit secrets in GitHub directly.

---

### 6.7 Health Monitoring

The system must:
- Check service health endpoints via polling (`GET /health`)
- Record health status and response time over time
- Display health indicator and trends on the dashboard
- Run background worker every 60 seconds

**Health states:**

| State | Indicator | Condition |
|---|---|---|
| Healthy | 🟢 | Endpoint returns 200, response < 500ms |
| Degraded | 🟡 | Slow response (500ms - 2s) |
| Down | 🔴 | Timeout or error |

**Data captured:**
- Response time (ms)
- Status code
- Timestamp
- Deployment correlation (show impact of deployments on health)

**Example insight:**
> "Deployment at 3pm caused response time to spike from 50ms to 300ms"

> **Note:** This is endpoint polling for MVP, not Prometheus-level observability.

---

### 6.8 Dashboard

The dashboard must display:
- Active deployments
- Recent deployment history
- Health status per service
- Recent logs
- Rollback controls
- **Deployment comparison view** (working vs broken)
- **Error pattern analysis**
- **Environment drift indicators**

---

### 6.9 Deployment Comparison (Root Cause Analysis)

**When deployment fails or health degrades, show:**

```
Deployment #47 - FAILED
├─ Commit: abc123 "feat: add new API endpoint"
├─ Deployed: 3:15pm
├─ Health Status: 🔴 Down (3:16pm)
├─ Error Pattern Detected:
│  └─ "Connection refused on port 5432" (15 occurrences)
├─ Likely Cause: Database connection issue
├─ Code Changes (vs Deployment #46):
│  └─ Modified: src/config/database.ts
│     - Old: DATABASE_URL=postgres://localhost:5432
│     + New: DATABASE_URL=postgres://prod-db:5432
└─ Suggested Action: Check DATABASE_URL env variable
```

**Comparison features:**
- Side-by-side git diff (working vs broken deployment)
- Health metric deltas (response time, error rate, status)
- Environment variable differences
- Error log pattern analysis
- Files changed with line-by-line diff

**Implementation:**
```
GET /deployments/:id/compare/:previousId

Returns:
{
  "current": { deployment details },
  "previous": { deployment details },
  "gitDiff": { files, additions, deletions },
  "healthDelta": { responseTime, errorRate, status },
  "errorPatterns": [ { pattern, count, severity } ],
  "envDiff": [ { key, oldValue, newValue } ]
}
```

---

### 6.10 Error Pattern Detection

The system must:
- Parse deployment logs for common failure patterns
- Identify error frequency and severity
- Correlate errors with code changes

**Detected patterns:**
- Database connection errors (`ECONNREFUSED`, `Connection refused`)
- API timeouts (`ETIMEDOUT`, `Request timeout`)
- Missing environment variables (`undefined is not defined`)
- Port conflicts (`EADDRINUSE`)
- Authentication failures (`401`, `403`, `Invalid credentials`)
- Memory issues (`JavaScript heap out of memory`)

**Output:**
```
Error Analysis for Deployment #47:

🔴 Critical (15 occurrences):
  "Connection refused on port 5432"
  First seen: 3:16pm (1 minute after deployment)
  Related file: src/config/database.ts

🟡 Warning (3 occurrences):
  "Slow query detected (2.5s)"
  First seen: 3:18pm
```

---

### 6.11 Environment Drift Detection

The system must:
- Compare GitHub Secrets with running container environment
- Highlight configuration drift
- Suggest sync actions

**Display:**
```
Environment Variables (Production)

DATABASE_URL: ***
Last synced: 2 hours ago
Status: ⚠️ DRIFT DETECTED

GitHub Secrets:     postgres://prod-db:5432
Running Container:  postgres://localhost:5432

[Trigger Redeploy to Sync] button
```

**Implementation:**
- Fetch GitHub Secrets via API (masked)
- Compare with last deployment snapshot
- Show drift indicator if mismatch detected

---

## 7. Non-Functional Requirements

### Performance
- Dashboard loads in under **3 seconds**
- API response under **500ms** (average)
- Health check worker completes cycle in under **10 seconds**
- Log queries return in under **1 second** (limited to 500 entries)

### Reliability
- Deployment data stored reliably with no data loss
- Webhook idempotency prevents duplicate records (`workflow_run_id UNIQUE`)
- Redeploy history preserved

### Security
- Secrets never stored in Sentinel database
- Secrets fetched read-only from GitHub API
- Sensitive values masked in UI as `***`
- Never log secrets
- Basic authentication for dashboard access
- GitHub API token stored in `.env`

### Scalability
The system must support:
- Multiple repositories (up to 10 for MVP)
- Multiple environments (dev, staging, prod)
- Multiple deployments per day (up to 50)
- Time-series health data without performance degradation
- Log retention: 7 days, 500 entries per deployment

---

## 8. System Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Dashboard UI                      │
│              (Next.js / React)                      │
└────────────────────┬────────────────────────────────┘
                     │ HTTP / REST
┌────────────────────▼────────────────────────────────┐
│                  Backend API                        │
│           (Node.js + Express + TypeScript)          │
│                                                     │
│  - Deployment metadata    - Rollback logic          │
│  - Webhook processing     - Health checks           │
│  - Env config storage                               │
└──────────┬──────────────────────────┬───────────────┘
           │                          │
┌──────────▼──────────┐   ┌───────────▼───────────────┐
│     PostgreSQL      │   │   GitHub Actions (Webhook) │
│                     │   │                            │
│  - deployments      │   │  - build completion events │
│  - services         │   │  - deployment events       │
│  - logs             │   └───────────────────────────┘
│  - env_variables    │
│  - health_status    │
└─────────────────────┘
```

### Tech Stack

| Layer | Technology |
|---|---|
| Backend API | Node.js + Express + TypeScript |
| Database | PostgreSQL |
| Frontend | Next.js or React |
| CI/CD Integration | GitHub Actions (Webhooks) |

---

## 9. Data Model

```sql
-- Services
services (
  id,
  name,
  repository_url,
  created_at
)

-- Deployments
deployments (
  id,
  service_id,
  version,
  commit_hash,
  environment,
  status,
  deployed_by,
  timestamp,
  git_diff_summary  -- files changed, additions, deletions
)

-- Webhook Events (idempotency)
webhook_events (
  id,
  workflow_run_id UNIQUE,  -- prevents duplicate processing
  delivery_id,
  commit_sha,
  repository_name,
  workflow_name,
  status,
  received_at
)

-- Logs (limited storage)
logs (
  id,
  deployment_id,  -- tied to specific deployment
  service_id,
  environment,
  log_level,
  message,
  timestamp
  -- LIMIT 500 per deployment_id
  -- Retention: 7 days
)

-- Health Checks (time-series friendly)
health_checks (
  id,
  service_id,
  environment,
  status,
  response_time_ms,  -- track performance trends
  status_code,
  checked_at
)

-- Redeploy Events
redeploy_events (
  id,
  deployment_id,
  triggered_by,
  target_commit_sha,
  workflow_run_id,
  timestamp
)

-- Error Patterns (new)
error_patterns (
  id,
  deployment_id,
  pattern_type,  -- connection_error, timeout, auth_failure, etc.
  pattern_text,  -- actual error message
  occurrence_count,
  first_seen,
  severity,  -- critical, warning, info
  related_file  -- file from git diff that might be related
)

-- Deployment Comparisons (new)
deployment_comparisons (
  id,
  current_deployment_id,
  previous_deployment_id,
  git_diff_json,  -- full git diff data
  health_delta_json,  -- health metric changes
  env_diff_json,  -- environment variable differences
  created_at
)
```

**Note:** `environment_variables` table removed from MVP. Use read-only GitHub API fetch instead.

---

## 10. MVP Scope

### Core Philosophy

> **Deployment-centric root cause analysis for small teams**

When your deployment breaks at 3am:
- You don't want 50 dashboards
- You want: What changed? Why did it break? How do I fix it?
- Sentinel answers those 3 questions in 30 seconds

---

### Three-Stage Build Approach

#### Stage 1: Core MVP (Must Have)

**The foundation:**

1. **Webhook ingestion** with idempotency (`workflow_run_id UNIQUE`)
2. **Deployment history** tracking (who, what, when, status)
3. **Health monitoring** with response time trends (60s polling)
4. **Simple dashboard** (latest deployment, success rate, health status)
5. **Redeploy trigger** (GitHub workflow dispatch API)

**Scope boundary:**
- Webhook → Database → Dashboard
- Health worker → Database → Dashboard
- UI button → GitHub API → Redeploy

**Goal:** Deployment memory + recovery switch working end-to-end.

---

#### Stage 2: Root Cause Analysis (High Value)

**The differentiation:**

6. **Deployment comparison view** (working vs broken)
   - Side-by-side git diff
   - Health metric deltas (response time, error rate)
   - Files changed with line-by-line comparison

7. **Error pattern detection**
   - Parse logs for common failures (connection errors, timeouts, auth failures)
   - Show error frequency and first occurrence time
   - Correlate errors with code changes

8. **Git diff integration**
   - Fetch diff via GitHub API for each deployment
   - Show which files changed between working and broken deployments
   - Highlight likely culprit files based on error patterns

**Goal:** Answer "what broke?" in under 60 seconds.

---

#### Stage 3: Advanced Features (If Time Permits)

**The polish:**

9. **Environment drift detection**
   - Compare GitHub Secrets with running container env vars
   - Show drift indicators
   - Suggest redeploy to sync

10. **Deployment risk assessment**
    - Analyze commit size, files changed
    - Check historical failure patterns
    - Predict deployment risk (low/medium/high)

11. **Rollback impact preview**
    - Show what will change before rollback
    - Expected health status based on historical data
    - Estimated recovery time

**Goal:** Proactive deployment intelligence.

---

### Self-Hosting Demonstration

**Meta-deployment:**
- Frontend deployed on Vercel
- Backend deployed on Render
- Sentinel tracks its own deployments
- Live demonstration of all features in production

**Benefits:**
- Proves the system works in real production environment
- Shows actual deployment history, health monitoring, recovery
- Allows testing redeploy functionality on live system
- Demonstrates environment drift detection with real config

---

### ❌ Out of Scope (All Stages)

**Avoid these scope creep traps:**

- ❌ Editable secrets manager (becomes Vault competitor)
- ❌ Full log aggregation pipeline (becomes Elasticsearch)
- ❌ Artifact storage (becomes Docker registry)
- ❌ Role-based access control (becomes auth platform)
- ❌ Multi-cloud deployment tracking
- ❌ Kubernetes integration
- ❌ Real-time log streaming
- ❌ Complex analytics dashboard
- ❌ Slack alerts (nice to have, but not core)

---

### Scope Discipline

> **Ambition kills more projects than difficulty.**

Three features that sound simple but explode:

1. **Secrets manager** → audit logs, rotation, compliance, sync
2. **Log aggregation** → ingestion pipeline, indexing, retention, search
3. **Deployment orchestration** → artifact storage, provider APIs, rollback strategies

For all stages: avoid these traps.

**Keep the core tight:**
- Stage 1: Webhook ingestion + deployment history + health monitoring + dashboard + redeploy
- Stage 2: Deployment comparison + error patterns + git diff
- Stage 3: Env drift + risk assessment + rollback preview

Everything else is negotiable.

---

## 11. Build Order (Critical)

**Do NOT start with GitHub Actions integration.**  
Webhook integration depends on backend existing.

---

### Stage 1: Core MVP

#### Phase 1 — Backend Foundation

Create API skeleton.

**Endpoints:**
```
POST /webhooks/github          # receive GitHub webhooks
GET  /services                 # list tracked services
GET  /deployments              # deployment history
GET  /deployments/:id/logs     # last 500 logs for deployment
GET  /health-status            # current health status
POST /deployments/:id/redeploy # trigger GitHub workflow dispatch
```

**DB Tables:**
```
services
deployments
webhook_events (with workflow_run_id UNIQUE)
health_checks
logs (limited to 500 per deployment)
redeploy_events
```

**Goal:** Store pipeline events reliably with idempotency.

---

#### Phase 2 — GitHub Webhook Integration

GitHub → Settings → Webhooks → send events to:
```
POST /webhooks/github
```

**Capture:**
- Repo name
- Commit SHA
- Workflow name
- Status (success/failure)
- Timestamp

Now Sentinel starts seeing real activity.

---

#### Phase 3 — Dashboard (Basic)

**Show:**
- Latest deployment per service
- Success rate (last 10 deployments)
- Last failure with commit link
- Health status with response time trend
- Redeploy button (triggers GitHub workflow dispatch)
- Last 500 logs for selected deployment

**Design principle:** Keep UI boring and readable. DevOps tools are not Instagram.

---

#### Phase 4 — Health Monitor Worker

Background job (every 60s):
```
check service endpoints
store response time
update status
```

Now system shows: **deploy → health impact**

**Stage 1 Complete:** Deployment memory + recovery switch working.

---

### Stage 2: Root Cause Analysis

#### Phase 5 — Git Diff Integration

**Add to webhook processing:**
- Fetch git diff via GitHub API when deployment received
- Store diff summary (files changed, additions, deletions)
- Store full diff for comparison view

**New endpoint:**
```
GET /deployments/:id/diff
```

---

#### Phase 6 — Deployment Comparison Engine

**New endpoint:**
```
GET /deployments/:id/compare/:previousId
```

**Returns:**
- Git diff (side-by-side file changes)
- Health metric deltas
- Environment variable differences
- Error pattern correlation

**Dashboard update:**
- Add "Compare with previous" button
- Show side-by-side comparison view
- Highlight likely culprit files

---

#### Phase 7 — Error Pattern Detection

**Add log parsing:**
- Scan deployment logs for common error patterns
- Store in `error_patterns` table
- Correlate with code changes

**Detected patterns:**
- Connection errors (ECONNREFUSED)
- Timeouts (ETIMEDOUT)
- Auth failures (401, 403)
- Missing env vars (undefined)
- Port conflicts (EADDRINUSE)

**Dashboard update:**
- Show error analysis panel
- Display error frequency and first occurrence
- Link errors to related files from git diff

**Stage 2 Complete:** Root cause analysis in under 60 seconds.

---

### Stage 3: Advanced Features

#### Phase 8 — Environment Drift Detection

**New endpoint:**
```
GET /services/:id/env-drift
```

**Implementation:**
- Fetch GitHub Secrets via API
- Compare with last deployment snapshot
- Show drift indicators

**Dashboard update:**
- Add env drift panel
- Show GitHub vs Runtime comparison
- "Trigger Redeploy to Sync" button

---

#### Phase 9 — Deployment Risk Assessment

**Add risk analysis:**
- Analyze commit size (large changes = higher risk)
- Check files changed (database schema = higher risk)
- Historical failure patterns (Friday deployments = higher risk)
- Similar commit patterns to previous failures

**Dashboard update:**
- Show risk indicator before deployment
- Display risk factors
- Suggest staging deployment first

---

#### Phase 10 — Rollback Impact Preview

**New endpoint:**
```
GET /deployments/:id/rollback-preview
```

**Returns:**
- Target commit details
- Expected health status (based on historical data)
- Environment variable snapshot
- Estimated recovery time

**Dashboard update:**
- Show preview before rollback
- "Confirm Rollback" with impact summary

**Stage 3 Complete:** Proactive deployment intelligence.

---

### Self-Hosting Setup

**Deploy Sentinel itself:**

1. **Frontend:** Deploy to Vercel
   - Connect GitHub repo
   - Auto-deploy on push to main
   - Environment variables from Vercel dashboard

2. **Backend:** Deploy to Render
   - Connect GitHub repo
   - Auto-deploy on push to main
   - PostgreSQL database on Render
   - Environment variables from Render dashboard

3. **Configure Sentinel to track itself:**
   - Add Sentinel's own repo as tracked service
   - Set up webhook from Sentinel's GitHub Actions to Sentinel's backend
   - Configure health endpoint to poll Sentinel's own API

**Result:** Sentinel tracking its own deployments (meta-demonstration).

---

## 12. Future Enhancements (Post-Stage 3)

| Feature | Priority |
|---|---|
| Multi-environment comparison view | High |
| Slack / webhook alerts on deployment failure | High |
| Role-based access control | Medium |
| Deployment analytics (success rate trends, MTTR) | Medium |
| Anomaly detection (ML-based health prediction) | Low |
| Kubernetes integration | Low |
| Multi-cloud deployment tracking | Low |

---

## 13. Success Criteria

The project is considered successful when:

### Stage 1 Success:
- [ ] Deployment history is visible in the dashboard
- [ ] Webhook ingestion works with idempotency (no duplicate records)
- [ ] Redeploy button triggers GitHub workflow dispatch successfully
- [ ] Health status is correctly displayed with response time trends
- [ ] Health monitoring shows correlation with deployments ("deploy → health impact")
- [ ] System demonstrates: **deployment memory + recovery switch**

### Stage 2 Success:
- [ ] Deployment comparison view shows git diff between working and broken deployments
- [ ] Error pattern detection identifies common failures in logs
- [ ] Root cause analysis completes in under 60 seconds
- [ ] Dashboard shows "what changed, why it broke, how to fix" for failed deployments

### Stage 3 Success:
- [ ] Environment drift detection shows GitHub Secrets vs Runtime differences
- [ ] Deployment risk assessment predicts failure probability
- [ ] Rollback impact preview shows expected outcome before execution
- [ ] Self-hosted on Vercel + Render, tracking its own deployments

**Not required for success:**
- ❌ Editable secrets (read-only is enough)
- ❌ Full log aggregation (500 entries is enough)
- ❌ Complex analytics (basic history + comparison is enough)
- ❌ Real-time log streaming (batch fetch is enough)

---

## 14. Summary

> **CI/CD Sentinel** is a deployment-centric root cause analysis system for small teams.

When your deployment breaks at 3am, you don't want 50 dashboards.

You want answers:
- **What changed?** → Git diff between working and broken deployments
- **Why did it break?** → Error pattern detection + code correlation
- **How do I fix it?** → One-click rollback with impact preview

Sentinel answers those 3 questions in 30 seconds.

Not a CI/CD platform. Not an observability platform. Not a secrets manager.

Just: **deployment memory + automated root cause analysis + recovery control**.
