# V2 Phase 2B Manual Testing Guide — Rollback Engine + Notifications

**Branch:** `feature/v2-rollback-notifications`
**Test Date:** 2026-08-15
**Tester:** Abdul Misran

---

## 📋 Prerequisites

### Environment Setup
Before running tests, ensure `.env` is configured with:

```env
# Database
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password

# Redis
REDIS_URL=redis://localhost:6379

# GitHub
GITHUB_TOKEN=your_github_token_here
GITHUB_REPO_URL=ganeshak11/CI-CD_Sentinel

# Slack (required for notifications testing)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Email (optional, for email alert testing)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
ALERT_EMAIL=team@example.com
ALERT_EMAIL_FROM=noreply@sentinel.local

# Sentinel URLs
SENTINEL_BASE_URL=http://localhost:3000
```

### System Requirements
- ✅ Docker Compose running (Neo4j + Redis)
- ✅ Backend server running (`npm run dev`)
- ✅ Postman or similar API testing tool
- ✅ Slack workspace with webhook configured
- ✅ Email account configured (optional)

---

## 🧪 Test Suite 1: Deployment Failure Alerts

### Test 1.1: Slack Alert on Deployment Failure
**Objective:** Verify Slack alert sent within 5 seconds of failure webhook

**Steps:**
1. Send workflow webhook with `conclusion: 'failure'`:
```bash
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "completed",
    "workflow_run": {
      "id": 123456789,
      "name": "CI/CD Pipeline",
      "status": "completed",
      "conclusion": "failure",
      "head_branch": "main",
      "head_sha": "abc123def456",
      "created_at": "2026-08-15T10:00:00Z",
      "updated_at": "2026-08-15T10:05:00Z",
      "actor": {
        "login": "testuser"
      },
      "head_commit": {
        "message": "Test deployment failure",
        "author": {
          "name": "Test User",
          "email": "test@example.com"
        },
        "timestamp": "2026-08-15T10:00:00Z"
      }
    },
    "repository": {
      "full_name": "ganeshak11/CI-CD_Sentinel",
      "html_url": "https://github.com/ganeshak11/CI-CD_Sentinel"
    }
  }'
```

2. **Expected Result:**
   - ✅ HTTP 200 response from webhook
   - ✅ Slack message appears in configured channel within 5 seconds
   - ✅ Message contains: service name, branch, failure status, GitHub Actions run link
   - ✅ Console log shows: `[notificationService] Sent deployment alert for {service}`

3. **Verification in Slack:**
   - 🔴 Service name displayed
   - 🔴 Branch name displayed
   - 🔴 "failure" status badge
   - 🔴 "View Logs" button with correct GitHub URL
   - 🔴 Triggered by username shown

**Pass/Fail:** ☐ PASS ☐ FAIL

---

### Test 1.2: Email Alert on Deployment Failure
**Objective:** Verify email alert sent within 30 seconds with HTML template

**Steps:**
1. Ensure `ALERT_EMAIL` is configured in `.env`
2. Send same failure webhook as Test 1.1
3. Wait up to 30 seconds for email

**Expected Result:**
   - ✅ Email received at configured `ALERT_EMAIL`
   - ✅ Subject: `🚨 Deployment Failure: {service} - {branch}`
   - ✅ HTML email body contains:
     - Service name
     - Branch name
     - Workflow name
     - Failure status
     - Triggered by username
     - Timestamp
   - ✅ Action buttons visible:
     - "View Logs on GitHub" (links to GitHub Actions)
     - "View Logs in Sentinel" (links to local deployment logs)
     - "Trigger Rollback" (links to rollback endpoint)

**Verification in Email:**
   - ✅ Table with failure details
   - ✅ Clickable buttons/links
   - ✅ Professional HTML formatting
   - ✅ "Do not reply" footer message

**Pass/Fail:** ☐ PASS ☐ FAIL

---

### Test 1.3: Notification Failure Doesn't Crash Webhook
**Objective:** Verify webhook returns 200 even if notifications fail

**Steps:**
1. Temporarily break Slack webhook URL (set to invalid)
2. Send failure webhook
3. Verify webhook response

**Expected Result:**
   - ✅ Webhook returns HTTP 200 (NOT 500)
   - ✅ Console shows error logged: `[webhookService] Failed to send Slack alert`
   - ✅ Deployment is still created in database
   - ✅ No exception thrown to caller

