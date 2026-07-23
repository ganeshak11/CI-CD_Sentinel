/**
 * logFetchJob.ts — GitHub Actions Log Fetcher
 *
 * Fetches workflow run logs from the GitHub API, extracts them from the
 * ZIP response, and caches the last 500 lines in Redis.
 *
 * GitHub API: GET /repos/{owner}/{repo}/actions/runs/{run_id}/logs
 * Response: ZIP archive containing .txt log files
 *
 * Retry strategy: exponential backoff (max 3 attempts)
 * Cache: Redis key `logs:{workflowRunId}`, TTL 1 hour
 */

import axios from 'axios';
import AdmZip from 'adm-zip';
import { redis } from './redisClient';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000; // 2 seconds
const LOG_LINES_LIMIT = 500;
const LOG_TTL_SECONDS = 3600; // 1 hour

/**
 * Fetch workflow run logs from GitHub, extract from ZIP, cache in Redis.
 *
 * @param repoFullName — org/repo format (e.g. "ganeshak11/CI-CD_Sentinel")
 * @param workflowRunId — GitHub workflow run ID
 * @returns The concatenated log text (last 500 lines)
 * @throws Error if all retries are exhausted
 */
export async function fetchLogs(
  repoFullName: string,
  workflowRunId: number
): Promise<string> {
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    throw new Error('[logFetchJob] GITHUB_TOKEN is not set. Cannot fetch logs.');
  }

  const url = `https://api.github.com/repos/${repoFullName}/actions/runs/${workflowRunId}/logs`;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(
        `[logFetchJob] Fetching logs for ${repoFullName} run ${workflowRunId} (attempt ${attempt}/${MAX_RETRIES})`
      );

      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'CI-CD-Sentinel-Backend',
        },
        responseType: 'arraybuffer',
        timeout: 30000, // 30 second timeout
        maxRedirects: 5,
      });

      // Extract text from the ZIP archive
      const logText = extractLogsFromZip(response.data);

      // Keep only the last 500 lines
      const lines = logText.split('\n');
      const trimmedLines = lines.slice(-LOG_LINES_LIMIT);
      const trimmedText = trimmedLines.join('\n');

      // Cache in Redis
      const redisKey = `logs:${workflowRunId}`;
      await redis.set(redisKey, trimmedText, 'EX', LOG_TTL_SECONDS);

      console.log(
        `[logFetchJob] Cached ${trimmedLines.length} log lines for run ${workflowRunId} (TTL ${LOG_TTL_SECONDS}s)`
      );

      return trimmedText;
    } catch (err: any) {
      lastError = err;
      console.warn(
        `[logFetchJob] Attempt ${attempt}/${MAX_RETRIES} failed for run ${workflowRunId}: ${err.message}`
      );

      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`[logFetchJob] Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  throw new Error(
    `[logFetchJob] Failed to fetch logs after ${MAX_RETRIES} attempts: ${lastError?.message}`
  );
}

/**
 * Extract and concatenate all .txt log files from a ZIP buffer.
 */
function extractLogsFromZip(zipBuffer: Buffer): string {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();

  const logTexts: string[] = [];

  for (const entry of entries) {
    // Only process .txt files (GitHub Actions log files)
    if (!entry.isDirectory && entry.entryName.endsWith('.txt')) {
      const content = entry.getData().toString('utf-8');
      logTexts.push(content);
    }
  }

  if (logTexts.length === 0) {
    console.warn('[logFetchJob] No .txt log files found in ZIP archive');
    return '';
  }

  console.log(`[logFetchJob] Extracted ${logTexts.length} log file(s) from ZIP`);
  return logTexts.join('\n');
}

/**
 * Read cached logs from Redis.
 *
 * @param workflowRunId — the workflow run ID to look up
 * @returns The cached log text, or null if not in cache
 */
export async function getCachedLogs(workflowRunId: number): Promise<string | null> {
  const redisKey = `logs:${workflowRunId}`;
  return redis.get(redisKey);
}

/**
 * Promisified sleep for retry backoff.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
