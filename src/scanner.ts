import type {
  GitHubTreeItem,
  RuleItem,
  RuleMetadata,
  SkillFileItem,
  SkillItem,
} from "./types.ts";

/**
 * Lightweight frontmatter extractor for markdown files.
 * Extracts key-value pairs like name, description, globs, alwaysApply.
 */
export function parseFrontmatter(content: string): {
  metadata: RuleMetadata;
  body: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { metadata: {}, body: content };
  }

  const rawYaml = match[1] || "";
  const body = content.slice(match[0].length);
  const metadata: RuleMetadata = {};

  for (const line of rawYaml.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx > 0) {
      const key = trimmed.slice(0, colonIdx).trim();
      let val: unknown = trimmed.slice(colonIdx + 1).trim();

      // Unquote string
      if (
        (typeof val === "string" && val.startsWith('"') && val.endsWith('"')) ||
        (typeof val === "string" && val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      } else if (val === "true") {
        val = true;
      } else if (val === "false") {
        val = false;
      }

      metadata[key] = val;
    }
  }

  return { metadata, body };
}

/**
 * Scan GitHub tree items and extract all skills and rules.
 */
export function scanTree(
  tree: GitHubTreeItem[],
  owner: string,
  repo: string,
  branch: string
): { rules: RuleItem[]; skills: SkillItem[] } {
  const rules: RuleItem[] = [];
  const skillsMap = new Map<string, SkillItem>();

  // 1. First pass: Find all SKILL.md files
  for (const item of tree) {
    if (item.type !== "blob") continue;

    const normalizedPath = item.path.replace(/\\/g, "/");
    const filename = normalizedPath.split("/").pop() || "";

    if (filename.toLowerCase() === "skill.md") {
      const parts = normalizedPath.split("/");
      // Skill base dir is the parent directory of SKILL.md
      // e.g. "skills/my-skill/SKILL.md" -> "skills/my-skill"
      // or "SKILL.md" -> ""
      const baseDir = parts.slice(0, -1).join("/");
      const skillName = parts.length > 1 ? parts[parts.length - 2]! : repo;
      const skillId = skillName.toLowerCase().replace(/[^a-z0-9_-]/g, "-");

      skillsMap.set(baseDir, {
        id: skillId,
        name: skillName,
        skillMdPath: normalizedPath,
        baseDir,
        files: [],
      });
    }
  }

  // 2. Second pass: Collect all files belonging to skills, and discover rules
  for (const item of tree) {
    if (item.type !== "blob") continue;

    const normalizedPath = item.path.replace(/\\/g, "/");
    const filename = normalizedPath.split("/").pop() || "";

    // Check if this file belongs to any discovered skill directory
    let matchedSkill = false;
    for (const [baseDir, skill] of skillsMap.entries()) {
      if (baseDir === "") {
        // Root SKILL.md only attaches itself
        if (normalizedPath === "SKILL.md") {
          skill.files.push({
            path: normalizedPath,
            relativePath: "SKILL.md",
            rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${normalizedPath}`,
            sha: item.sha,
            size: item.size,
          });
          matchedSkill = true;
          break;
        }
      } else if (
        normalizedPath === baseDir ||
        normalizedPath.startsWith(baseDir + "/")
      ) {
        const relativePath = normalizedPath.slice(baseDir.length + 1);
        skill.files.push({
          path: normalizedPath,
          relativePath,
          rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${normalizedPath}`,
          sha: item.sha,
          size: item.size,
        });
        matchedSkill = true;
        break;
      }
    }

    if (matchedSkill) {
      continue;
    }

    // Check if this is a rule file
    if (isRulePath(normalizedPath)) {
      const ruleName = filename.replace(/\.(md|mdc)$/i, "");
      const ruleId = ruleName.toLowerCase().replace(/[^a-z0-9_-]/g, "-");

      rules.push({
        id: ruleId,
        name: ruleName,
        filename,
        sourcePath: normalizedPath,
        rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${normalizedPath}`,
        sha: item.sha,
        size: item.size,
      });
    }
  }

  return {
    rules,
    skills: Array.from(skillsMap.values()),
  };
}

/**
 * Determine if a file path is considered an AI agent rule.
 */
export function isRulePath(path: string): boolean {
  const lower = path.toLowerCase();

  // Root agent instructions
  if (
    lower === "claude.md" ||
    lower === "agents.md" ||
    lower === "gemini.md" ||
    lower === ".windsurfrules"
  ) {
    return true;
  }

  // Rules in standard directories
  const ruleDirPatterns = [
    /^\.agent\/rules\/.+\.(md|mdc)$/i,
    /^\.agents\/rules\/.+\.(md|mdc)$/i,
    /^\.cursor\/rules\/.+\.(md|mdc)$/i,
    /^rules\/.+\.(md|mdc)$/i,
    /^\.github\/copilot-instructions\.md$/i,
  ];

  return ruleDirPatterns.some((pattern) => pattern.test(path));
}