**Verification:**
   - ✅ Check Neo4j: Deployment node exists
   - ✅ Check logs: Error message present but not propagated
   - ✅ HTTP response is successful

**Pass/Fail:** ☐ PASS ☐ FAIL

---

## 🧪 Test Suite 2: Auto-Rollback Trigger

### Test 2.1: 3 Consecutive Unhealthy Checks Trigger Rollback
**Objective:** Verify auto-rollback triggered after 3 consecutive unhealthy health checks

**Prerequisites:**
1. Register a service in the database:
```bash
curl -X POST http://localhost:3000/api/services \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test-service",
    "repoUrl": "ganeshak11/CI-CD_Sentinel",
    "healthEndpoint": "http://localhost:8080/health",
    "environment": "staging",
    "rollbackStrategy": "rerun"
  }'
```

2. Create a successful deployment (to have a rollback target):
```bash
curl -X POST http://localhost:3000/api/deployments \
  -H "Content-Type: application/json" \
  -d '{
    "workflowRunId": 111111111,
    "workflowName": "CI/CD",
    "branch": "main",
    "status": "completed",
    "conclusion": "success",
    "triggeredBy": "testuser",
    "startedAt": "2026-08-15T09:00:00Z",
    "completedAt": "2026-08-15T09:05:00Z",
    "serviceId": "{service_id_from_step_1}",
    "commitSha": "abc123def456"
  }'
```

**Test Steps:**
1. Make health endpoint return 500 (simulate service becoming unhealthy)
2. Wait for health check cycle (1 minute)
3. After first unhealthy check → Verify HealthCheck node created
4. After second unhealthy check → Verify second HealthCheck node
5. After third unhealthy check → Verify Rollback is triggered

**Expected Result After 3rd Check:**
   - ✅ Console shows: `[healthWorker] Service {id} has 3 consecutive unhealthy checks. Triggering auto-rollback...`
   - ✅ Rollback node created in Neo4j with:
     - `status: 'triggered'`
     - `trigger: 'automatic'`
     - `strategy: 'rerun'` or `'workflow_dispatch'`
   - ✅ GitHub API called (check logs for POST request)
   - ✅ Slack alert sent: "🔄 Automatic Rollback Triggered"
   - ✅ Email received (if configured)

**Database Verification (Neo4j):**
```cypher
MATCH (s:Service {id: "{service_id}"})-[:HAS_HEALTH]->(h:HealthCheck)
RETURN h ORDER BY h.checkedAt DESC LIMIT 3
// Should show 3 unhealthy checks
```

```cypher
MATCH (r:Rollback)
WHERE r.status = 'triggered' AND r.trigger = 'automatic'
RETURN r
// Should show the rollback node
```

**Pass/Fail:** ☐ PASS ☐ FAIL

---

### Test 2.2: Rollback Skipped If No Healthy Deployment
**Objective:** Verify rollback is skipped gracefully if no healthy deployment exists

**Steps:**
1. Create a service with NO successful deployments (only failures)
2. Make health checks unhealthy 3 times consecutively
3. Wait for rollback trigger attempt

**Expected Result:**
   - ✅ Console shows: `[rollbackService] No healthy deployment found for service {name}. Skipping auto-rollback.`
   - ✅ NO Rollback node created
   - ✅ NO GitHub API call made
   - ✅ Health worker continues normally (no crash)
   - ✅ WARNING level log message appears

**Pass/Fail:** ☐ PASS ☐ FAIL

---

### Test 2.3: Rollback GitHub API Call
**Objective:** Verify GitHub API is called with correct parameters

**Steps:**
1. Enable request logging to see HTTP calls
2. Trigger auto-rollback (per Test 2.1)
3. Monitor network traffic or server logs

**Expected Result:**
   - ✅ POST request made to: `https://api.github.com/repos/{owner}/{repo}/actions/runs/{run_id}/rerun`
   - ✅ Authorization header: `Bearer {GITHUB_TOKEN}`
   - ✅ HTTP 201 response indicates success
   - ✅ Console shows: `[rollbackService] Successfully called GitHub API to re-trigger workflow`

**Pass/Fail:** ☐ PASS ☐ FAIL

---

## 🧪 Test Suite 3: Manual Rollback API

### Test 3.1: Rollback Preview API
**Objective:** Verify rollback preview returns correct data

**Steps:**
1. Create two deployments:
   - Deployment A (successful, older)
   - Deployment B (failed, newer)
