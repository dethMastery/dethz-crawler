import type { GitHubTreeResponse, RepoInfo } from "./types.ts";

/**
 * Parse a GitHub repository specifier.
 * Supports:
 * - "owner/repo"
 * - "https://github.com/owner/repo"
 * - "github.com/owner/repo"
 * - "git@github.com:owner/repo.git"
 */
export function parseRepo(input: string): { owner: string; repo: string } {
  let cleaned = input.trim();

  // Strip git@github.com:
  if (cleaned.startsWith("git@github.com:")) {
    cleaned = cleaned.replace("git@github.com:", "");
  }

  // Strip https?://(www.)?github.com/
  cleaned = cleaned.replace(/^https?:\/\/(www\.)?github\.com\//, "");

  // Strip .git suffix
  cleaned = cleaned.replace(/\.git$/, "");

  // Strip trailing slashes
  cleaned = cleaned.replace(/\/+$/, "");

  const parts = cleaned.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new Error(
      `Invalid repository format "${input}". Expected "owner/repo" or "https://github.com/owner/repo"`
    );
  }

  return {
    owner: parts[0]!,
    repo: parts[1]!,
  };
}

/**
 * Retrieve GitHub Auth token if available.
 * Checks environment variables first, then asks `gh auth token` via Bun.$.
 */
export async function getAuthToken(): Promise<string | undefined> {
  const envToken =
    process.env["GITHUB_TOKEN"] ||
    process.env["GH_TOKEN"] ||
    process.env["GITHUB_PAT"];

  if (envToken && envToken.trim()) {
    return envToken.trim();
  }

  try {
    const ghOutput = await Bun.$`gh auth token`.quiet().text();
    const token = ghOutput.trim();
    if (token) {
      return token;
    }
  } catch {
    // gh CLI not installed or not authenticated; proceed unauthenticated
  }

  return undefined;
}

/**
 * Get headers for GitHub API requests.
 */
function getHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": "crawler-cli/0.1.0",
    Accept: "application/vnd.github.v3+json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return headers;
}

/**
 * Fetch default branch for a repository.
 */
export async function getDefaultBranch(
  owner: string,
  repo: string,
  token?: string
): Promise<string> {
  const url = `https://api.github.com/repos/${owner}/${repo}`;
  const res = await fetch(url, { headers: getHeaders(token) });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(
        `Repository "${owner}/${repo}" not found or is private without sufficient permissions.`
      );
    }
    if (res.status === 403 || res.status === 429) {
      throw new Error(
        `GitHub API rate limit exceeded. Set GITHUB_TOKEN or authenticate via 'gh auth login'.`
      );
    }
    // Fall back to main
    return "main";
  }

  const data = (await res.json()) as { default_branch?: string };
  return data.default_branch || "main";
}

/**
 * Fetch git tree recursively from GitHub.
 */
export async function getRepoTree(
  owner: string,
  repo: string,
  branch: string,
  token?: string
): Promise<GitHubTreeResponse> {
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
  const res = await fetch(url, { headers: getHeaders(token) });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(
        `Branch or ref "${branch}" not found in repository "${owner}/${repo}".`
      );
    }
    if (res.status === 403 || res.status === 429) {
      throw new Error(
        `GitHub API rate limit exceeded. Please authenticate with 'gh auth login' or provide GITHUB_TOKEN.`
      );
    }
    const errorText = await res.text();
    throw new Error(`Failed to fetch tree from GitHub (${res.status}): ${errorText}`);
  }

  return (await res.json()) as GitHubTreeResponse;
}

/**
 * Fetch raw file content from GitHub.
 * Handles both public raw endpoint and authenticated GitHub API contents for private repos.
 */
export async function fetchRawFile(
  owner: string,
  repo: string,
  branch: string,
  filePath: string,
  token?: string
): Promise<string> {
  // If token is present, use contents API with raw header to support private repositories
  if (token) {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;
    const res = await fetch(apiUrl, {
      headers: {
        ...getHeaders(token),
        Accept: "application/vnd.github.raw+json",
      },
    });

    if (res.ok) {
      return await res.text();
    }
  }

  // Try raw.githubusercontent.com
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(rawUrl, { headers });
  if (!res.ok) {
    throw new Error(
      `Failed to download file "${filePath}" from ${owner}/${repo}@${branch} (${res.status} ${res.statusText})`
    );
  }

  return await res.text();
}
