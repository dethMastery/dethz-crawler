import path from "node:path";
import { fetchRawFile } from "./github.ts";
import type {
  AgentFormat,
  PullOptions,
  PullResult,
  RuleItem,
  SkillItem,
} from "./types.ts";
import { c, info, success, warn, error } from "./ui.ts";

/**
 * Determine target directories for rules and skills based on format and targetDir.
 */
export function getTargetDirectories(
  baseDir: string,
  format: AgentFormat = "agent"
): { rulesDir: string; skillsDir: string } {
  switch (format) {
    case "agents":
      return {
        rulesDir: path.resolve(baseDir, ".agents/rules"),
        skillsDir: path.resolve(baseDir, ".agents/skills"),
      };
    case "cursor":
      return {
        rulesDir: path.resolve(baseDir, ".cursor/rules"),
        skillsDir: path.resolve(baseDir, ".cursor/skills"),
      };
    case "claude":
      return {
        rulesDir: path.resolve(baseDir, ".claude/rules"),
        skillsDir: path.resolve(baseDir, ".claude/skills"),
      };
    case "windsurf":
      return {
        rulesDir: path.resolve(baseDir, ".windsurf/rules"),
        skillsDir: path.resolve(baseDir, ".windsurf/skills"),
      };
    case "copilot":
      return {
        rulesDir: path.resolve(baseDir, ".github/instructions"),
        skillsDir: path.resolve(baseDir, ".github/skills"),
      };
    case "cline":
      return {
        rulesDir: path.resolve(baseDir, ".cline/rules"),
        skillsDir: path.resolve(baseDir, ".cline/skills"),
      };
    case "agent":
    default:
      return {
        rulesDir: path.resolve(baseDir, ".agent/rules"),
        skillsDir: path.resolve(baseDir, ".agent/skills"),
      };
  }
}

/**
 * Normalize rule filename based on target format.
 * Cursor expects .mdc, Universal / Antigravity / Claude expect .md.
 */
export function formatRuleFilename(
  originalFilename: string,
  format: AgentFormat
): string {
  // If it's a top-level rule like CLAUDE.md or AGENTS.md, keep it
  if (
    originalFilename === "CLAUDE.md" ||
    originalFilename === "AGENTS.md" ||
    originalFilename === "GEMINI.md" ||
    originalFilename === ".windsurfrules" ||
    originalFilename === ".clinerules" ||
    originalFilename === ".cursorrules"
  ) {
    return originalFilename;
  }

  const baseName = originalFilename.replace(/\.(md|mdc)$/i, "");
  if (format === "cursor") {
    return `${baseName}.mdc`;
  }
  return `${baseName}.md`;
}

/**
 * Determine the destination path for a rule given the format and root settings.
 */
function resolveRuleDestination(
  baseDir: string,
  rulesDir: string,
  filename: string,
  ruleName: string,
  format: AgentFormat,
  customTargetDir?: string
): string {
  if (customTargetDir) {
    return path.resolve(rulesDir, filename);
  }

  // Check if this is the native root instruction file for this format
  if (filename === "CLAUDE.md" && format === "claude") {
    return path.resolve(baseDir, "CLAUDE.md");
  }
  if (filename === "GEMINI.md" && format === "agents") {
    return path.resolve(baseDir, "GEMINI.md");
  }
  if (filename === "AGENTS.md" && (format === "agent" || format === "agents")) {
    return path.resolve(baseDir, "AGENTS.md");
  }
  if (filename === ".windsurfrules" && format === "windsurf") {
    return path.resolve(baseDir, ".windsurfrules");
  }
  if (filename === ".clinerules" && format === "cline") {
    return path.resolve(baseDir, ".clinerules");
  }
  if (filename === ".cursorrules" && format === "cursor") {
    return path.resolve(baseDir, ".cursorrules");
  }

  // If it was a root instruction file for ANOTHER format, put it in this format's rules dir
  const rootFiles = [
    "CLAUDE.md",
    "AGENTS.md",
    "GEMINI.md",
    ".windsurfrules",
    ".clinerules",
    ".cursorrules",
  ];
  if (rootFiles.includes(filename)) {
    const ext = format === "cursor" ? ".mdc" : ".md";
    return path.resolve(rulesDir, `${ruleName}${ext}`);
  }

  return path.resolve(rulesDir, filename);
}

/**
 * Pull selected rules and skills from GitHub to local disk across all specified formats.
 */
