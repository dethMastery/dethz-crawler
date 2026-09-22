export const AGENT_FORMATS = [
  "agent",
  "agents",
  "claude",
  "cursor",
  "windsurf",
  "copilot",
  "cline",
] as const;

export type AgentFormat = (typeof AGENT_FORMATS)[number];

export type PullItemType = "all" | "rules" | "skills";

export interface GitHubTreeItem {
  path: string;
  mode: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
  url: string;
}

export interface GitHubTreeResponse {
  sha: string;
  url: string;
  tree: GitHubTreeItem[];
  truncated: boolean;
}

export interface RuleMetadata {
  description?: string;
  globs?: string;
  alwaysApply?: boolean;
  [key: string]: unknown;
}

export interface RuleItem {
  id: string;
  name: string;
  filename: string;
  sourcePath: string;
  metadata?: RuleMetadata;
  rawUrl: string;
  sha: string;
  size?: number;
}

export interface SkillFileItem {
  path: string;
  relativePath: string; // relative to the skill folder
  rawUrl: string;
  sha: string;
  size?: number;
}

export interface SkillItem {
  id: string;
  name: string;
  description?: string;
  skillMdPath: string;
  baseDir: string;
  files: SkillFileItem[];
}

export interface RepoInfo {
  owner: string;
  repo: string;
  branch: string;
}

export interface PullOptions {
  repo: string;
  branch?: string;
  type?: PullItemType;
  format?: AgentFormat;
  formats?: AgentFormat[];
  targetDir?: string;
  force?: boolean;
  dryRun?: boolean;
  clean?: boolean;
  rules?: string[];
  skills?: string[];
}

export interface PullResult {
  rulesPulled: string[];
  skillsPulled: string[];
  filesWritten: string[];
  skipped: string[];
  errors: Array<{ item: string; error: string }>;
}

export interface ProjectConfig {
  repo?: string;
  branch?: string;
  format?: AgentFormat;
  formats?: AgentFormat[];
  lastSync?: string;
  installedRules?: string[];
  installedSkills?: string[];
}