2. Call rollback preview for Deployment B:
```bash
curl -X GET http://localhost:3000/api/deployments/{deployment_b_id}/rollback-preview
```

**Expected Result:**
```json
{
  "data": {
    "targetDeployment": {
      "id": "{deployment_a_id}",
      "status": "completed",
      "conclusion": "success",
      "branch": "main",
      "completedAt": "2026-08-15T09:05:00Z"
    },
    "dependentServices": [
      {
        "id": "{service_id}",
        "name": "other-service",
        "environment": "production"
      }
    ],
    "riskLevel": "low",
    "reason": "10 recent deployments, 0.0% failure rate"
  }
}
```

**Verification:**
   - ✅ HTTP 200 response
   - ✅ targetDeployment is the most recent successful deployment
   - ✅ dependentServices array populated (if DEPENDS_ON relationships exist)
   - ✅ riskLevel calculated correctly (low/medium/high)
   - ✅ reason field explains the calculation

**Pass/Fail:** ☐ PASS ☐ FAIL

---

### Test 3.2: Manual Rollback Trigger
**Objective:** Verify manual rollback API triggers same flow as auto-rollback

**Steps:**
1. Create a failed deployment
2. Call manual rollback API:
```bash
curl -X POST http://localhost:3000/api/deployments/{failed_deployment_id}/rollback \
  -H "Content-Type: application/json"
```

**Expected Result:**
   - ✅ HTTP 200 response with Rollback node data
   - ✅ Console shows: `[rollbackService] Processing manual rollback request for deployment {id}`
   - ✅ Rollback node created with `trigger: 'manual'`
   - ✅ GitHub API called (same as auto-rollback)
   - ✅ Slack alert sent: "🔄 Automatic Rollback Triggered"
   - ✅ Email received (if configured)

**Response Verification:**
```json
{
  "data": {
    "id": "{rollback_id}",
    "deploymentId": "{deployment_id}",
    "triggeredAt": "2026-08-15T10:30:00Z",
    "trigger": "manual",
    "strategy": "rerun",
    "targetDeploymentId": "{target_deployment_id}",
    "status": "triggered"
  },
  "message": "Rollback triggered successfully"
}
```

**Pass/Fail:** ☐ PASS ☐ FAIL

---

### Test 3.3: Rollback Error Handling
**Objective:** Verify proper error handling when rollback fails

**Steps:**
1. Make GitHub unreachable (disconnect network or use invalid token)
2. Trigger manual rollback
3. Observe error handling

**Expected Result:**
   - ✅ HTTP 400 or 500 response (depending on error type)
   - ✅ Error message returned: `"Failed to trigger rollback"` or similar
   - ✅ Rollback node still created with `status: 'failed'`
   - ✅ Console shows error: `[rollbackService] Failed to call GitHub API for rollback`
   - ✅ Neo4j shows rollback with failed status

**Database Verification:**
```cypher
MATCH (r:Rollback {status: 'failed'})
RETURN r
```

**Pass/Fail:** ☐ PASS ☐ FAIL

---

## 🧪 Test Suite 4: Database State Verification

### Test 4.1: Rollback Node Structure
**Objective:** Verify Rollback node has correct structure and relationships

**Steps:**
1. Query Neo4j after triggering a rollback:
```cypher
MATCH (d:Deployment)-[:TRIGGERED_ROLLBACK]->(r:Rollback)
RETURN d, r
```

**Expected Result:**
   - ✅ Rollback node exists with properties:
     - `id` (UUID)
     - `deploymentId` (references failed deployment)
     - `triggeredAt` (ISO timestamp)
     - `trigger` ('automatic' or 'manual')
     - `strategy` ('rerun' or 'workflow_dispatch')
     - `targetDeploymentId` (references healthy deployment)
     - `status` ('triggered' or 'failed')
   - ✅ `:TRIGGERED_ROLLBACK` relationship exists from Deployment to Rollback
   - ✅ No orphaned Rollback nodes

**Pass/Fail:** ☐ PASS ☐ FAIL

---

### Test 4.2: Health Check History
**Objective:** Verify HealthCheck nodes are created and linked correctly

**Steps:**
1. Let health worker complete 3 cycles (3 minutes total)
2. Query Neo4j:
```cypher
MATCH (s:Service {id: "{service_id}"})-[:HAS_HEALTH]->(h:HealthCheck)
RETURN h ORDER BY h.checkedAt DESC LIMIT 3
```

