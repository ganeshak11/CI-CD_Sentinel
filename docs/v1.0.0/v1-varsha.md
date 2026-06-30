# V1 Sprint Documentation: Varsha

This document serves as a record of all frontend dashboard tasks completed by Varsha during the V1 sprint of the Sentinel project.

## Completed Tasks & Contributions

### 1. Dashboard Scaffolding & Setup
- **Next.js 14 App Router Setup**: Initialized the `frontend` application using Next.js 14 App Router, including Tailwind CSS configuration and environment variables (`NEXT_PUBLIC_API_URL`) setup for local development.
- **TypeScript Integration**: Defined core data models (`Service`, `HealthStatus`, `Deployment`) inside `frontend/types` ensuring type-safe data fetching.

### 2. API Integration Layer
- **API Wrapper (`frontend/services/api.ts`)**: Built the primary client-side functions to communicate with the Node.js backend.
  - Implemented `getServices()`, `getDeployments()`, and `getHealthStatus()` fetch wrappers.
  - Implemented `createService()` for the service registration flow.

### 3. Core Pages & UI Components
- **Main Dashboard (`frontend/app/page.tsx`)**: Created the primary landing page which auto-fetches all registered services. Mapped the incoming `healthStatus` data against `services` to display live 🟢 Healthy / 🔴 Down indicators on the service cards.
- **Service Registration Flow (`frontend/app/services/new/page.tsx`)**: Built the form allowing teams to onboard a new microservice by specifying its repository, path filter (for monorepos), health endpoint, and environment. On successful creation, it dynamically redirects users to the webhook setup instructions.
- **Webhook Setup Page (`frontend/app/services/setup-webhook/page.tsx`)**: Created a dedicated instruction page displaying the dynamic webhook URL (leveraging `window.location.origin`) and the `GITHUB_WEBHOOK_SECRET` for users to plug into their GitHub repo settings.
- **Deployments Skeleton (`frontend/app/deployments/page.tsx`)**: Laid down the foundation for the deployments table, tracking the pipeline history of registered services.
- **Navigation (`frontend/components/Navbar.tsx`)**: Built the global top-level navigation to route between Dashboard, Deployments, and Service registration.

### 4. Real-time Refresh
- Added `setInterval` logic inside the main dashboard component to re-fetch and re-validate service health status every 30 seconds.
