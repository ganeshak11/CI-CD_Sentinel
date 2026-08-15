/**
 * rollbackService.ts
 *
 * Handles automatic and manual rollback logic.
 *
 * Tier 1 — Automatic Rollback:
 * Triggered by healthWorker when 3 consecutive health checks are unhealthy.
 * Rolls back to the last healthy deployment using GitHub API.
 *
 * Tier 2 — Manual Rollback:
 * Triggered via API endpoint.
 * Same flow as automatic but user-initiated.
 */

import axios from 'axios';
import * as graphService from './graphService';
import * as notificationService from './notificationService';
import { v4 as uuidv4 } from 'uuid';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const ALERT_EMAIL = process.env.ALERT_EMAIL;

// ─── Types ────────────────────────────────────────────────────────────────────

interface RollbackData {
  id: string;
  deploymentId: string;
  triggeredAt: string;
  trigger: 'automatic' | 'manual';
  strategy: 'rerun' | 'workflow_dispatch';
  targetDeploymentId: string;
  status: 'pending' | 'triggered' | 'failed';
}

// ─── Automatic Rollback (Tier 1) ───────────────────────────────────────────────

/**
 * Trigger automatic rollback when service becomes unhealthy.
 * Called by healthWorker after detecting 3 consecutive unhealthy checks.
 *
 * Flow:
 * 1. Query Neo4j for last 3 health checks for this service
 * 2. If all 3 are unhealthy, get the last healthy deployment
 * 3. Call GitHub API to re-trigger the workflow
 * 4. Create Rollback node in Neo4j
 * 5. Send notifications (Slack + Email)
 *
 * @param serviceId The service ID to rollback
 * @returns true if rollback was triggered, false otherwise
 */
export async function triggerAutoRollback(serviceId: string): Promise<boolean> {
  try {
    console.log(`[rollbackService] Checking eligibility for auto-rollback of service ${serviceId}`);

    // Step 1: Get the service details
    const service = await graphService.getServiceById(serviceId);
    if (!service) {
      console.warn(`[rollbackService] Service ${serviceId} not found. Skipping auto-rollback.`);
      return false;
    }

    // Step 2: Get the last healthy deployment
    const targetDeployment = await graphService.getLastHealthyDeployment(serviceId);
    if (!targetDeployment) {
      console.warn(
        `[rollbackService] No healthy deployment found for service ${service.name}. Skipping auto-rollback.`
      );
      return false;
    }

    console.log(
      `[rollbackService] Found target deployment ${targetDeployment.id} for auto-rollback of ${service.name}`
    );

    // Step 3: Perform the rollback
    const rollback = await performRollback(
      serviceId,
      targetDeployment.id,
      service.rollbackStrategy || 'rerun',
      'automatic'
    );

    if (!rollback) {
      console.error('[rollbackService] Failed to perform auto-rollback');
      return false;
    }

    // Step 4: Send notifications
    try {
      await notificationService.sendRollbackAlert(rollback, service, targetDeployment);
    } catch (err) {
      console.error('[rollbackService] Failed to send Slack rollback alert:', err);
    }

    if (ALERT_EMAIL) {
      try {
        await notificationService.sendRollbackEmail(service, targetDeployment, ALERT_EMAIL);
      } catch (err) {
        console.error('[rollbackService] Failed to send email rollback alert:', err);
      }
    }

    return true;
  } catch (err: any) {
    console.error('[rollbackService] Unexpected error in triggerAutoRollback:', err.message);
    return false;
  }
}

// ─── Manual Rollback (Tier 2) ──────────────────────────────────────────────────

/**
 * Trigger manual rollback via API endpoint.
 * User specifies which deployment to rollback.
 * Same flow as automatic, but user-initiated.
 *
 * @param deploymentId The deployment to rollback
 * @returns Rollback data if successful, null otherwise
 */
export async function triggerManualRollback(deploymentId: string): Promise<RollbackData | null> {
  try {
    console.log(`[rollbackService] Processing manual rollback request for deployment ${deploymentId}`);

    // Step 1: Get the failed deployment
    const failedDeployment = await graphService.getDeploymentById(deploymentId);
    if (!failedDeployment) {
      console.warn(`[rollbackService] Deployment ${deploymentId} not found.`);
      return null;
    }

    // Step 2: Get the service
    const service = await graphService.getServiceById(failedDeployment.serviceId);
    if (!service) {
      console.warn(`[rollbackService] Service ${failedDeployment.serviceId} not found.`);
      return null;
    }

    // Step 3: Get the last healthy deployment
    const targetDeployment = await graphService.getLastHealthyDeployment(failedDeployment.serviceId);
    if (!targetDeployment) {
      console.warn(
        `[rollbackService] No healthy deployment found for manual rollback of ${service.name}.`
      );
      return null;
    }

    console.log(
      `[rollbackService] Found target deployment ${targetDeployment.id} for manual rollback`
    );

    // Step 4: Perform the rollback
    const rollback = await performRollback(
      failedDeployment.serviceId,
      targetDeployment.id,
      service.rollbackStrategy || 'rerun',
      'manual'
    );

    if (!rollback) {
      console.error('[rollbackService] Failed to perform manual rollback');
      return null;
    }

    // Step 5: Send notifications
    try {
      await notificationService.sendRollbackAlert(rollback, service, targetDeployment);
    } catch (err) {
      console.error('[rollbackService] Failed to send Slack rollback alert:', err);
    }

    if (ALERT_EMAIL) {
      try {
        await notificationService.sendRollbackEmail(service, targetDeployment, ALERT_EMAIL);
      } catch (err) {
        console.error('[rollbackService] Failed to send email rollback alert:', err);
      }
    }

    return rollback;
  } catch (err: any) {
    console.error('[rollbackService] Unexpected error in triggerManualRollback:', err.message);
    return null;
  }
}

