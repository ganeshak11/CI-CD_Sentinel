# V1 Sprint Documentation: Chinmay

This document serves as a record of all tasks and webhook ingestion capabilities completed by Chinmay during the V1 sprint of the Sentinel project.

## Completed Tasks & Contributions

### 1. Webhook Routing & Security
- **Webhook Route (`backend/src/routes/webhookRoutes.ts`)**: Implemented the `POST /webhooks/github` entry point to receive GitHub Actions events. Crucially configured this route to use `express.raw()` to buffer the raw request body required for secure signature validation.
- **App Integration (`backend/src/app.ts`)**: Wired the webhook route into the Express application lifecycle, ensuring it is mounted *before* the global `express.json()` parser to preserve the raw request stream.

### 2. Webhook Controller Logic
- **HMAC Validation (`backend/src/controllers/webhookController.ts`)**: Developed the core security mechanism to cryptographically verify incoming GitHub webhooks. It uses `crypto.timingSafeEqual` and `createHmac` to validate the `X-Hub-Signature-256` header against the `GITHUB_WEBHOOK_SECRET`.
- **Event Routing**: Implemented strict event filtering to only process `workflow_run` events, safely ignoring extraneous GitHub webhook traffic and returning appropriate HTTP status codes.

### 3. Webhook Service Processing
- **Event Parsing & DB Linking (`backend/src/services/webhookService.ts`)**: Built the translation layer between GitHub Actions and Sentinel's graph database.
  - Extracted metadata (workflow run IDs, commits, statuses, branches).
  - Handled **Microservice architectures** by directly associating single-repo workflows to their respective service node.
  - Handled **Monorepo architectures** by retrieving the list of changed files for the commit via the GitHub API, executing glob pattern matching (`matchGlob`) against the registered `path_filters`, and only creating deployment nodes for the services whose subdirectories were touched.
  - Safely called the idempotent Neo4j queries (`createDeployment` and `createCommit`) ensuring no duplicate records.
