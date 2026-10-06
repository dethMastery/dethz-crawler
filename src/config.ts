import { existsSync } from "node:fs";
import path from "node:path";
import type { AgentFormat, InstalledItemRef, ProjectConfig } from "./types.ts";

const CONFIG_FILE = ".agentrc.json";

/**
 * Locate the configuration file in the project.
 */
export function getConfigPath(dir: string = process.cwd()): string {
  return path.resolve(dir, CONFIG_FILE);
}

/**
 * Load project configuration from `.agentrc.json` using Bun.file.
 */
export async function loadConfig(dir: string = process.cwd()): Promise<ProjectConfig> {
  const configPath = getConfigPath(dir);
  const file = Bun.file(configPath);

  if (!(await file.exists())) {
    return {};
  }

  try {
    const content = await file.text();
    const parsed = JSON.parse(content) as ProjectConfig;
    if (parsed.format && !parsed.formats) {
      parsed.formats = [parsed.format];
    } else if (parsed.formats && !parsed.format && parsed.formats.length > 0) {
      parsed.format = parsed.formats[0];
    }
    return parsed;
  } catch {
    return {};
  }
}

/**
 * Save project configuration to `.agentrc.json` using Bun.write.
 * Keeps only non-empty, non-redundant properties.
 */
export async function saveConfig(
  config: ProjectConfig,
  dir: string = process.cwd()
): Promise<void> {
  const configPath = getConfigPath(dir);
  const formats =
    config.formats || (config.format ? [config.format] : undefined);

  const cleanConfig: Record<string, unknown> = {};

  if (formats && formats.length > 0) {
    cleanConfig.formats = formats;
  } else if (config.format) {
    cleanConfig.format = config.format;
  }

  if (config.repo) {
    cleanConfig.repo = config.repo;
  }
  if (config.branch) {
    cleanConfig.branch = config.branch;
  }
  if (config.installedRules && config.installedRules.length > 0) {
    cleanConfig.installedRules = config.installedRules;
  }
  if (config.installedSkills && config.installedSkills.length > 0) {
    cleanConfig.installedSkills = config.installedSkills;
  }

  await Bun.write(configPath, JSON.stringify(cleanConfig, null, 2) + "\n");
}

/**
 * Parse an installed item string in the format:
 * [<rules / skill>]/<user / org>/<repo>:<branch or commit>/<file or folder>
 * E.g.:
 * - "rules/kizuna-inc/kz-rule:99521e5/rules/version-bump.md"
 * - "skill/kizuna-inc/kz-skill:7bcb366/skills/workspace-allow"
 */
export function parseInstalledItem(entry: string): InstalledItemRef | null {
  const match = entry.match(/^(rules|skill)\/([^/]+)\/([^:]+):([^/]+)\/(.+)$/);
  if (!match || !match[1] || !match[2] || !match[3] || !match[4] || !match[5]) {
    return null;
  }
  const type = match[1] as "rules" | "skill";
  const owner = match[2];
  const repo = match[3];
  const ref = match[4];
  const itemPath = match[5];
  const lastSegment = itemPath.split("/").pop() || itemPath;
  const name =
    type === "rules"
      ? lastSegment.replace(/\.(md|mdc)$/i, "")
      : lastSegment;
  return {
    type,
    owner,
    repo,
    ref,
    path: itemPath,
    name,
  };
}

/**
 * Format an installed rule entry string.
 * Format: rules/<owner>/<repo>:<ref>/<sourcePath>
 */
export function formatInstalledRule(
  owner: string,
  repo: string,
  ref: string,
  sourcePath: string
): string {
  const cleanPath = sourcePath.replace(/^\/+/, "");
  return `rules/${owner}/${repo}:${ref}/${cleanPath}`;
}

/**
 * Format an installed skill entry string.
 * Format: skill/<owner>/<repo>:<ref>/<folder>
 */
export function formatInstalledSkill(
  owner: string,
  repo: string,
  ref: string,
  baseDir: string,
  skillName: string
): string {
  const folder = baseDir && baseDir.trim() ? baseDir.trim() : `skills/${skillName}`;
  const cleanFolder = folder.replace(/^\/+/, "");
  return `skill/${owner}/${repo}:${ref}/${cleanFolder}`;
}

/**
 * Merge installed entries, updating existing items with the same item name.
 */
