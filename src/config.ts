import { existsSync } from "node:fs";
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
 */
export async function saveConfig(
  config: ProjectConfig,
  dir: string = process.cwd()
): Promise<void> {
  const configPath = getConfigPath(dir);
  const normalizedConfig: ProjectConfig = {
    ...config,
    format:
      config.format ||
      (config.formats && config.formats.length > 0 ? config.formats[0] : undefined),
    formats: config.formats || (config.format ? [config.format] : undefined),
  };
  await Bun.write(configPath, JSON.stringify(normalizedConfig, null, 2) + "\n");
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

