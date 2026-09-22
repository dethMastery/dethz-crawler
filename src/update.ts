import os from "node:os";
import path from "node:path";
import { c } from "./ui.ts";
import { PACKAGE_NAME, VERSION } from "./version.ts";

export interface UpdateInfo {
  hasUpdate: boolean;
  current: string;
  latest: string;
}

export interface UpdateCache {
  lastChecked: number;
  latestVersion: string;
}

export const CHECK_INTERVAL_MS = 1000 * 60 * 60 * 12; // 12 hours
export const NPM_REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;
export const CACHE_FILE = path.join(os.homedir(), ".dethz-crawler-update.json");

/**
 * Compare two semver strings (e.g. "0.2.1" > "0.2.0").
 * Returns true if v1 is strictly greater than v2.
 */
export function isNewerVersion(v1: string, v2: string): boolean {
  const p1 = v1.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const p2 = v2.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);

  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return true;
    if (num1 < num2) return false;
  }
  return false;
}

/**
 * Fetch the latest version from npm registry with a short timeout.
 */
export async function fetchLatestVersion(
  timeoutMs = 2000,
  url = NPM_REGISTRY_URL
): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return data.version || null;
  } catch {
    return null;
  }
}

/**
 * Load cached update info.
 */
export async function loadCache(cachePath = CACHE_FILE): Promise<UpdateCache | null> {
  try {
    const file = Bun.file(cachePath);
    if (!(await file.exists())) return null;
    const text = await file.text();
    return JSON.parse(text) as UpdateCache;
  } catch {
    return null;
  }
}

/**
 * Save update info to cache.
 */
export async function saveCache(
  cache: UpdateCache,
  cachePath = CACHE_FILE
): Promise<void> {
  try {
    await Bun.write(cachePath, JSON.stringify(cache) + "\n");
  } catch {
    // Non-critical: ignore cache write errors
  }
}

/**
 * Check if an update is available for dethz-crawler.
 * Uses cached result if checked within CHECK_INTERVAL_MS, unless force = true.
 */
export async function checkPackageUpdate(
  currentVersion = VERSION,
  force = false,
  cachePath = CACHE_FILE
): Promise<UpdateInfo | null> {
  try {
    const now = Date.now();
    const cache = await loadCache(cachePath);

    let latestVersion = cache?.latestVersion;

    if (force || !cache || now - cache.lastChecked > CHECK_INTERVAL_MS) {
      const fetched = await fetchLatestVersion();
      if (fetched) {
        latestVersion = fetched;
        await saveCache({ lastChecked: now, latestVersion: fetched }, cachePath);
      }
    }

    if (!latestVersion) return null;

    const hasUpdate = isNewerVersion(latestVersion, currentVersion);
    return {
      hasUpdate,
      current: currentVersion,
      latest: latestVersion,
    };
  } catch {
    return null;
  }
}

/**
 * Display update notification banner.
 */
export function displayUpdateNotification(update: UpdateInfo): void {
  console.log("");
  console.log(c.yellow("╭────────────────────────────────────────────────────────────╮"));
  console.log(
    `  ${c.yellow("⚡")} ${c.bold("Update available:")} ${c.dim(update.current)} → ${c.green(c.bold(update.latest))}`
  );
  console.log(`  Run ${c.cyan("bun add -g " + PACKAGE_NAME)} to update`);
  console.log(`  Or use: ${c.dim("bunx " + PACKAGE_NAME + "@latest")}`);
  console.log(c.yellow("╰────────────────────────────────────────────────────────────╯"));
  console.log("");
}
