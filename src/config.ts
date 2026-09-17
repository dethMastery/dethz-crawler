import path from "node:path";
import type { AgentFormat, ProjectConfig } from "./types.ts";

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
    return JSON.parse(content) as ProjectConfig;
  } catch {
    return {};
  }
}

/**
 * Save project configuration to `.agentrc.json` using Bun.write.
 */
export async function saveConfig(
  config: ProjectConfig,
  dir: string = process.cwd()
): Promise<void> {
  const configPath = getConfigPath(dir);
  await Bun.write(configPath, JSON.stringify(config, null, 2) + "\n");
}

/**
 * Auto-detect the project's preferred agent format by checking directory structure.
 */
export async function detectProjectFormat(
  dir: string = process.cwd()
): Promise<AgentFormat> {
  // Check for .agent (universal format)
  const agentRules = Bun.file(path.resolve(dir, ".agent/rules"));
  const agentSkills = Bun.file(path.resolve(dir, ".agent/skills"));
  // In Bun, we can test exists() or check if directory exists
  try {
    const stat1 = await Bun.file(path.resolve(dir, ".agent")).exists();
    if (stat1) return "agent";
  } catch {}

  try {
    const stat2 = await Bun.file(path.resolve(dir, ".agents")).exists();
    if (stat2) return "agents";
  } catch {}

  try {
    const stat3 = await Bun.file(path.resolve(dir, ".cursor")).exists();
    if (stat3) return "cursor";
  } catch {}

  return "agent";
}