export async function pullItems(params: {
  owner: string;
  repo: string;
  branch: string;
  token?: string;
  rules: RuleItem[];
  skills: SkillItem[];
  options: PullOptions;
  projectRoot?: string;
}): Promise<PullResult> {
  const {
    owner,
    repo,
    branch,
    token,
    rules,
    skills,
    options,
    projectRoot = process.cwd(),
  } = params;

  const result: PullResult = {
    rulesPulled: [],
    skillsPulled: [],
    filesWritten: [],
    skipped: [],
    errors: [],
  };

  const formats: AgentFormat[] =
    options.formats && options.formats.length > 0
      ? options.formats
      : [options.format || "agent"];

  const baseDir = options.targetDir
    ? path.resolve(projectRoot, options.targetDir)
    : projectRoot;

  // Cache fetched contents in memory so multi-format pulls don't make redundant requests
  const contentCache = new Map<string, string>();

  async function getContent(sourcePath: string): Promise<string> {
    if (contentCache.has(sourcePath)) {
      return contentCache.get(sourcePath)!;
    }
    const content = await fetchRawFile(owner, repo, branch, sourcePath, token);
    contentCache.set(sourcePath, content);
    return content;
  }

  // 1. Pull Rules across all selected formats
  for (const rule of rules) {
    let rulePulledAny = false;

    for (const fmt of formats) {
      try {
        const { rulesDir } = options.targetDir
          ? { rulesDir: path.resolve(baseDir, "rules") }
          : getTargetDirectories(baseDir, fmt);

        const filename = formatRuleFilename(rule.filename, fmt);
        const destPath = resolveRuleDestination(
          baseDir,
          rulesDir,
          filename,
          rule.name,
          fmt,
          options.targetDir
        );

        const destFile = Bun.file(destPath);
        const exists = await destFile.exists();

        if (exists && !options.force) {
          result.skipped.push(`${fmt}:${rule.name}`);
          warn(
            `Skipped rule ${c.bold(rule.name)} for ${c.cyan(fmt)} (already exists, use --force to overwrite)`
          );
          continue;
        }

        if (options.dryRun) {
          info(`[DRY-RUN] Would write rule (${fmt}): ${destPath}`);
          rulePulledAny = true;
          result.filesWritten.push(destPath);
          continue;
        }

        const content = await getContent(rule.sourcePath);
        await Bun.write(destPath, content);
        rulePulledAny = true;
        result.filesWritten.push(destPath);
        success(
          `Pulled rule [${c.yellow(fmt)}]: ${c.cyan(rule.name)} -> ${c.dim(
            path.relative(projectRoot, destPath)
          )}`
        );
      } catch (err: any) {
        result.errors.push({
          item: `${fmt}:${rule.name}`,
          error: err.message || String(err),
        });
        error(`Failed to pull rule "${rule.name}" for ${fmt}: ${err.message}`);
      }
    }

    if (rulePulledAny && !result.rulesPulled.includes(rule.name)) {
      result.rulesPulled.push(rule.name);
    }
  }

  // 2. Pull Skills across all selected formats
  for (const skill of skills) {
    let skillPulledAny = false;

    for (const fmt of formats) {
      try {
        const { skillsDir } = options.targetDir
          ? { skillsDir: path.resolve(baseDir, "skills") }
          : getTargetDirectories(baseDir, fmt);

        const skillTargetDir = path.resolve(skillsDir, skill.name);
        let anyFileWrittenForFormat = false;

        for (const file of skill.files) {
          const destPath = path.resolve(skillTargetDir, file.relativePath);
          const destFile = Bun.file(destPath);
          const exists = await destFile.exists();

          if (exists && !options.force) {
            result.skipped.push(`${fmt}:${skill.name}/${file.relativePath}`);
            continue;
          }

          if (options.dryRun) {
            info(`[DRY-RUN] Would write skill file (${fmt}): ${destPath}`);
            result.filesWritten.push(destPath);
            anyFileWrittenForFormat = true;
            continue;
          }

          const content = await getContent(file.path);
          await Bun.write(destPath, content);
          result.filesWritten.push(destPath);
          anyFileWrittenForFormat = true;
        }

        if (anyFileWrittenForFormat) {
          skillPulledAny = true;
          success(
            `Pulled skill [${c.yellow(fmt)}]: ${c.cyan(skill.name)} (${
              skill.files.length
            } file${skill.files.length === 1 ? "" : "s"}) -> ${c.dim(
              path.relative(projectRoot, skillTargetDir)
            )}`
          );
        } else if (!options.force) {
          warn(
            `Skipped skill ${c.bold(skill.name)} for ${c.cyan(fmt)} (already exists, use --force to overwrite)`
          );
        }
      } catch (err: any) {
        result.errors.push({
          item: `${fmt}:${skill.name}`,
          error: err.message || String(err),
        });
        error(`Failed to pull skill "${skill.name}" for ${fmt}: ${err.message}`);
      }
    }

    if (skillPulledAny && !result.skillsPulled.includes(skill.name)) {
      result.skillsPulled.push(skill.name);
    }
  }

  return result;
}

