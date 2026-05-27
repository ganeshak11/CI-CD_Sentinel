# Sentinel API Reference (Contract)

This document serves as the strict API contract between the Frontend and Backend teams. 
**Do not deviate from these paths or payloads without team discussion.**

---

## 1. Webhooks (Ingestion)

### `POST /webhooks/github`
Receives webhook events from GitHub Actions.
- **Headers:** `X-Hub-Signature-256` required for validation.
- **Payload:** GitHub `workflow_job` or `workflow_run` JSON.
- **Response:** `202 Accepted` (processing is asynchronous).

---

## 2. Deployments

### `GET /api/deployments`
List deployment history across all services.
- **Query Params:** `?page=1&limit=50&serviceId=abc` (optional)
- **Response:**
  ```json
  {
    "data": [
      {
        "id": "run-12345",
        "service_name": "payment-service",
        "version": "v1.4.2",
        "status": "success",
        "completed_at": "2026-05-27T10:00:00Z"
      }
    ],
    "pagination": { "total": 1, "page": 1 }
  }
  ```

### `GET /api/deployments/:id`
Get full details of a specific deployment.

### `GET /api/deployments/:id/rca`
Get the Root Cause Analysis for a failed deployment.
- **Response:**
  ```json
  {
    "status": "complete",
    "confidence_score": 87,
    "errors": [
      { "type": "DB Connection", "message": "Connection refused", "occurrences": 15 }
    ]
  }
  ```

### `GET /api/deployments/:id/compare/:prevId`
Get a side-by-side comparison of two deployments (Diff + Metrics).

### `GET /api/deployments/:id/logs`
Get the raw GitHub Actions log lines for a deployment.

---

## 3. Rollbacks & Actions

### `GET /api/deployments/:id/rollback-preview`
Preview what will happen if a rollback is triggered.
- **Response:** Returns the target fallback deployment ID and the affected services.

### `POST /api/deployments/:id/rollback`
Trigger a manual rollback via GitHub Re-run API.
- **Response:** `200 OK`
  ```json
  { "message": "Rollback triggered", "target_run_id": "98765" }
  ```

### `POST /api/deployments/:id/redeploy`
Trigger a manual redeploy of the exact same deployment.

---

## 4. Services Registry

### `GET /api/services`
List all tracked services.

### `POST /api/services`
Register a new service to track.
- **Payload:**
  ```json
  {
    "name": "payment-service",
    "github_repo": "org/payment-service",
    "health_url": "https://api.example.com/health"
  }
  ```

### `GET /api/services/:id/env-drift`
Compare the GitHub Secrets key presence between the latest deployment and the previous one.

---

## 5. Health Status

### `GET /api/health-status`
Get the real-time health status of all tracked services.
- **Response:**
  ```json
  [
    {
      "service_name": "payment-service",
      "status": "degraded",
      "latency_ms": 1200,
      "last_checked": "2026-05-27T10:05:00Z"
    }
  ]
  ```

### `GET /api/health-status/:serviceId`
Get the historical health timeline for a specific service (used for charts).
