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

> **CI/CD observability + recovery layer for small teams**  
> Simple enough to run locally, powerful enough to demonstrate real engineering thinking.

**Not competing with:**
- ArgoCD → Kubernetes heavy artillery
- Spinnaker → Enterprise complexity monster
- Jenkins → Legacy enterprise tooling

**Solving:**
- "What broke?" panic after deployment
- Fragmented visibility across GitHub Deployments
- Post-deployment chaos for small teams and solo developers

**Mental Model:**
> Sentinel = black box recorder for CI/CD  
> System memory for deployments when developers forget what happened 2 days ago.

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

**Captured data:**
- Repository name
- Commit hash (SHA)
- Build status
- Artifact version
- Deployment timestamp
- Workflow run ID (for idempotency)
- Delivery ID (GitHub webhook identifier)

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
  timestamp
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
```

**Note:** `environment_variables` table removed from MVP. Use read-only GitHub API fetch instead.

---

## 10. MVP Scope

### Core Philosophy

> **Deployment memory + recovery switch for small teams**

Not CI/CD platform. Not observability platform. Not secrets manager.

Just: **memory + control**.

---

### ✅ Must Have (Core MVP)

**The non-negotiables:**

1. **Webhook ingestion** with idempotency (`workflow_run_id UNIQUE`)
2. **Deployment history** tracking (who, what, when, status)
3. **Health monitoring** with response time trends (60s polling)
4. **Simple dashboard** (latest deployment, success rate, health status)
5. **Redeploy trigger** (GitHub workflow dispatch API)

**Scope boundary:**
- Webhook → Database → Dashboard
- Health worker → Database → Dashboard
- UI button → GitHub API → Redeploy

That's it.

---

### 🎯 Nice to Have (If Time Permits)

- Rollback trigger (GitHub workflow dispatch to previous commit)
- **Read-only** environment variable viewer
- Last 500 logs per deployment viewer
- Basic authentication for dashboard

---

### ❌ Out of Scope (MVP)

**Avoid these scope creep traps:**

- ❌ Editable secrets manager (becomes Vault competitor)
- ❌ Full log aggregation pipeline (becomes Elasticsearch)
- ❌ Artifact storage (becomes Docker registry)
- ❌ Role-based access control (becomes auth platform)
- ❌ Multi-environment comparison
- ❌ Deployment analytics dashboard
- ❌ Anomaly detection
- ❌ Kubernetes integration
- ❌ Multi-cloud deployment tracking
- ❌ Slack alerts (nice to have, but not core)

---

### Scope Discipline

> **Ambition kills more projects than difficulty.**

Three features that sound simple but explode:

1. **Secrets manager** → audit logs, rotation, compliance, sync
2. **Log aggregation** → ingestion pipeline, indexing, retention, search
3. **Deployment orchestration** → artifact storage, provider APIs, rollback strategies

For MVP: downgrade all three.

**Keep the core tight:**
- Webhook ingestion
- Deployment history
- Health monitoring  
- Simple dashboard
- Redeploy button

Everything else is negotiable.

---

## 11. Build Order (Critical)

**Do NOT start with GitHub Actions integration.**  
Webhook integration depends on backend existing.

### Phase 1 — Backend Foundation

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

### Phase 2 — GitHub Webhook Integration

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

### Phase 3 — Dashboard

**Show:**
- Latest deployment per service
- Success rate (last 10 deployments)
- Last failure with commit link
- Health status with response time trend
- Redeploy button (triggers GitHub workflow dispatch)
- Last 500 logs for selected deployment

**Design principle:** Keep UI boring and readable. DevOps tools are not Instagram.

**What NOT to build:**
- Complex analytics dashboard
- Real-time log streaming
- Secret editing interface

---

### Phase 4 — Health Monitor Worker

Background job (every 60s):
```
check service endpoints
store response time
update status
```

Now system shows: **deploy → health impact**

That connection is gold.

---

## 12. Future Enhancements

| Feature | Priority |
|---|---|
| Rollback automation | High |
| Role-based access control | High |
| Slack / webhook alerts | High |
| Multi-environment comparison | Medium |
| Deployment analytics | Medium |
| Anomaly detection | Low |
| Kubernetes integration | Low |
| Multi-cloud deployment tracking | Low |

---

## 13. Success Criteria

The project is considered successful when:

- [ ] Deployment history is visible in the dashboard
- [ ] Webhook ingestion works with idempotency (no duplicate records)
- [ ] Redeploy button triggers GitHub workflow dispatch successfully
- [ ] Last 500 logs per deployment are viewable
- [ ] Health status is correctly displayed with response time trends
- [ ] Health monitoring shows correlation with deployments ("deploy → health impact")
- [ ] System demonstrates: **deployment memory + recovery switch**

**Not required for success:**
- ❌ Editable secrets (read-only is enough)
- ❌ Full log aggregation (500 entries is enough)
- ❌ Complex analytics (basic history is enough)

---

## 14. Summary

> **CI/CD Sentinel** is a deployment memory + recovery switch for small teams.

Not a CI/CD platform. Not an observability platform. Not a secrets manager.

Just: **memory + control**.
