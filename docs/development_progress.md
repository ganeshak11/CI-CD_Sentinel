# Sentinel Development Progress

This document tracks the feature-level development progress for the team across all 4 spiral versions.

Status Keys: ⚪ Not Started | 🟡 In Progress | 🟢 Completed

---

## V1 — See Everything

| Feature | Assignee | Status | Notes |
|---|---|---|---|
| Phase 1 Infra (Docker/Neo4j/Redis) | Ganesh | 🟢 Completed | Compose file finalized. Schema created. |
| Webhook Ingest API | Chinmay | 🟢 Completed | |
| Deployment & Commit Graph Nodes | Chinmay | 🟢 Completed | |
| 60s Health Worker | Abdul | 🟢 Completed | |
| HealthCheck Graph Nodes + Redis Cache | Varsha | 🟢 Completed | |
| Next.js Dashboard Shell | Varsha | 🟢 Completed | |
| V1 Integration & E2E Testing | Ganesh | 🟢 Completed | |

---

## V2 — Fix Faster

| Feature | Assignee | Status | Notes |
|---|---|---|---|
| Automated Rollback Engine (Re-run API) | Abdul | ⚪ Not Started | Tier 1 auto + Tier 2 manual rollback via GitHub API |
| Rollback Graph Relationships | Ganesh | 🟢 Completed | `Rollback` node, `TRIGGERED_ROLLBACK` rel, `getLastHealthyDeployment()` |
| LogFetchJob Pipeline (Zip Fetch & Parse) | Chinmay | ⚪ Not Started | GitHub Actions log ZIP → extract → last 500 lines in Redis |
| RCA Engine (Regex Rules & Status) | Chinmay | ⚪ Not Started | 8 error pattern types, confidence scoring, `ErrorPattern` nodes |
| RCA Panel UI | Varsha | ⚪ Not Started | Deployment detail page — error patterns, log viewer, changed files |
| Deployment Comparison UI | Varsha | ⚪ Not Started | Rollback console — preview modal, confirm rollback, redeploy button |
| Notification Templates (Slack/Email/PR) | Abdul | ⚪ Not Started | `@slack/webhook` + `nodemailer`, triggered on failure & rollback |
| V2 Integration & E2E Testing | Ganesh | ⚪ Not Started | `docs/v2_test_plan.md`, PR reviews, schema migrations |

---

## V3 — Prevent Failures

| Feature | Assignee | Status | Notes |
|---|---|---|---|
| Interactive Graph Visualization UI | [TBD] | ⚪ Not Started | |
| Service Dependency Blast Radius Queries | [TBD] | ⚪ Not Started | |
| PR Governance Checks (GitHub PR Comments) | [TBD] | ⚪ Not Started | |
| Layer 2 Risk Scoring (Graph-enhanced) | [TBD] | ⚪ Not Started | |
| Environment Drift Detection | [TBD] | ⚪ Not Started | |
| Rollback Impact Preview UI | [TBD] | ⚪ Not Started | |
| Risk Indicator UI Components | [TBD] | ⚪ Not Started | |
| V3 Integration & E2E Testing | [TBD] | ⚪ Not Started | |

---

## V4 — Ship at Scale

| Feature | Assignee | Status | Notes |
|---|---|---|---|
| Helm Chart & Docker Production Config | [TBD] | ⚪ Not Started | |
| Meta-Demo Setup | [TBD] | ⚪ Not Started | |
| Enterprise License Validation Engine | [TBD] | ⚪ Not Started | |
| Performance Hardening (BullMQ Migration) | [TBD] | ⚪ Not Started | |
| Installation Wizard | [TBD] | ⚪ Not Started | |
| Production Readiness Checks | [TBD] | ⚪ Not Started | |
| Onboarding UI | [TBD] | ⚪ Not Started | |
| Documentation Site | [TBD] | ⚪ Not Started | |
| V4 Integration & Release | [TBD] | ⚪ Not Started | |
