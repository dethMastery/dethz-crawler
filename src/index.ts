#!/usr/bin/env bun
import { existsSync, readdirSync } from "node:fs";
import { parseArgs } from "node:util";
import path from "node:path";
import {
  detectProjectFormat,
  detectProjectFormats,
  formatInstalledRule,
  formatInstalledSkill,
  getInstalledRepos,
  loadConfig,
  mergeInstalledEntries,
  parseInstalledItem,
  removeInstalledRules,
  removeInstalledSkills,
  saveConfig,
} from "./config.ts";
import {
  fetchRawFile,
  getAuthToken,
  getCommitSha,
  getDefaultBranch,
  getRepoTree,
  parseRepo,
} from "./github.ts";
import {
  getTargetDirectories,
  isRuleInstalled,
  isSkillInstalled,
  pullItems,
  removeItems,
} from "./pull.ts";
import { scanTree } from "./scanner.ts";
import {
  AGENT_FORMATS,
  type AgentFormat,
  type ProjectConfig,
  type PullItemType,
  type PullOptions,
} from "./types.ts";
import { checkPackageUpdate, displayUpdateNotification } from "./update.ts";
import { PACKAGE_NAME, VERSION } from "./version.ts";
import { Separator, checkbox, confirm, input } from "@inquirer/prompts";
import { banner, c, divider, error, info, step, success, warn } from "./ui.ts";

const AGENT_LABELS: Record<AgentFormat, { name: string; hint: string }> = {
  claude: { name: "Claude", hint: ".claude/, CLAUDE.md" },
  cursor: { name: "Cursor", hint: ".cursor/rules/*.mdc" },
  windsurf: { name: "Windsurf", hint: ".windsurf/, .windsurfrules" },
  copilot: { name: "GitHub Copilot", hint: ".github/instructions" },
  cline: { name: "Cline / Roo Code", hint: ".cline/, .clinerules" },
  agents: { name: "Antigravity", hint: ".agents/rules, GEMINI.md" },
  agent: { name: "Universal Agent", hint: ".agent/rules, AGENTS.md" },
};

function parseFormats(rawFormats: string | string[] | undefined): AgentFormat[] {
  if (!rawFormats) return [];
  const list = Array.isArray(rawFormats) ? rawFormats : [rawFormats];
  const parsed = list
    .flatMap((f) => f.split(","))
    .map((f) => f.trim().toLowerCase() as AgentFormat)
    .filter((f) => f.length > 0);

  const invalid = parsed.filter((f) => !AGENT_FORMATS.includes(f));
  if (invalid.length > 0) {
    error(
      `Invalid format(s): ${invalid.join(", ")}. Supported formats: ${AGENT_FORMATS.join(", ")}`,
    );
    process.exit(1);
  }

  return Array.from(new Set(parsed));
}

async function resolveFormats(
  cliFormats: AgentFormat[],
  savedFormats: AgentFormat[],
  isInteractive: boolean,
  promptMessage = "Select target AI agents (formats):",
): Promise<AgentFormat[]> {
  if (cliFormats.length > 0) {
    return cliFormats;
  }

  const detected = detectProjectFormats();
  const defaultSelection =
    savedFormats.length > 0
      ? savedFormats
      : detected.length > 0
      ? detected
      : ["agent" as AgentFormat];

  if (isInteractive) {
    try {
      const selected = await checkbox({
        message: promptMessage,
        choices: AGENT_FORMATS.map((fmt) => ({
          name: `${c.bold(AGENT_LABELS[fmt].name)} ${c.dim(
            `(${AGENT_LABELS[fmt].hint})`,
          )}`,
          value: fmt,
          checked: defaultSelection.includes(fmt),
        })),
        validate: (answer) =>
          answer.length > 0 ? true : "You must select at least one AI agent.",
      });
      return selected as AgentFormat[];
    } catch {
      info("Agent format selection cancelled.");
      process.exit(0);
    }
  }

  return defaultSelection;
}

