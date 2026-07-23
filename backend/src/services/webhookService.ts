import * as graphService from './graphService';
import { getChangedFiles } from './github.service';
import { fetchLogs } from './logFetchJob';
import { analyzeLog } from './rcaService';
import {
  CreateDeploymentInput,
  CreateCommitInput,
  DeploymentConclusion,
  Service,
} from '../types/deployment.types';

/**
 * Simple glob matcher to match file path against glob pattern.
 * Supports * (single level match) and ** (multi-level match).
 */
export function matchGlob(filePath: string, pattern: string): boolean {
  if (!pattern || pattern.trim() === '') {
    return true; // Empty path filter matches everything
  }

  // Standardize paths to use forward slashes
  const cleanPath = filePath.replace(/\\/g, '/');
  let cleanPattern = pattern.replace(/\\/g, '/');

  // Strip leading "./" if present
  if (cleanPattern.startsWith('./')) {
    cleanPattern = cleanPattern.substring(2);
  }

  // Convert glob to regex
  const escapedPattern = cleanPattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex characters except *, ?
    .replace(/\*\*/g, '@@')               // temporarily replace **
    .replace(/\*/g, '[^/]*')              // replace * with match within folder
    .replace(/@@/g, '.*');                // replace ** with match across folders

  const regex = new RegExp(`^${escapedPattern}$`);
  return regex.test(cleanPath);
}

/**
 * Handle incoming workflow_run webhook payload.
 * Evaluates repository services and handles microservice or monorepo path routing.
 */
