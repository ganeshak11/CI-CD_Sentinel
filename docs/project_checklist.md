# Sentinel Project & Operations Checklist

This checklist tracks the entire lifecycle of the CI/CD Sentinel project from a repository owner's perspective — from local development to open-source distribution.

---

## 1. Repository & Infrastructure Setup (Phase 0)
*Foundation steps to secure the repo and prepare for team development.*

- [x] **Branch Protection Rules:** Configure GitHub to protect `main` and `dev` branches (require PRs, require approvals, prevent force pushes).
- [x] **Issue & PR Templates:** Create `.github/ISSUE_TEMPLATE` and `.github/PULL_REQUEST_TEMPLATE` for standardized team contributions.
- [ ] **GitHub Secrets:** Add necessary secrets to the repo for CI/CD actions (e.g., `DOCKER_HUB_TOKEN` or `GHCR_TOKEN`).
- [x] **Local Docker Compose:** Finalize the local `docker-compose.yml` so any team member can run `docker compose up` to get Neo4j, Redis, and Node environments instantly.
- [x] **Linting & Formatting:** Enforce ESLint and Prettier across frontend and backend to prevent code style conflicts.

---

## 2. Development Workflow (The Spiral Model)
*How features are built and merged during each version (V1, V2, etc.).*

- [ ] **Branching:** Ensure all team members create branches from `dev` (e.g., `feature/webhook-ingest`).
- [ ] **Draft PRs:** Encourage opening PRs early as drafts so you (the integration lead) can monitor architecture direction.
- [ ] **Integration Review:** You review PRs against `dev` for:
    - Database safety (e.g., missing Neo4j indexes, unoptimized Cypher queries).
    - API contracts (does the frontend expect what the backend sends?).
- [ ] **Merge to Dev:** Squash and merge feature branches into `dev` when approved.
- [ ] **Version Stabilization:** Once all V1 features are in `dev`, run end-to-end local tests. Fix any integration bugs directly on `dev`.

---

## 3. Production Readiness & CI (Continuous Integration)
*Ensuring the code is ready to be built into production artifacts.*

- [ ] **Dockerfiles:** Write optimized, multi-stage Dockerfiles for the Backend (Node) and Frontend (Next.js).
- [ ] **CI Pipeline (Build & Test):** Create a GitHub Action (`.github/workflows/ci.yml`) that runs on every PR to `dev` and `main` to build the Docker images and run tests (ensures the build isn't broken).
- [ ] **Environment Configuration:** Ensure the production `docker-compose.yml` pulls images from the registry rather than building from local source.

---

## 4. Release & Distribution (The Open-Source Way)
*How to package and distribute Sentinel to end-users without making them compile code.*

- [ ] **Version Bump:** Update version numbers in `package.json` and prepare release notes.
- [ ] **Merge to Main:** Merge the stable `dev` branch into `main`.
- [ ] **Create Tag:** Create a Git tag (e.g., `v1.0.0`) on the `main` branch.
- [ ] **Release Automation (CD):** Create a GitHub Action (`.github/workflows/release.yml`) that triggers on tag creation:
    - [ ] Logs into GitHub Container Registry (`ghcr.io`).
    - [ ] Builds production Docker images for Backend and Frontend.
    - [ ] Pushes images with the tag (e.g., `ghcr.io/your-org/sentinel-backend:v1.0.0`).
- [ ] **Release Asset Creation:** The action creates a `sentinel-v1.0.0.tar.gz` containing only:
    - `docker-compose.yml` (configured to use the remote images).
    - `.env.example`
    - `install.sh`
- [ ] **Publish GitHub Release:** The action attaches the `.tar.gz` to the GitHub Release page automatically.

---

## 5. End-User Installation Validation
*What an end-user experiences when they download Sentinel.*

- [ ] **Download Test:** User downloads `.tar.gz` from the GitHub Releases page.
- [ ] **Extraction Test:** User extracts the archive and copies `.env.example` to `.env`.
- [ ] **Boot Test:** User runs `docker compose up -d` and the pre-built images pull and start in under 30 seconds.
- [ ] **First-run Wizard:** The user can access the dashboard, register their first service, and input their GitHub OAuth credentials.

---

## 6. Maintenance & Community
*Post-launch activities.*

- [ ] **Documentation:** Ensure `README.md` and a `/docs` directory are fully updated with architecture, deployment guides, and API specs.
- [ ] **License Tracking:** For V4 (Enterprise), ensure the license validation logic (`license.sentinel.io`) accurately gates advanced features.
- [ ] **Community Triaging:** Monitor GitHub Issues for bug reports and feature requests, labeling them appropriately.
- [ ] **Next Spiral:** Begin planning feature assignments for the next version (e.g., V2).
