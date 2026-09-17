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
 * Cursor expects .mdc, Universal / Antigravity expects .md.
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
    originalFilename === ".windsurfrules"
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
 * Pull selected rules and skills from GitHub to local disk.
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

  const format = options.format || "agent";
  const baseDir = options.targetDir
    ? path.resolve(projectRoot, options.targetDir)
    : projectRoot;

  const { rulesDir, skillsDir } = options.targetDir
    ? {
        rulesDir: path.resolve(baseDir, "rules"),
        skillsDir: path.resolve(baseDir, "skills"),
      }
    : getTargetDirectories(baseDir, format);

  // 1. Pull Rules
  for (const rule of rules) {
    try {
      const filename = formatRuleFilename(rule.filename, format);
      // If it's a root-level file like CLAUDE.md and no custom targetDir was set, write to projectRoot
      const destPath =
        !options.targetDir &&
        (filename === "CLAUDE.md" ||
          filename === "AGENTS.md" ||
          filename === "GEMINI.md" ||
          filename === ".windsurfrules")
          ? path.resolve(baseDir, filename)
          : path.resolve(rulesDir, filename);

      const destFile = Bun.file(destPath);
      const exists = await destFile.exists();

      if (exists && !options.force) {
        result.skipped.push(rule.name);
        warn(`Skipped rule ${c.bold(rule.name)} (already exists, use --force to overwrite)`);
        continue;
      }

      if (options.dryRun) {
        info(`[DRY-RUN] Would write rule: ${destPath}`);
        result.rulesPulled.push(rule.name);
        result.filesWritten.push(destPath);
        continue;
      }

      // Fetch content
      const content = await fetchRawFile(
        owner,
        repo,
        branch,
        rule.sourcePath,
        token
      );

      await Bun.write(destPath, content);
      result.rulesPulled.push(rule.name);
      result.filesWritten.push(destPath);
      success(`Pulled rule: ${c.cyan(rule.name)} -> ${c.dim(path.relative(projectRoot, destPath))}`);
    } catch (err: any) {
      result.errors.push({
        item: rule.name,
        error: err.message || String(err),
      });
      error(`Failed to pull rule "${rule.name}": ${err.message}`);
    }
  }

  // 2. Pull Skills
  for (const skill of skills) {
    try {
      const skillTargetDir = path.resolve(skillsDir, skill.name);
      let anyFileWritten = false;

      for (const file of skill.files) {
        const destPath = path.resolve(skillTargetDir, file.relativePath);
        const destFile = Bun.file(destPath);
        const exists = await destFile.exists();

        if (exists && !options.force) {
          result.skipped.push(`${skill.name}/${file.relativePath}`);
          continue;
        }

        if (options.dryRun) {
          info(`[DRY-RUN] Would write skill file: ${destPath}`);
          result.filesWritten.push(destPath);
          anyFileWritten = true;
          continue;
        }

        // Fetch file content
        const content = await fetchRawFile(
          owner,
          repo,
          branch,
          file.path,
          token
        );

        await Bun.write(destPath, content);
        result.filesWritten.push(destPath);
        anyFileWritten = true;
      }

      if (anyFileWritten) {
        result.skillsPulled.push(skill.name);
        success(
          `Pulled skill: ${c.cyan(skill.name)} (${skill.files.length} file${
            skill.files.length === 1 ? "" : "s"
          }) -> ${c.dim(path.relative(projectRoot, skillTargetDir))}`
        );
      } else if (!options.force) {
        warn(`Skipped skill ${c.bold(skill.name)} (already exists, use --force to overwrite)`);
      }
    } catch (err: any) {
      result.errors.push({
        item: skill.name,
        error: err.message || String(err),
      });
      error(`Failed to pull skill "${skill.name}": ${err.message}`);
    }
  }

  return result;
}
