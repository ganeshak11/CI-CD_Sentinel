import axios from 'axios';

/**
 * Fetch the list of changed files for a specific commit SHA using the GitHub REST API.
 * GET /repos/{owner}/{repo}/commits/{sha}
 *
 * @param repoFullName E.g. "acme/payment-service"
 * @param sha Git commit SHA
 */
export async function getChangedFiles(repoFullName: string, sha: string): Promise<string[]> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'CI-CD-Sentinel-Backend',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `https://api.github.com/repos/${repoFullName}/commits/${sha}`;

  try {
    const response = await axios.get(url, { headers, timeout: 10000 });
    const files = response.data.files || [];
    return files.map((f: any) => f.filename);
  } catch (error: any) {
    console.error(
      `[github.service] Failed to fetch changed files for ${repoFullName}@${sha}:`,
      error.response?.data || error.message
    );
    throw new Error(`Failed to fetch commit details from GitHub API: ${error.message}`);
  }
}