export async function handleWorkflowRun(payload: any): Promise<{ message: string }> {
  if (!payload || !payload.workflow_run || !payload.repository) {
    throw new Error('Invalid webhook payload: missing workflow_run or repository');
  }

  const { workflow_run: workflowRun, repository } = payload;
  const repoFullName = repository.full_name;
  const repoUrl = repository.html_url;

  const workflowRunId = workflowRun.id;
  const workflowName = workflowRun.name || 'CI/CD Pipeline';
  const branch = workflowRun.head_branch;
  const commitSha = workflowRun.head_sha;
  const statusRaw = workflowRun.status;
  const conclusionRaw = workflowRun.conclusion;
  const triggeredBy = workflowRun.actor?.login || 'unknown';
  const startedAt = workflowRun.created_at || new Date().toISOString();
  
  // Set completedAt only if the run status is completed
  const completedAt = statusRaw === 'completed' 
    ? (workflowRun.updated_at || new Date().toISOString()) 
    : null;

  console.log(`[webhookService] Processing workflow_run ${workflowRunId} (${statusRaw}) for repository ${repoFullName}`);

  // Find all services registered to this repository URL
  const services = await graphService.findServicesByRepo(repoFullName);

  if (services.length === 0) {
    console.log(`[webhookService] Repo ${repoFullName} is not registered. Skipping.`);
    return { message: 'Repository not registered in Service Registry. Skipped.' };
  }

  let matchedServices: Service[] = [];

  if (services.length === 1) {
    // Microservice path: 1 service registered
    matchedServices = services;
    console.log(`[webhookService] Microservice path matched for service: ${services[0].name}`);
  } else {
    // Monorepo path: N services registered
    console.log(`[webhookService] Monorepo path matched. Evaluating ${services.length} services...`);
    try {
      const changedFiles = await getChangedFiles(repoFullName, commitSha);
      console.log(`[webhookService] Commit ${commitSha} changed files:`, changedFiles);

      matchedServices = services.filter((service) => {
        if (!service.pathFilter || service.pathFilter.trim() === '') {
          console.log(`[webhookService] Service ${service.name} has no pathFilter. Matching by default.`);
          return true;
        }

        const isMatch = changedFiles.some((file) => matchGlob(file, service.pathFilter!));
        console.log(`[webhookService] Service ${service.name} pathFilter "${service.pathFilter}" matched: ${isMatch}`);
        return isMatch;
      });
    } catch (err: any) {
      console.error(`[webhookService] Failed to fetch changed files for monorepo routing: ${err.message}`);
      // Fallback: match services with empty pathFilters since we can't confirm file changes
      matchedServices = services.filter((service) => !service.pathFilter || service.pathFilter.trim() === '');
      console.log(`[webhookService] Fallback: matched ${matchedServices.length} service(s) with empty path filters.`);
    }
  }

  if (matchedServices.length === 0) {
    console.log(`[webhookService] No services matched the changed paths in monorepo. Skipping deployment creation.`);
    return { message: 'No service paths were matched. Skipped.' };
  }

  // Create/Merge deployment nodes for all matched services
  for (const service of matchedServices) {
    const deploymentInput: CreateDeploymentInput = {
      workflowRunId,
      workflowName,
      branch,
      status: statusRaw === 'completed' ? 'completed' : 'in_progress',
      conclusion: (conclusionRaw as DeploymentConclusion) ?? null,
      triggeredBy,
      startedAt,
      completedAt,
      serviceId: service.id,
      commitSha,
    };

    console.log(`[webhookService] Merging deployment for service ${service.name}...`);
    await graphService.createDeployment(deploymentInput);
  }

  // Create commit node and link it to all created deployments (linked via workflowRunId)
  const commitInput: CreateCommitInput = {
    sha: commitSha,
    message: workflowRun.head_commit?.message || `Commit ${commitSha}`,
    author: workflowRun.head_commit?.author?.name || triggeredBy,
    authorEmail: workflowRun.head_commit?.author?.email || 'unknown@noreply.github.com',
    timestamp: workflowRun.head_commit?.timestamp || startedAt,
    repoUrl,
  };

  console.log(`[webhookService] Linking commit ${commitSha} to deployment(s) for run ${workflowRunId}...`);
  await graphService.createCommit(commitInput, workflowRunId);

  // ─── V2: RCA Pipeline (non-blocking on failure) ─────────────────────────────
  if (conclusionRaw === 'failure') {
    // Fire-and-forget: errors are caught and logged, never propagated
    (async () => {
      try {
        console.log(`[webhookService] Failure detected — starting RCA pipeline for run ${workflowRunId}`);

        // Step 1: Fetch logs from GitHub Actions
        let logText = '';
        try {
          logText = await fetchLogs(repoFullName, workflowRunId);
          console.log(`[webhookService] Logs fetched successfully for run ${workflowRunId}`);
        } catch (logErr: any) {
          console.error(`[webhookService] Log fetch failed (non-fatal): ${logErr.message}`);
          // Continue — RCA can still detect patterns if we have partial logs
        }

        // Step 2: Run RCA analysis on log text
        if (logText) {
          const patterns = analyzeLog(logText);
          console.log(`[webhookService] RCA found ${patterns.length} error pattern(s) for run ${workflowRunId}`);

          // Step 3: Create ErrorPattern nodes for each matched service deployment
          for (const service of matchedServices) {
            // Find the deployment ID for this service's deployment
            const deployments = await graphService.getDeployments(service.id, 1, 0);
            const deployment = deployments[0];
            if (!deployment) continue;

            for (const pattern of patterns) {
              try {
                await graphService.createErrorPattern(deployment.id, pattern);
              } catch (patternErr: any) {
                console.error(`[webhookService] Failed to create error pattern: ${patternErr.message}`);
              }
            }
          }
        }

        // Step 4: Record changed files from the commit
        try {
          const changedFiles = await getChangedFiles(repoFullName, commitSha);
          for (const filePath of changedFiles) {
            try {
              await graphService.createFileChange(commitSha, filePath, 'modified');
            } catch (fileErr: any) {
              console.error(`[webhookService] Failed to create file change node: ${fileErr.message}`);
            }
          }
          console.log(`[webhookService] Recorded ${changedFiles.length} file change(s) for commit ${commitSha}`);
        } catch (filesErr: any) {
          console.error(`[webhookService] Failed to fetch changed files (non-fatal): ${filesErr.message}`);
        }
      } catch (rcaErr: any) {
        console.error(`[webhookService] RCA pipeline error (non-fatal): ${rcaErr.message}`);
      }
    })();
  }

  const matchedNames = matchedServices.map((s) => s.name).join(', ');
  return { message: `Successfully registered deployment for services: [${matchedNames}]` };
}
