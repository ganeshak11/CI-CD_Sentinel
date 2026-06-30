# Graph Service Task — Walkthrough

## What was done

Completed all remaining items from Ganesh's V1 task assignment for the Graph Service (`graphService.ts`), the Bulk Import CLI, and the supporting infrastructure.

---

## Files Changed

### Modified Files

| File | What changed |
|---|---|
| [graphService.ts](file:///home/ganeshak11/dev/CI-CD_SENTINEL/backend/src/services/graphService.ts) | Added `findServicesByRepo()`, `bulkCreateServices()`, `deleteService()`. Updated `createService()` with `pathFilter`, `dependencies`, `rollbackStrategy` support. |
| [deployment.types.ts](file:///home/ganeshak11/dev/CI-CD_SENTINEL/backend/src/types/deployment.types.ts) | Added `pathFilter`, `rollbackStrategy` to `Service`. Added `BulkServiceConfig`, `BulkImportResult` types. |
| [schema.cypher](file:///home/ganeshak11/dev/CI-CD_SENTINEL/backend/src/db/schema.cypher) | Added `Service.id` UNIQUE constraint, `HealthCheck.checkedAt` index, `Deployment.startedAt` index. Documented every constraint. |
| [applySchema.ts](file:///home/ganeshak11/dev/CI-CD_SENTINEL/backend/src/db/applySchema.ts) | **Bug fix:** No longer closes Neo4j driver when imported by `app.ts`. Only closes when run standalone. |
| [app.ts](file:///home/ganeshak11/dev/CI-CD_SENTINEL/backend/src/app.ts) | Registered `/api/services` routes. |
| [deployment.service.ts](file:///home/ganeshak11/dev/CI-CD_SENTINEL/backend/src/services/deployment.service.ts) | Added `findServicesByRepo` re-export for Chinmay's webhook service. |
| [package.json](file:///home/ganeshak11/dev/CI-CD_SENTINEL/backend/package.json) | Added `js-yaml`, `multer`, their `@types/`, and `import` npm script. |
| [tsconfig.json](file:///home/ganeshak11/dev/CI-CD_SENTINEL/backend/tsconfig.json) | Created proper TypeScript config (was empty). |

### New Files

| File | Purpose |
|---|---|
| [service.routes.ts](file:///home/ganeshak11/dev/CI-CD_SENTINEL/backend/src/routes/service.routes.ts) | REST API for Service Registry: `GET/POST /api/services`, `POST /api/services/import`, `DELETE /api/services/:id` |
| [cli/import.ts](file:///home/ganeshak11/dev/CI-CD_SENTINEL/backend/src/cli/import.ts) | Bulk import CLI: `npm run import -- --file sentinel-services.yml` |
| [sentinel-services.example.yml](file:///home/ganeshak11/dev/CI-CD_SENTINEL/sentinel-services.example.yml) | Example YAML config for the team |

---

## Key Design Decisions

### Repo identification: `org/repo` format
All `repoUrl` fields store the GitHub `repository.full_name` (e.g. `ganeshak11/CI-CD_Sentinel`), not full URLs. `findServicesByRepo()` does an **exact match** on this field — robust and unambiguous.

### Bulk import: single transaction
`bulkCreateServices()` runs in one Neo4j transaction with two passes:
1. MERGE all Service nodes (idempotent)
2. MERGE all DEPENDS_ON relationships

If anything fails, the entire transaction rolls back — no partial imports.

### Zod validation on service creation
Both the REST API and CLI validate input with Zod schemas that enforce:
- `org/repo` regex pattern on the repo field
- Valid URL on health endpoint
- Valid enum values for environment and rollback strategy

---

## How to verify

```bash
# 1. Install new dependencies
cd backend && npm install

# 2. Verify TypeScript compiles
npx tsc --noEmit

# 3. Start the stack
docker compose up -d

# 4. Test the CLI
npm run import -- --file ../sentinel-services.example.yml

# 5. Test the API
curl http://localhost:3001/api/services
curl -X POST http://localhost:3001/api/services \
  -H "Content-Type: application/json" \
  -d '{"name":"test-svc","repoUrl":"ganeshak11/test-repo","healthEndpoint":"http://localhost:3001/ping"}'

# 6. Check Neo4j browser
open http://localhost:7474
# Run: MATCH (s:Service) RETURN s
```