export function mergeInstalledEntries(
  existingEntries: string[] = [],
  newEntries: string[]
): string[] {
  const map = new Map<string, string>();
  for (const entry of existingEntries) {
    const parsed = parseInstalledItem(entry);
    const key = parsed ? `${parsed.type}:${parsed.name}` : entry;
    map.set(key, entry);
  }
  for (const entry of newEntries) {
    const parsed = parseInstalledItem(entry);
    const key = parsed ? `${parsed.type}:${parsed.name}` : entry;
    map.set(key, entry);
  }
  return Array.from(map.values());
}

/**
 * Extract all unique repos (owner/repo) from installed items in the config.
 */
export function getInstalledRepos(config: ProjectConfig): string[] {
  const repos = new Set<string>();
  if (config.repo) {
    repos.add(config.repo);
  }
  for (const entry of config.installedRules || []) {
    const parsed = parseInstalledItem(entry);
    if (parsed) repos.add(`${parsed.owner}/${parsed.repo}`);
  }
  for (const entry of config.installedSkills || []) {
    const parsed = parseInstalledItem(entry);
    if (parsed) repos.add(`${parsed.owner}/${parsed.repo}`);
  }
  return Array.from(repos);
}

/**
 * Remove items from installedRules array by name or entry string.
 */
export function removeInstalledRules(
  entries: string[] = [],
  namesToRemove: string[]
): string[] {
  const targets = namesToRemove.map((n) => n.toLowerCase());
  return entries.filter((entry) => {
    const parsed = parseInstalledItem(entry);
    const name = parsed ? parsed.name.toLowerCase() : entry.toLowerCase();
    return !targets.includes(name) && !targets.includes(entry.toLowerCase());
  });
}

/**
 * Remove items from installedSkills array by name or entry string.
 */
export function removeInstalledSkills(
  entries: string[] = [],
  namesToRemove: string[]
): string[] {
  const targets = namesToRemove.map((n) => n.toLowerCase());
  return entries.filter((entry) => {
    const parsed = parseInstalledItem(entry);
    const name = parsed ? parsed.name.toLowerCase() : entry.toLowerCase();
    return !targets.includes(name) && !targets.includes(entry.toLowerCase());
  });
}

/**
 * Auto-detect all agent formats present in the project.
 */
export function detectProjectFormats(
  dir: string = process.cwd()
): AgentFormat[] {
  const formats: AgentFormat[] = [];

  // Claude: .claude folder or CLAUDE.md file
  if (
    existsSync(path.resolve(dir, ".claude")) ||
    existsSync(path.resolve(dir, "CLAUDE.md"))
  ) {
    formats.push("claude");
  }

  // Cursor: .cursor folder or .cursorrules file
  if (
    existsSync(path.resolve(dir, ".cursor")) ||
    existsSync(path.resolve(dir, ".cursorrules"))
  ) {
    formats.push("cursor");
  }

  // Windsurf: .windsurf folder or .windsurfrules file
  if (
    existsSync(path.resolve(dir, ".windsurf")) ||
    existsSync(path.resolve(dir, ".windsurfrules"))
  ) {
    formats.push("windsurf");
  }

  // Copilot: .github/copilot-instructions.md or .github/instructions folder
  if (
    existsSync(path.resolve(dir, ".github/copilot-instructions.md")) ||
    existsSync(path.resolve(dir, ".github/instructions"))
  ) {
    formats.push("copilot");
  }

  // Cline: .cline folder or .clinerules file
  if (
    existsSync(path.resolve(dir, ".cline")) ||
    existsSync(path.resolve(dir, ".clinerules"))
  ) {
    formats.push("cline");
  }

  // Antigravity / Gemini: .agents folder or GEMINI.md file
  if (
    existsSync(path.resolve(dir, ".agents")) ||
    existsSync(path.resolve(dir, "GEMINI.md"))
  ) {
    formats.push("agents");
  }

  // Universal Agent: .agent folder or AGENTS.md file
  if (
    existsSync(path.resolve(dir, ".agent")) ||
    existsSync(path.resolve(dir, "AGENTS.md"))
  ) {
    formats.push("agent");
  }

  return formats;
}

/**
 * Auto-detect the project's primary agent format by checking directory structure.
 */
export async function detectProjectFormat(
  dir: string = process.cwd()
): Promise<AgentFormat> {
  const detected = detectProjectFormats(dir);
  return detected[0] || "agent";
}