**Expected Result:**
   - ✅ Exactly 3 HealthCheck nodes returned
   - ✅ All have `status: 'unhealthy'`
   - ✅ `checkedAt` times are 1 minute apart
   - ✅ Each has `error` field populated
   - ✅ Each has `responseTimeMs` logged

**Pass/Fail:** ☐ PASS ☐ FAIL

---

### Test 4.3: Deployment Node Linked to Service
**Objective:** Verify deployment correctly linked to service

**Steps:**
1. Query after webhook:
```cypher
MATCH (s:Service)-[:DEPLOYED]->(d:Deployment)
WHERE d.id = "{deployment_id}"
RETURN s, d
```

**Expected Result:**
   - ✅ Service and Deployment nodes linked
   - ✅ Deployment has correct properties:
     - `workflowRunId`
     - `workflowName`
     - `branch`
     - `status`
     - `conclusion` ('success', 'failure', etc.)
     - `triggeredBy`
     - `startedAt`
     - `completedAt`
     - `serviceId`

**Pass/Fail:** ☐ PASS ☐ FAIL

---

## 🧪 Test Suite 5: Non-Breaking Integration

### Test 5.1: Webhook Response Still 200 on Notification Failure
**Objective:** Ensure webhook doesn't fail if notifications have errors

**Steps:**
1. Break email configuration
2. Break Slack webhook URL
3. Send deployment failure webhook
4. Check response

**Expected Result:**
   - ✅ Webhook returns HTTP 200
   - ✅ Deployment still created
   - ✅ Errors logged but not propagated
   - ✅ Client receives: `{ message: "Successfully registered deployment for services: [...]" }`

**Pass/Fail:** ☐ PASS ☐ FAIL

---

### Test 5.2: Health Worker Continues on Notification Failure
**Objective:** Ensure health worker doesn't crash if auto-rollback notifications fail

**Steps:**
1. Break Slack webhook
2. Trigger 3 unhealthy checks (to attempt auto-rollback + notification)
3. Monitor health worker

**Expected Result:**
   - ✅ Health worker continues running
   - ✅ Next health cycle completes normally
   - ✅ Errors logged for failed notifications
   - ✅ Rollback still created (even if notifications fail)
   - ✅ Console shows: `[healthWorker] Unexpected error in triggerAutoRollback` with error message

**Pass/Fail:** ☐ PASS ☐ FAIL

---

## 📊 Test Results Summary

| Test # | Test Name | Status | Notes |
|--------|-----------|--------|-------|
| 1.1 | Slack Alert on Failure | ☐ | Time to alert: ___ seconds |
| 1.2 | Email Alert on Failure | ☐ | Time to email: ___ seconds |
| 1.3 | Notification Failure Handling | ☐ | |
| 2.1 | Auto-Rollback Trigger | ☐ | GitHub API called: Yes/No |
| 2.2 | Rollback Skipped (No Healthy) | ☐ | |
| 2.3 | Rollback GitHub API | ☐ | Response status: ___ |
| 3.1 | Rollback Preview API | ☐ | Risk level: ___ |
| 3.2 | Manual Rollback Trigger | ☐ | |
| 3.3 | Rollback Error Handling | ☐ | |
| 4.1 | Rollback Node Structure | ☐ | |
| 4.2 | Health Check History | ☐ | |
| 4.3 | Deployment Service Link | ☐ | |
| 5.1 | Webhook Non-Breaking | ☐ | |
| 5.2 | Health Worker Non-Breaking | ☐ | |

---

## 🐛 Known Issues / Edge Cases

- [ ] **workflow_dispatch strategy not yet implemented** — Currently only `rerun` works
- [ ] **Email SMTP errors** — Verify SMTP credentials before testing
- [ ] **Redis cache TTL** — Logs cached for 1 hour, may need to clear manually
- [ ] **Timezone handling** — All timestamps ISO 8601 UTC

---

## ✅ Sign-Off

**Tester Name:** _____________________
**Date:** _____________________
**Overall Result:** ☐ PASS ☐ FAIL ☐ PARTIAL

**Comments:**
```
_________________________________________________________________
_________________________________________________________________
_________________________________________________________________
```

**Approved by (Phase Lead):** _____________________
**Date:** _____________________

---

*For questions or issues, contact the development team in the group chat.*