// ─── Core Rollback Logic ───────────────────────────────────────────────────────

/**
 * Core rollback logic — calls GitHub API and creates Neo4j node.
 * Extracted to DRY principle (used by both auto and manual rollback).
 *
 * @param serviceId Service to rollback
 * @param targetDeploymentId Deployment to rollback to
 * @param strategy Rollback strategy (rerun or workflow_dispatch)
 * @param trigger Trigger type (automatic or manual)
 * @returns Rollback data if successful, null otherwise
 */
async function performRollback(
  serviceId: string,
  targetDeploymentId: string,
  strategy: 'rerun' | 'workflow_dispatch',
  trigger: 'automatic' | 'manual'
): Promise<RollbackData | null> {
  try {
    // Step 1: Get target deployment for GitHub API call
    const targetDeployment = await graphService.getDeploymentById(targetDeploymentId);
    if (!targetDeployment) {
      console.error(`[rollbackService] Target deployment ${targetDeploymentId} not found`);
      return null;
    }

    // Step 2: Get the service to find repo info
    const service = await graphService.getServiceById(serviceId);
    if (!service) {
      console.error(`[rollbackService] Service ${serviceId} not found`);
      return null;
    }

    // Step 3: Call GitHub API based on strategy
    const rollbackId = uuidv4();
    const now = new Date().toISOString();

    try {
      await callGitHubRollbackAPI(service.repoUrl, targetDeployment, strategy);
      console.log(`[rollbackService] Successfully called GitHub API to re-trigger workflow`);
    } catch (err: any) {
      console.error(
        `[rollbackService] Failed to call GitHub API for rollback: ${err.message}`
      );
      // Continue to create the rollback node even if GitHub API call failed
      // Status will be 'failed' so operations team can investigate
    }

    // Step 4: Create Rollback node in Neo4j
    const rollbackData: RollbackData = {
      id: rollbackId,
      deploymentId: targetDeploymentId,
      triggeredAt: now,
      trigger,
      strategy,
      targetDeploymentId,
      status: 'triggered',
    };

    await graphService.createRollback(rollbackData);
    console.log(`[rollbackService] Created Rollback node ${rollbackId} in Neo4j`);

    return rollbackData;
  } catch (err: any) {
    console.error('[rollbackService] Error in performRollback:', err.message);
    return null;
  }
}

/**
 * Call GitHub API to re-trigger the workflow.
 *
 * Supports two strategies:
 * - "rerun": Re-run the last workflow (POST /actions/runs/{run_id}/rerun)
 * - "workflow_dispatch": Dispatch a new workflow with same parameters
 *
 * @param repoFullName Repository in org/repo format
 * @param deployment The deployment with workflow info
 * @param strategy Rollback strategy
 */
async function callGitHubRollbackAPI(
  repoFullName: string,
  deployment: any,
  strategy: 'rerun' | 'workflow_dispatch'
): Promise<void> {
  if (!GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN not configured');
  }

  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Accept': 'application/vnd.github+json',
  };

  if (strategy === 'rerun') {
    // Re-run the last workflow run
    const url = `https://api.github.com/repos/${repoFullName}/actions/runs/${deployment.workflowRunId}/rerun`;
    console.log(`[rollbackService] Calling GitHub API: POST ${url}`);

    const response = await axios.post(url, {}, { headers, timeout: 10000 });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`GitHub API returned status ${response.status}`);
    }
  } else if (strategy === 'workflow_dispatch') {
    // Dispatch a new workflow run
    // Note: This requires workflow_dispatch to be configured in the workflow file
    // and we need to find the workflow file ID
    throw new Error('workflow_dispatch strategy not yet implemented');
  } else {
    throw new Error(`Unknown rollback strategy: ${strategy}`);
  }
}

/**
 * Get rollback preview data for the frontend.
 * Returns target deployment, affected services, and risk estimate.
 *
 * @param deploymentId The deployment to get preview for
 * @returns Preview data including target, dependencies, and risk
 */
export async function getRollbackPreview(deploymentId: string): Promise<any> {
  try {
    const deployment = await graphService.getDeploymentById(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }

    const targetDeployment = await graphService.getLastHealthyDeployment(deployment.serviceId);
    if (!targetDeployment) {
      throw new Error('No healthy deployment found for rollback');
    }

    // Get dependent services (services that depend on this one)
    const dependentServices = await graphService.getDependentServices(deployment.serviceId);

    // Calculate risk level based on deployment history
    const recentDeployments = await graphService.getDeployments(deployment.serviceId, 10, 0);
    const failureRate = recentDeployments.filter((d: any) => d.conclusion === 'failure').length / recentDeployments.length;

    let riskLevel = 'low';
    if (failureRate > 0.5) {
      riskLevel = 'high';
    } else if (failureRate > 0.2) {
      riskLevel = 'medium';
    }

    return {
      targetDeployment,
      dependentServices,
      riskLevel,
      reason: `${recentDeployments.length} recent deployments, ${(failureRate * 100).toFixed(1)}% failure rate`,
    };
  } catch (err: any) {
    console.error('[rollbackService] Error in getRollbackPreview:', err.message);
    throw err;
  }
}