function printHelp(): void {
  banner();
  console.log(`
${c.bold("USAGE:")}
  ${c.cyan("bunx dethz-crawler")} <command> [options]
  ${c.cyan("dethz-crawler")} <command> [options]

${c.bold("COMMANDS:")}
  ${c.green("pull")}             Pull SKILL.md and rules from GitHub to local project (default)
  ${c.green("list")}             List available skills and rules in a GitHub repository
  ${c.green("sync")}             Update/re-pull previously installed rules & skills
  ${c.green("remove")} (rm)      Remove installed rules or skills from project
  ${c.green("init")}             Initialize agent directories (.claude, .cursor, .agent, etc.)
  ${c.green("update")}           Check for updates to dethz-crawler package
  ${c.green("help")}             Show this help message

${c.bold("OPTIONS:")}
  ${c.yellow("-r, --repo")} <repo>     GitHub repository (${c.dim("owner/repo")} or URL)
  ${c.yellow("-b, --branch")} <name>   Branch or commit ref (${c.dim("default: default branch")})
  ${c.yellow("-t, --type")} <type>     What to pull: ${c.cyan("all")} | ${c.cyan("rules")} | ${c.cyan("skills")} (${c.dim("default: all")})
  ${c.yellow("-f, --format")} <fmt...> AI agent format(s) (${c.dim("comma-separated or multiple")})
                                 Supported: ${c.cyan("claude")} | ${c.cyan("cursor")} | ${c.cyan("windsurf")} | ${c.cyan("copilot")} | ${c.cyan("cline")} | ${c.cyan("agent")} | ${c.cyan("agents")}
  ${c.yellow("-d, --target")} <dir>    Custom destination directory in local project
  ${c.yellow("--rule")} <name>         Rule(s) to pull or remove (${c.dim("comma-separated or multiple")})
  ${c.yellow("--skill")} <name>        Skill(s) to pull or remove (${c.dim("comma-separated or multiple")})
  ${c.yellow("--all")}                 Target all installed items (used with remove)
  ${c.yellow("--installed")}           List installed rules & skills locally (used with list)
  ${c.yellow("--force")}               Overwrite existing files without prompting
  ${c.yellow("--dry-run")}             Simulate actions without writing/deleting files
  ${c.yellow("--token")} <token>       Explicit GitHub Personal Access Token
  ${c.yellow("--check-update")}        Check npm registry for newer version
  ${c.yellow("-y, --yes")}             Skip interactive selection
  ${c.yellow("-v, --version")}         Show CLI version
  ${c.yellow("-h, --help")}            Show help message

${c.bold("EXAMPLES:")}
  ${c.dim("# Pull for multiple AI agents (e.g. Claude and Cursor)")}
  bunx dethz-crawler pull --repo owner/repo -f claude,cursor

  ${c.dim("# Pull all rules & skills from a repo")}
  bunx dethz-crawler pull --repo dethMastery/dotfiles

  ${c.dim("# List what is available in a repo")}
  bunx dethz-crawler list --repo dethMastery/dotfiles

  ${c.dim("# List locally installed rules and skills")}
  bunx dethz-crawler list --installed

  ${c.dim("# Pull only rules into Claude and Cursor")}
  bunx dethz-crawler pull -r owner/repo --type rules -f claude,cursor

  ${c.dim("# Remove rules or skills interactively with list selection")}
  bunx dethz-crawler remove

  ${c.dim("# Remove a specific rule")}
  bunx dethz-crawler remove --rule version-bump

  ${c.dim("# Remove a specific skill")}
  bunx dethz-crawler remove --skill workspace-allow

  ${c.dim("# Check for CLI package updates")}
  bunx dethz-crawler update

  ${c.dim("# Re-sync all installed items across all configured agents")}
  bunx dethz-crawler sync
`);
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      repo: { type: "string", short: "r" },
      branch: { type: "string", short: "b" },
      type: { type: "string", short: "t", default: "all" },
      format: { type: "string", short: "f", multiple: true },
      target: { type: "string", short: "d" },
      rule: { type: "string", multiple: true },
      skill: { type: "string", multiple: true },
      force: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      token: { type: "string" },
      "check-update": { type: "boolean", default: false },
      all: { type: "boolean", default: false },
      installed: { type: "boolean", default: false },
      yes: { type: "boolean", short: "y", default: false },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
    allowPositionals: true,
  });

  if (values.version) {
    console.log(`${PACKAGE_NAME} v${VERSION}`);
    return;
  }

  const rawCommand = positionals[0] || (values["check-update"] ? "update" : "pull");

  if (values.help || rawCommand === "help") {
    printHelp();
    return;
  }

  const command = rawCommand.toLowerCase();
  banner();

  // Check for updates command
  if (values["check-update"] || command === "update" || command === "check-update") {
    step(1, 1, `Checking npm registry for ${PACKAGE_NAME} updates...`);
    const update = await checkPackageUpdate(VERSION, true);
    if (!update) {
      warn("Unable to check for updates. Please check your network connection.");
      return;
    }
    if (update.hasUpdate) {
      displayUpdateNotification(update);
    } else {
      success(
        `You are already using the latest version of ${PACKAGE_NAME} (${c.cyan(`v${VERSION}`)}).`,
      );
    }
    return;
  }

  // Launch background update check for non-blocking notification
  const updatePromise = checkPackageUpdate(VERSION, false).catch(() => null);

  async function notifyIfUpdateAvailable(): Promise<void> {
    try {
      const update = await updatePromise;
      if (update?.hasUpdate) {
        displayUpdateNotification(update);
      }
    } catch {}
  }

  // Load existing project config
  const projectConfig = await loadConfig();

  // 1. INIT Command
  if (command === "init") {
    const isInteractive = Boolean(process.stdin.isTTY && !values.yes);
    const cliFormats = parseFormats(values.format);
    const savedFormats =
      projectConfig.formats ||
      (projectConfig.format ? [projectConfig.format] : []);

    const selectedFormats = await resolveFormats(
      cliFormats,
      savedFormats,
      isInteractive,
      "Select AI agent formats to initialize:",
    );

    info(
      `Initializing agent structure for: ${selectedFormats
        .map((f) => c.cyan(f))
        .join(", ")}`,
    );

    for (const fmt of selectedFormats) {
      const { rulesDir, skillsDir } = getTargetDirectories(process.cwd(), fmt);
      await Bun.write(path.resolve(rulesDir, ".gitkeep"), "");
      await Bun.write(path.resolve(skillsDir, ".gitkeep"), "");
      success(
        `Initialized [${c.yellow(fmt)}]: ${c.dim(
          path.relative(process.cwd(), rulesDir),
        )} and ${c.dim(path.relative(process.cwd(), skillsDir))}`,
      );
    }

    const newConfig: ProjectConfig = {
      formats: selectedFormats,
      installedRules: projectConfig.installedRules,
      installedSkills: projectConfig.installedSkills,
    };
    if (values.repo) {
      newConfig.repo = values.repo;
    }
    await saveConfig(newConfig);

    success(`Saved configuration to ${c.dim(".agentrc.json")}`);
    await notifyIfUpdateAvailable();
    return;
  }

  // 2. SYNC Command
  if (command === "sync") {
    const pullType = (values.type as PullItemType) || "all";
    const cliFormats = parseFormats(values.format);
    const savedFormats =
      projectConfig.formats ||
      (projectConfig.format ? [projectConfig.format] : []);

    const selectedFormats: AgentFormat[] =
      cliFormats.length > 0
        ? cliFormats
        : savedFormats.length > 0
        ? savedFormats
        : ["agent"];

    const token = values.token || (await getAuthToken());

    const configuredRules = projectConfig.installedRules || [];
    const configuredSkills = projectConfig.installedSkills || [];

    if (
      configuredRules.length === 0 &&
      configuredSkills.length === 0 &&
      !values.repo &&
      !projectConfig.repo
    ) {
      error(
        "No installed rules or skills found in .agentrc.json. Run 'dethz-crawler pull --repo <owner/repo>' first.",
      );
      process.exit(1);
    }

    interface RepoSyncGroup {
      owner: string;
      repo: string;
      ref: string;
      rules: { name: string; path: string; rawEntry: string }[];
      skills: { name: string; path: string; rawEntry: string }[];
    }

    const groups = new Map<string, RepoSyncGroup>();

    const getOrCreateGroup = (
      owner: string,
      repo: string,
      ref: string,
    ): RepoSyncGroup => {
      const key = `${owner.toLowerCase()}/${repo.toLowerCase()}`;
      let group = groups.get(key);
      if (!group) {
        group = { owner, repo, ref, rules: [], skills: [] };
        groups.set(key, group);
      }
      return group;
    };

    const targetRepoFilter = values.repo ? parseRepo(values.repo) : null;

    if (pullType !== "skills") {
      for (const entry of configuredRules) {
        const parsed = parseInstalledItem(entry);
        if (parsed) {
          if (
            targetRepoFilter &&
            (parsed.owner.toLowerCase() !==
              targetRepoFilter.owner.toLowerCase() ||
              parsed.repo.toLowerCase() !== targetRepoFilter.repo.toLowerCase())
          ) {
            continue;
          }
          const group = getOrCreateGroup(parsed.owner, parsed.repo, parsed.ref);
          group.rules.push({
            name: parsed.name,
            path: parsed.path,
            rawEntry: entry,
          });
        } else if (projectConfig.repo || values.repo) {
          const repoSpec = values.repo || projectConfig.repo!;
          const { owner, repo } = parseRepo(repoSpec);
          if (
            targetRepoFilter &&
            (owner.toLowerCase() !== targetRepoFilter.owner.toLowerCase() ||
              repo.toLowerCase() !== targetRepoFilter.repo.toLowerCase())
          ) {
            continue;
          }
          const ref = values.branch || projectConfig.branch || "main";
          const group = getOrCreateGroup(owner, repo, ref);
          group.rules.push({
            name: entry,
            path: `rules/${entry}.md`,
            rawEntry: entry,
          });
        }
      }
    }

    if (pullType !== "rules") {
      for (const entry of configuredSkills) {
        const parsed = parseInstalledItem(entry);
        if (parsed) {
          if (
            targetRepoFilter &&
            (parsed.owner.toLowerCase() !==
              targetRepoFilter.owner.toLowerCase() ||
              parsed.repo.toLowerCase() !== targetRepoFilter.repo.toLowerCase())
          ) {
            continue;
          }
          const group = getOrCreateGroup(parsed.owner, parsed.repo, parsed.ref);
          group.skills.push({
            name: parsed.name,
            path: parsed.path,
            rawEntry: entry,
          });
        } else if (projectConfig.repo || values.repo) {
          const repoSpec = values.repo || projectConfig.repo!;
          const { owner, repo } = parseRepo(repoSpec);
          if (
            targetRepoFilter &&
            (owner.toLowerCase() !== targetRepoFilter.owner.toLowerCase() ||
              repo.toLowerCase() !== targetRepoFilter.repo.toLowerCase())
          ) {
            continue;
          }
          const ref = values.branch || projectConfig.branch || "main";
          const group = getOrCreateGroup(owner, repo, ref);
          group.skills.push({
            name: entry,
            path: `skills/${entry}`,
            rawEntry: entry,
          });
        }
      }
    }

    if (groups.size === 0) {
      if (values.repo) {
        error(`No installed items matched repository "${values.repo}".`);
      } else {
        error("No installed rules or skills found to sync.");
      }
      process.exit(1);
    }

    info(
      `Syncing rules and skills across ${c.yellow(
        String(groups.size),
      )} repository${groups.size === 1 ? "" : "ies"} for agent${
        selectedFormats.length === 1 ? "" : "s"
      }: ${selectedFormats.map((f) => c.cyan(f)).join(", ")}`,
    );

    let totalRulesPulled = 0;
    let totalSkillsPulled = 0;
    let totalErrors = 0;
    const updatedRuleEntries: string[] = [];
    const updatedSkillEntries: string[] = [];

    let groupIndex = 0;
    for (const group of groups.values()) {
      groupIndex++;
      divider();
      step(
        groupIndex,
        groups.size,
        `Syncing with ${c.cyan(`${group.owner}/${group.repo}`)}...`,
      );

      let branch = values.branch;
      if (!branch) {
        try {
          branch = await getDefaultBranch(group.owner, group.repo, token);
        } catch {
          branch = group.ref || "main";
        }
      }

      let treeRes;
      try {
        treeRes = await getRepoTree(group.owner, group.repo, branch, token);
      } catch (err: any) {
        error(
          `Failed to fetch tree from ${group.owner}/${group.repo}: ${err.message}`,
        );
        totalErrors++;
        continue;
      }

      const { rules, skills } = scanTree(
        treeRes.tree,
        group.owner,
        group.repo,
        branch,
      );

      const requestedRuleNames = group.rules.map((r) => r.name.toLowerCase());
      const filteredRules = rules.filter(
        (r) =>
          requestedRuleNames.includes(r.name.toLowerCase()) ||
          requestedRuleNames.includes(r.id),
      );

      const requestedSkillNames = group.skills.map((s) => s.name.toLowerCase());
      const filteredSkills = skills.filter(
        (s) =>
          requestedSkillNames.includes(s.name.toLowerCase()) ||
          requestedSkillNames.includes(s.id),
      );

      const syncPullOptions: PullOptions = {
        repo: `${group.owner}/${group.repo}`,
        branch,
        formats: selectedFormats,
        force: true,
        dryRun: values["dry-run"],
      };

      const result = await pullItems({
        owner: group.owner,
        repo: group.repo,
        branch,
        token,
        rules: filteredRules,
        skills: filteredSkills,
        options: syncPullOptions,
      });

      totalRulesPulled += result.rulesPulled.length;
      totalSkillsPulled += result.skillsPulled.length;
      totalErrors += result.errors.length;

      const commitSha = await getCommitSha(
        group.owner,
        group.repo,
        branch,
        token,
      );
      const recordedRef = commitSha || branch;

      for (const ruleName of result.rulesPulled) {
        const item = filteredRules.find((r) => r.name === ruleName);
        if (item) {
          updatedRuleEntries.push(
            formatInstalledRule(
              group.owner,
              group.repo,
              recordedRef,
              item.sourcePath,
            ),
          );
        }
      }

      for (const skillName of result.skillsPulled) {
        const item = filteredSkills.find((s) => s.name === skillName);
        if (item) {
          updatedSkillEntries.push(
            formatInstalledSkill(
              group.owner,
              group.repo,
              recordedRef,
              item.baseDir,
              item.name,
            ),
          );
        }
      }
    }

    if (!values["dry-run"]) {
      const mergedRules = mergeInstalledEntries(
        projectConfig.installedRules || [],
        updatedRuleEntries,
      );
      const mergedSkills = mergeInstalledEntries(
        projectConfig.installedSkills || [],
        updatedSkillEntries,
      );

      await saveConfig({
        formats: selectedFormats,
        installedRules: mergedRules,
        installedSkills: mergedSkills,
      });
    }

    divider();
    console.log(c.bold("Sync Summary:"));
    console.log(`  ${c.green("✔")} Rules synced:   ${totalRulesPulled}`);
    console.log(`  ${c.green("✔")} Skills synced:  ${totalSkillsPulled}`);
    if (totalErrors > 0) {
      console.log(`  ${c.red("✖")} Errors:         ${totalErrors}`);
    }
    console.log("");
    success("Sync complete! All installed rules and skills are up to date.");
    await notifyIfUpdateAvailable();
    return;
  }

  function listInstalled(
    config: ProjectConfig,
    formats: AgentFormat[],
  ): {
    rules: { name: string; entry: string }[];
    skills: { name: string; entry: string }[];
  } {
    const rulesMap = new Map<string, string>();
    for (const entry of config.installedRules || []) {
      const parsed = parseInstalledItem(entry);
      const name = parsed ? parsed.name : entry;
      rulesMap.set(name, entry);
    }
    const skillsMap = new Map<string, string>();
    for (const entry of config.installedSkills || []) {
      const parsed = parseInstalledItem(entry);
      const name = parsed ? parsed.name : entry;
      skillsMap.set(name, entry);
    }

    // Also discover any files present on disk across formats
    for (const fmt of formats) {
      const { rulesDir, skillsDir } = getTargetDirectories(process.cwd(), fmt);
      if (existsSync(rulesDir)) {
        try {
          const files = readdirSync(rulesDir);
          for (const file of files) {
            if (file.endsWith(".md") || file.endsWith(".mdc")) {
              const name = file.replace(/\.(md|mdc)$/i, "");
              if (!rulesMap.has(name) && file !== ".gitkeep") {
                rulesMap.set(name, path.join(path.basename(rulesDir), file));
              }
            }
          }
        } catch {}
      }
      if (existsSync(skillsDir)) {
        try {
          const entries = readdirSync(skillsDir, { withFileTypes: true });
          for (const dirEnt of entries) {
            if (dirEnt.isDirectory() && dirEnt.name !== ".gitkeep") {
              if (!skillsMap.has(dirEnt.name)) {
                skillsMap.set(
                  dirEnt.name,
                  path.join(path.basename(skillsDir), dirEnt.name),
                );
              }
            }
          }
        } catch {}
      }
    }

    return {
      rules: Array.from(rulesMap.entries()).map(([name, entry]) => ({
        name,
        entry,
      })),
      skills: Array.from(skillsMap.entries()).map(([name, entry]) => ({
        name,
        entry,
      })),
    };
  }

  function printInstalledList(items: {
    rules: { name: string; entry: string }[];
    skills: { name: string; entry: string }[];
  }): void {
    divider();
    console.log(c.bold(c.underline("INSTALLED RULES & SKILLS:")));
    if (items.rules.length === 0 && items.skills.length === 0) {
      console.log(c.dim("  (no installed rules or skills found in project)"));
    }
    if (items.rules.length > 0) {
      console.log(c.bold(`\nRULES (${items.rules.length}):`));
      for (const r of items.rules) {
        console.log(`  ${c.cyan("•")} ${c.bold(r.name)} ${c.dim(`(${r.entry})`)}`);
      }
    }
    if (items.skills.length > 0) {
      console.log(c.bold(`\nSKILLS (${items.skills.length}):`));
      for (const s of items.skills) {
        console.log(`  ${c.magenta("•")} ${c.bold(s.name)} ${c.dim(`(${s.entry})`)}`);
      }
    }
    divider();
  }

  // 3. LIST INSTALLED (list --installed)
  const isListInstalled =
    (command === "list" && values.installed) ||
    (command === "list" &&
      !values.repo &&
      !projectConfig.repo &&
      ((projectConfig.installedRules &&
        projectConfig.installedRules.length > 0) ||
        (projectConfig.installedSkills &&
          projectConfig.installedSkills.length > 0)) &&
      !process.stdin.isTTY);

  if (isListInstalled) {
    const targetFormats =
      projectConfig.formats ||
      (projectConfig.format
        ? [projectConfig.format]
        : (["agent"] as AgentFormat[]));
    const installed = listInstalled(projectConfig, targetFormats);
    printInstalledList(installed);
    await notifyIfUpdateAvailable();
    return;
  }

  // 4. REMOVE Command
  if (command === "remove" || command === "rm" || command === "uninstall") {
    const cliFormats = parseFormats(values.format);
    const savedFormats =
      projectConfig.formats ||
      (projectConfig.format ? [projectConfig.format] : []);
    const selectedFormats: AgentFormat[] =
      cliFormats.length > 0
        ? cliFormats
        : savedFormats.length > 0
        ? savedFormats
        : detectProjectFormats().length > 0
        ? detectProjectFormats()
        : ["agent"];

    const installed = listInstalled(projectConfig, selectedFormats);

    // Print listing of installed items
    printInstalledList(installed);

    if (installed.rules.length === 0 && installed.skills.length === 0) {
      info("No installed rules or skills found to remove.");
      await notifyIfUpdateAvailable();
      return;
    }

    const hasExplicitRule = Boolean(values.rule && values.rule.length > 0);
    const hasExplicitSkill = Boolean(values.skill && values.skill.length > 0);
    const removeAll = Boolean(values.all);

    let rulesToRemove: string[] = [];
    let skillsToRemove: string[] = [];

    if (removeAll) {
      rulesToRemove = installed.rules.map((r) => r.name);
      skillsToRemove = installed.skills.map((s) => s.name);
    } else if (hasExplicitRule || hasExplicitSkill) {
      if (hasExplicitRule) {
        rulesToRemove = (values.rule || [])
          .flatMap((r) => r.split(","))
          .map((r) => r.trim());
      }
      if (hasExplicitSkill) {
        skillsToRemove = (values.skill || [])
          .flatMap((s) => s.split(","))
          .map((s) => s.trim());
      }
    } else if (process.stdin.isTTY && !values.yes) {
      type RemoveChoice = { type: "rule" | "skill"; name: string };
      const choices: Array<Separator | { name: string; value: RemoveChoice }> = [
        ...(installed.rules.length > 0
          ? [
              new Separator("--- RULES ---"),
              ...installed.rules.map((r) => ({
                name: `${c.cyan("[rule]")} ${c.bold(r.name)} ${c.dim(
                  `(${r.entry})`,
                )}`,
                value: { type: "rule" as const, name: r.name },
              })),
            ]
          : []),
        ...(installed.skills.length > 0
          ? [
              new Separator("--- SKILLS ---"),
              ...installed.skills.map((s) => ({
                name: `${c.magenta("[skill]")} ${c.bold(s.name)} ${c.dim(
                  `(${s.entry})`,
                )}`,
                value: { type: "skill" as const, name: s.name },
              })),
            ]
          : []),
      ];

      try {
        const selected = await checkbox<RemoveChoice>({
          message: "Select rules and skills to remove:",
          choices,
          validate: (ans) =>
            ans.length > 0
              ? true
              : "Please select at least one item to remove.",
        });

        for (const item of selected) {
          if (item.type === "rule") rulesToRemove.push(item.name);
          if (item.type === "skill") skillsToRemove.push(item.name);
        }
      } catch {
        info("Removal cancelled.");
        return;
      }
    } else {
      error(
        "No rules or skills specified for removal. Use --rule <name>, --skill <name>, --all, or run interactively.",
      );
      process.exit(1);
    }

    const totalCount = rulesToRemove.length + skillsToRemove.length;
    if (totalCount === 0) {
      info("No items selected for removal.");
      return;
    }

    if (process.stdin.isTTY && !values.yes) {
      try {
        const confirmRemove = await confirm({
          message: `Are you sure you want to remove ${totalCount} item${
            totalCount === 1 ? "" : "s"
          }?`,
          default: true,
        });

        if (!confirmRemove) {
          info("Removal cancelled.");
          return;
        }
      } catch {
        info("Removal cancelled.");
        return;
      }
    }

    step(1, 2, "Removing files from agent directories...");
    const result = await removeItems({
      rules: rulesToRemove,
      skills: skillsToRemove,
      formats: selectedFormats,
      dryRun: values["dry-run"],
    });

    step(2, 2, "Updating .agentrc.json configuration...");
    if (!values["dry-run"]) {
      const updatedRules = removeInstalledRules(
        projectConfig.installedRules || [],
        rulesToRemove,
      );
      const updatedSkills = removeInstalledSkills(
        projectConfig.installedSkills || [],
        skillsToRemove,
      );

      await saveConfig({
        ...projectConfig,
        formats: selectedFormats,
        installedRules: updatedRules,
        installedSkills: updatedSkills,
      });
      success(`Updated ${c.dim(".agentrc.json")}`);
    }

    divider();
    console.log(c.bold("Removal Summary:"));
    console.log(
      `  ${c.green("✔")} Rules removed:   ${result.rulesRemoved.length}`,
    );
    console.log(
      `  ${c.green("✔")} Skills removed:  ${result.skillsRemoved.length}`,
    );
    console.log(
      `  ${c.cyan("ℹ")} Files deleted:  ${result.filesDeleted.length}`,
    );
    if (result.errors.length > 0) {
      console.log(`  ${c.red("✖")} Errors:         ${result.errors.length}`);
    }
    console.log("");
    success("Done! Selected rules and skills have been removed.");
    await notifyIfUpdateAvailable();
    return;
  }

  // Determine repository for pull and list
  let repoInput = values.repo;

  if (!repoInput && (command === "pull" || command === "list")) {
    const knownRepos = getInstalledRepos(projectConfig);
    if (process.stdin.isTTY && !values.yes) {
      try {
        if (knownRepos.length === 1) {
          const useSaved = await confirm({
            message: `Use configured repository (${c.cyan(knownRepos[0])})?`,
            default: true,
          });

          if (useSaved) {
            repoInput = knownRepos[0];
          }
        }

        if (!repoInput) {
          repoInput = await input({
            message: "Enter GitHub repository (owner/repo):",
            validate: (val) => {
              try {
                parseRepo(val);
                return true;
              } catch (err: any) {
                return err.message || "Invalid repository format";
              }
            },
          });
          repoInput = repoInput.trim() || undefined;
        }
      } catch {
        // user aborted
      }
    } else if (knownRepos.length > 0) {
      repoInput = knownRepos[0];
    }

    if (!repoInput) {
      error("No GitHub repository specified. Use --repo <owner/repo>");
      console.log(`\nRun ${c.cyan("dethz-crawler --help")} for usage.`);
      process.exit(1);
    }
  }

  const { owner, repo } = parseRepo(repoInput!);
  const token = values.token || (await getAuthToken());

  // Fetch repository info and tree for pull or list
  step(1, 3, `Connecting to ${c.cyan(`${owner}/${repo}`)} on GitHub...`);

  let branch = values.branch;
  if (!branch) {
    try {
      branch = await getDefaultBranch(owner, repo, token);
    } catch (err: any) {
      error(`Could not resolve default branch: ${err.message}`);
      process.exit(1);
    }
  }
  info(
    `Using branch: ${c.yellow(branch)}${token ? c.dim(" (authenticated)") : ""}`,
  );

  step(2, 3, "Scanning repository tree for SKILL.md and rules...");
  let treeRes;
  try {
    treeRes = await getRepoTree(owner, repo, branch, token);
  } catch (err: any) {
    error(`Failed to fetch tree: ${err.message}`);
    process.exit(1);
  }

  const { rules, skills } = scanTree(treeRes.tree, owner, repo, branch);

  // 3. LIST Command
  if (command === "list") {
    divider();
    console.log(
      c.bold(
        `Found ${c.green(String(rules.length))} rule(s) and ${c.green(
          String(skills.length),
        )} skill(s) in ${c.cyan(`${owner}/${repo}@${branch}`)}:`,
      ),
    );
    console.log("");

    const listFormats =
      projectConfig.formats ||
      (projectConfig.format ? [projectConfig.format] : ["agent" as AgentFormat]);

    console.log(c.bold(c.underline("RULES:")));
    if (rules.length === 0) {
      console.log(c.dim("  (no rules found)"));
    } else {
      for (const rule of rules) {
        const isInstalled = isRuleInstalled(
          rule,
          listFormats,
          process.cwd(),
          projectConfig.installedRules,
        );
        console.log(
          `  ${c.cyan("•")} ${c.bold(rule.name)} ${c.dim(`(${rule.sourcePath})`)}${
            isInstalled ? ` ${c.green("[installed]")}` : ""
          }`,
        );
      }
    }

    console.log("");
    console.log(c.bold(c.underline("SKILLS:")));
    if (skills.length === 0) {
      console.log(c.dim("  (no skills found)"));
    } else {
      for (const skill of skills) {
        const isInstalled = isSkillInstalled(
          skill.name,
          listFormats,
          process.cwd(),
          projectConfig.installedSkills,
        );
        console.log(
          `  ${c.magenta("•")} ${c.bold(skill.name)} ${c.dim(
            `(${skill.files.length} file${skill.files.length === 1 ? "" : "s"} at ${skill.baseDir})`,
          )}${isInstalled ? ` ${c.green("[installed]")}` : ""}`,
        );
      }
    }
    divider();
    await notifyIfUpdateAvailable();
    return;
  }

  // 4. PULL Command
  if (command === "pull") {
    const pullType = (values.type as PullItemType) || "all";
    const cliFormats = parseFormats(values.format);
    const savedFormats =
      projectConfig.formats ||
      (projectConfig.format ? [projectConfig.format] : []);

    const isInteractive = Boolean(process.stdin.isTTY && !values.yes);
    const selectedFormats = await resolveFormats(
      cliFormats,
      savedFormats,
      isInteractive,
      "Select target AI agents (formats):",
    );

    const hasExplicitRule = Boolean(values.rule && values.rule.length > 0);
    const hasExplicitSkill = Boolean(values.skill && values.skill.length > 0);

    // Filter rules
    let filteredRules = rules;
    if (pullType === "skills" || (hasExplicitSkill && !hasExplicitRule)) {
      filteredRules = [];
    } else if (hasExplicitRule) {
      const requestedRules = (values.rule || [])
        .flatMap((r) => r.split(","))
        .map((r) => r.trim().toLowerCase());
      filteredRules = rules.filter(
        (r) =>
          requestedRules.includes(r.name.toLowerCase()) ||
          requestedRules.includes(r.id),
      );
    }

    // Filter skills
    let filteredSkills = skills;
    if (pullType === "rules" || (hasExplicitRule && !hasExplicitSkill)) {
      filteredSkills = [];
    } else if (hasExplicitSkill) {
      const requestedSkills = (values.skill || [])
        .flatMap((s) => s.split(","))
        .map((s) => s.trim().toLowerCase());
      filteredSkills = skills.filter(
        (s) =>
          requestedSkills.includes(s.name.toLowerCase()) ||
          requestedSkills.includes(s.id),
      );
    }

    // 1. Select rules before pulling
    if (pullType !== "skills" && rules.length > 0) {
      if (!hasExplicitRule && !hasExplicitSkill) {
        // Partition rules into remote (new) and local (already installed)
        const remoteRules = rules.filter(
          (r) =>
            !isRuleInstalled(
              r,
              selectedFormats,
              process.cwd(),
              projectConfig.installedRules,
            ),
        );
        const localRules = rules.filter((r) =>
          isRuleInstalled(
            r,
            selectedFormats,
            process.cwd(),
            projectConfig.installedRules,
          ),
        );

        if (process.stdin.isTTY && !values.yes) {
          try {
            const choices = [];

            if (remoteRules.length > 0) {
              choices.push(
                new Separator(
                  c.cyan(`── Remote Rules (${remoteRules.length}) ──`),
                ),
              );
              for (const rule of remoteRules) {
                choices.push({
                  name: `${c.bold(rule.name)} ${c.dim(`(${rule.sourcePath})`)}`,
                  value: rule.id,
                  checked: true,
                });
              }
            }

            if (localRules.length > 0) {
              choices.push(
                new Separator(
                  c.gray(`── Installed / Local Rules (${localRules.length}) ──`),
                ),
              );
              for (const rule of localRules) {
                choices.push({
                  name: `${c.dim(rule.name)} ${c.dim(`(${rule.sourcePath})`)} ${c.yellow("[installed]")}`,
                  value: rule.id,
                  checked: false,
                });
              }
            }

            const selectedRuleIds = await checkbox({
              message: "Select rules to pull:",
              choices,
            });
            filteredRules = rules.filter((r) => selectedRuleIds.includes(r.id));
            if (filteredRules.length > 0) {
              info(
                `Selected ${filteredRules.length} rule(s): ${filteredRules
                  .map((r) => c.cyan(r.name))
                  .join(", ")}`,
              );
            } else {
              info("No rules selected.");
            }
          } catch {
            info("Rule selection cancelled.");
            process.exit(0);
          }
        } else {
          console.log("");
          if (remoteRules.length > 0) {
            console.log(
              c.bold(
                `Discovered Remote Rules (${c.green(String(remoteRules.length))}):`,
              ),
            );
            remoteRules.forEach((rule, idx) => {
              console.log(
                `  ${c.dim(`[${idx + 1}]`)} ${c.cyan(rule.name)} ${c.dim(
                  `(${rule.sourcePath})`,
                )}`,
              );
            });
          }
          if (localRules.length > 0) {
            console.log(
              c.bold(
                `Installed / Local Rules (${c.yellow(String(localRules.length))}):`,
              ),
            );
            localRules.forEach((rule, idx) => {
              console.log(
                `  ${c.dim(`[${idx + 1}]`)} ${c.dim(rule.name)} ${c.dim(
                  `(${rule.sourcePath})`,
                )} ${c.yellow("[installed]")}`,
              );
            });
          }
          console.log("");
        }
      } else if (hasExplicitRule) {
        info(
          `Target rule(s): ${filteredRules
            .map((r) => c.cyan(r.name))
            .join(", ")}`,
        );
      }
    }

    // 2. Select skills before pulling
    if (pullType !== "rules" && skills.length > 0) {
      if (!hasExplicitSkill && !hasExplicitRule) {
        // Partition skills into remote (new) and local (already installed)
        const remoteSkills = skills.filter(
          (s) =>
            !isSkillInstalled(
              s.name,
              selectedFormats,
              process.cwd(),
              projectConfig.installedSkills,
            ),
        );
        const localSkills = skills.filter((s) =>
          isSkillInstalled(
            s.name,
            selectedFormats,
            process.cwd(),
            projectConfig.installedSkills,
          ),
        );

        if (process.stdin.isTTY && !values.yes) {
          try {
            const choices = [];

            if (remoteSkills.length > 0) {
              choices.push(
                new Separator(
                  c.cyan(`── Remote Skills (${remoteSkills.length}) ──`),
                ),
              );
              for (const skill of remoteSkills) {
                choices.push({
                  name: `${c.bold(skill.name)} ${c.dim(
                    `(${skill.files.length} file${skill.files.length === 1 ? "" : "s"} at ${skill.baseDir})`,
                  )}`,
                  value: skill.id,
                  checked: true,
                });
              }
            }

            if (localSkills.length > 0) {
              choices.push(
                new Separator(
                  c.gray(`── Installed / Local Skills (${localSkills.length}) ──`),
                ),
              );
              for (const skill of localSkills) {
                choices.push({
                  name: `${c.dim(skill.name)} ${c.dim(
                    `(${skill.files.length} file${skill.files.length === 1 ? "" : "s"} at ${skill.baseDir})`,
                  )} ${c.yellow("[installed]")}`,
                  value: skill.id,
                  checked: false,
                });
              }
            }

            const selectedSkillIds = await checkbox({
              message: "Select skills to pull:",
              choices,
            });
            filteredSkills = skills.filter((s) =>
              selectedSkillIds.includes(s.id),
            );
            if (filteredSkills.length > 0) {
              info(
                `Selected ${filteredSkills.length} skill(s): ${filteredSkills
                  .map((s) => c.cyan(s.name))
                  .join(", ")}`,
              );
            } else {
              info("No skills selected.");
            }
          } catch {
            info("Skill selection cancelled.");
            process.exit(0);
          }
        } else {
          console.log("");
          if (remoteSkills.length > 0) {
            console.log(
              c.bold(
                `Discovered Remote Skills (${c.green(String(remoteSkills.length))}):`,
              ),
            );
            remoteSkills.forEach((skill, idx) => {
              console.log(
                `  ${c.dim(`[${idx + 1}]`)} ${c.magenta(skill.name)} ${c.dim(
                  `(${skill.files.length} file${skill.files.length === 1 ? "" : "s"} at ${skill.baseDir})`,
                )}`,
              );
            });
          }
          if (localSkills.length > 0) {
            console.log(
              c.bold(
                `Installed / Local Skills (${c.yellow(String(localSkills.length))}):`,
              ),
            );
            localSkills.forEach((skill, idx) => {
              console.log(
                `  ${c.dim(`[${idx + 1}]`)} ${c.dim(skill.name)} ${c.dim(
                  `(${skill.files.length} file${skill.files.length === 1 ? "" : "s"} at ${skill.baseDir})`,
                )} ${c.yellow("[installed]")}`,
              );
            });
          }
          console.log("");
        }
      } else if (hasExplicitSkill) {
        info(
          `Target skill(s): ${filteredSkills
            .map((s) => c.cyan(s.name))
            .join(", ")}`,
        );
      }
    }

    step(
      3,
      3,
      `Pulling ${filteredRules.length} rule(s) and ${filteredSkills.length} skill(s) into ${selectedFormats
        .map((f) => c.cyan(f))
        .join(", ")}...`,
    );

    if (filteredRules.length === 0 && filteredSkills.length === 0) {
      warn("No matching rules or skills found to pull.");
      return;
    }

    const pullOptions: PullOptions = {
      repo: `${owner}/${repo}`,
      branch,
      type: pullType,
      format: selectedFormats[0],
      formats: selectedFormats,
      targetDir: values.target,
      force: values.force,
      dryRun: values["dry-run"],
    };

    const result = await pullItems({
      owner,
      repo,
      branch,
      token,
      rules: filteredRules,
      skills: filteredSkills,
      options: pullOptions,
    });

    divider();
    console.log(c.bold("Summary:"));
    console.log(
      `  ${c.green("✔")} Pulled rules:   ${result.rulesPulled.length}`,
    );
    console.log(
      `  ${c.green("✔")} Pulled skills:  ${result.skillsPulled.length}`,
    );
    console.log(
      `  ${c.cyan("ℹ")} Files written:  ${result.filesWritten.length}`,
    );
    if (result.skipped.length > 0) {
      console.log(
        `  ${c.yellow("⚠")} Skipped files:  ${result.skipped.length} (use --force to overwrite)`,
      );
    }
    if (result.errors.length > 0) {
      console.log(`  ${c.red("✖")} Errors:         ${result.errors.length}`);
    }

    // Save project configuration state for easy syncing later
    if (!values["dry-run"]) {
      const commitSha = await getCommitSha(owner, repo, branch, token);
      const recordedRef = commitSha || branch;

      const newRuleEntries = result.rulesPulled.map((ruleName) => {
        const item = rules.find((r) => r.name === ruleName);
        return formatInstalledRule(
          owner,
          repo,
          recordedRef,
          item ? item.sourcePath : `rules/${ruleName}.md`,
        );
      });

      const newSkillEntries = result.skillsPulled.map((skillName) => {
        const item = skills.find((s) => s.name === skillName);
        return formatInstalledSkill(
          owner,
          repo,
          recordedRef,
          item?.baseDir || `skills/${skillName}`,
          skillName,
        );
      });

      const mergedRules = mergeInstalledEntries(
        projectConfig.installedRules || [],
        newRuleEntries,
      );
      const mergedSkills = mergeInstalledEntries(
        projectConfig.installedSkills || [],
        newSkillEntries,
      );

      await saveConfig({
        formats: selectedFormats,
        installedRules: mergedRules,
        installedSkills: mergedSkills,
      });
    }

    console.log("");
    success("Done! Your agent rules and skills are ready.");
    await notifyIfUpdateAvailable();
    return;
  }

  error(
    `Unknown command: "${rawCommand}". Run "dethz-crawler --help" for help.`,
  );
  process.exit(1);
}

main().catch((err) => {
  error(`Unexpected error: ${err.message || err}`);
  process.exit(1);
});
