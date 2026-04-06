# CI/CD Sentinel

![Version](https://img.shields.io/badge/version-v1.0--MVP-blue)
![Status](https://img.shields.io/badge/status-In%20Development-yellow)

> **Deployment memory + recovery switch for small teams**

CI/CD Sentinel is a centralized observability and recovery layer for software deployments. It tracks deployment history, monitors health status, and provides recovery controls — all from a single dashboard.

---

## What Problem Does This Solve?

After deployment, engineers face:
- **Scattered visibility** — logs, metrics, and deployment info across multiple tools
- **Risky rollbacks** — manual processes prone to errors
- **"What broke?"** panic — no clear deployment history or health correlation

**Sentinel provides:**
- Deployment history with commit tracking
- Health monitoring with performance trends
- One-click redeploy via GitHub Actions
- Centralized log viewing

---

## Core Features (MVP)

| Feature | Description |
|---|---|
| **Webhook Ingestion** | Receives GitHub Actions deployment events with idempotency |
| **Deployment History** | Tracks who deployed what, when, and to which environment |
| **Health Monitoring** | Polls service endpoints every 60s, tracks response times |
| **Redeploy Trigger** | Triggers GitHub workflow dispatch to redeploy |
| **Dashboard** | Shows latest deployments, success rate, health status |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL |
| Frontend | Next.js / React Native |
| CI/CD | GitHub Actions (webhooks) |

---

## Architecture

```
GitHub Actions (webhook)
         ↓
   Backend API (Node.js)
         ↓
   PostgreSQL
         ↓
   Dashboard (Next.js)
```

**Core Flow:**
1. GitHub Actions sends webhook on deployment
2. Backend stores deployment metadata (with idempotency)
3. Health worker polls service endpoints every 60s
4. Dashboard displays deployment history + health trends
5. User clicks "Redeploy" → triggers GitHub workflow dispatch

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- GitHub account with repository access
- GitHub Personal Access Token (for workflow dispatch)

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/CI-CD_SENTINEL.git
cd CI-CD_SENTINEL

Setup instructions
Backend setup: /backend
Frontend setup: /frontend
```

### Environment Variables

Create `.env` file:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/sentinel

# GitHub
GITHUB_TOKEN=your_github_personal_access_token
GITHUB_WEBHOOK_SECRET=your_webhook_secret

# Server
PORT=3000
NODE_ENV=development
```

---

## Project Structure

```
CI-CD_SENTINEL/
├── Docs/
│   ├── PRD.md                    # Product Requirements Document
│   ├── CI-CD Sentinel.pdf
│   └── CI-CD Sentinel(Arch diagram).jpg
├── backend/                      # (coming soon)
├── frontend/                     # (coming soon)
├── .gitignore
└── README.md
```

---

## Development Roadmap

### Phase 1: Backend Foundation ✅ (In Progress)
- [ ] API skeleton (Express + TypeScript)
- [ ] PostgreSQL schema setup
- [ ] Webhook endpoint with idempotency
- [ ] Deployment tracking

### Phase 2: GitHub Integration
- [ ] Webhook event processing
- [ ] GitHub workflow dispatch API integration
- [ ] Deployment metadata capture

### Phase 3: Dashboard
- [ ] Deployment history view
- [ ] Health status display
- [ ] Redeploy button
- [ ] Basic authentication

### Phase 4: Health Monitoring
- [ ] Background worker (60s polling)
- [ ] Response time tracking
- [ ] Health status correlation with deployments

---

## MVP Scope

**What we're building:**
- Webhook ingestion → deployment history → health monitoring → dashboard

**What we're NOT building (yet):**
- ❌ Editable secrets manager (read-only viewer only)
- ❌ Full log aggregation (last 500 logs per deployment)
- ❌ Complex analytics
- ❌ Kubernetes integration
- ❌ Multi-cloud support

> **Philosophy:** Deployment memory + recovery switch. Not a CI/CD platform, not an observability platform, not a secrets manager. Just memory + control.

---

## Contributing

### Branch Strategy

We follow a **feature branch workflow** with branch protection:

```
feature/* → dev → main
```

**Rules:**
- ❌ No direct push to `main` or `dev`
- ✅ Create feature branches: `feature/your-feature-name`
- ✅ Push feature branch → Create PR to `dev`
- ✅ Require 1 team member review before merge
- ✅ Team lead merges `dev` → `main` when stable

---

### Team Workflow

**1. Pick a task** from the roadmap or issues

**2. Create a feature branch:**
```bash
git checkout -b feature/your-feature-name
```

**3. Make changes and push:**

**Linux/macOS:**
```bash
./push.sh
```

**Windows:**
```powershell
# First time only (if needed)
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

# Then use
.\push.ps1
```

The script will:
- Block direct push to `main`/`dev`
- Ask for commit message
- Select commit type (feat/fix/refactor/docs/chore)
- Run tests (if package.json exists)
- Push to your feature branch

**4. Create Pull Request:**
- Go to GitHub repository
- Create PR: `feature/your-feature-name` → `dev`
- Request review from 1 team member

**5. After approval:**
- Merge PR to `dev`

**6. Team lead:**
- Merges `dev` → `main` when stable

---

### Team Workflow

1. **Pick a task** from the roadmap or issues
2. **Create a branch**: `git checkout -b feature/your-feature-name`
3. **Make changes** and commit with clear messages
4. **Push and create PR**: `git push origin feature/your-feature-name`
5. **Get review** from at least one team member
6. **Merge** after approval

### Commit Message Format

```
feat: add webhook idempotency check
fix: resolve duplicate deployment records
docs: update API endpoint documentation
```

### Code Style

- TypeScript for backend
- ESLint + Prettier (configs coming soon)
- Meaningful variable names
- Comments only when necessary

---

## Documentation

- **[PRD (Product Requirements Document)](./Docs/PRD.md)** — Full product specification
- **Architecture Diagram** — See `Docs/CI-CD Sentinel(Arch diagram).jpg`
- **API Documentation** — Coming soon

---

## Team

- **Project Lead:** TBD
- **Backend:** TBD
- **Frontend:** TBD
- **DevOps:** TBD

---

## License

TBD

---

## Questions?

Check the [PRD](./Docs/PRD.md) for detailed requirements or open an issue for discussion.

