import { parseArgs } from "node:util";
import path from "node:path";
import {
  detectProjectFormat,
  detectProjectFormats,
  loadConfig,
  saveConfig,
} from "./config.ts";
import {
  fetchRawFile,
  getAuthToken,
  getDefaultBranch,
  getRepoTree,
  parseRepo,
} from "./github.ts";
import { getTargetDirectories, pullItems } from "./pull.ts";
import { scanTree } from "./scanner.ts";
import {
  AGENT_FORMATS,
  type AgentFormat,
  type PullItemType,
  type PullOptions,
} from "./types.ts";
import { checkbox, confirm, input } from "@inquirer/prompts";
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
  ${c.green("init")}             Initialize agent directories (.claude, .cursor, .agent, etc.)
  ${c.green("help")}             Show this help message

${c.bold("OPTIONS:")}
  ${c.yellow("-r, --repo")} <repo>     GitHub repository (${c.dim("owner/repo")} or URL)
  ${c.yellow("-b, --branch")} <name>   Branch or commit ref (${c.dim("default: default branch")})
  ${c.yellow("-t, --type")} <type>     What to pull: ${c.cyan("all")} | ${c.cyan("rules")} | ${c.cyan("skills")} (${c.dim("default: all")})
  ${c.yellow("-f, --format")} <fmt...> AI agent format(s) (${c.dim("comma-separated or multiple")})
                                 Supported: ${c.cyan("claude")} | ${c.cyan("cursor")} | ${c.cyan("windsurf")} | ${c.cyan("copilot")} | ${c.cyan("cline")} | ${c.cyan("agent")} | ${c.cyan("agents")}
  ${c.yellow("-d, --target")} <dir>    Custom destination directory in local project
  ${c.yellow("--rule")} <name>         Pull specific rule(s) (${c.dim("comma-separated or multiple")})
  ${c.yellow("--skill")} <name>        Pull specific skill(s) (${c.dim("comma-separated or multiple")})
  ${c.yellow("--force")}               Overwrite existing files without prompting
  ${c.yellow("--dry-run")}             Simulate downloads without writing files
  ${c.yellow("--token")} <token>       Explicit GitHub Personal Access Token
  ${c.yellow("-y, --yes")}             Skip interactive selection (pull all)
  ${c.yellow("-v, --version")}         Show CLI version
  ${c.yellow("-h, --help")}            Show help message

${c.bold("EXAMPLES:")}
  ${c.dim("# Pull for multiple AI agents (e.g. Claude and Cursor)")}
  bunx dethz-crawler pull --repo owner/repo -f claude,cursor

  ${c.dim("# Pull all rules & skills from a repo")}
  bunx dethz-crawler pull --repo dethMastery/dotfiles

  ${c.dim("# List what is available in a repo")}
  bunx dethz-crawler list --repo dethMastery/dotfiles

  ${c.dim("# Pull only rules into Claude and Cursor")}
  bunx dethz-crawler pull -r owner/repo --type rules -f claude,cursor

  ${c.dim("# Pull a specific skill")}
  bunx dethz-crawler pull -r owner/repo --skill web-search

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
      yes: { type: "boolean", short: "y", default: false },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
    allowPositionals: true,
  });

  if (values.version) {
    console.log("dethz-crawler v0.2.0");
    return;
  }

  const rawCommand = positionals[0] || "pull";

  if (values.help || rawCommand === "help") {
    printHelp();
    return;
  }

  const command = rawCommand.toLowerCase();
  banner();

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

    const newConfig = {
      ...projectConfig,
      format: selectedFormats[0],
      formats: selectedFormats,
      repo: values.repo || projectConfig.repo,
    };
    await saveConfig(newConfig);

    success(`Saved configuration to ${c.dim(".agentrc.json")}`);
    return;
  }

  // Determine repository
  let repoInput = values.repo;

  if (command === "sync") {
    repoInput = values.repo || projectConfig.repo;
    if (!repoInput) {
      error(
        "No previous repository configured in .agentrc.json. Run 'dethz-crawler pull --repo <owner/repo>' first.",
      );
      process.exit(1);
    }
  } else if (!repoInput && (command === "pull" || command === "list")) {
    if (process.stdin.isTTY && !values.yes) {
      try {
        if (projectConfig.repo) {
          const useSaved = await confirm({
            message: `Pull from configured repository (${c.cyan(projectConfig.repo)})?`,
            default: true,
          });

          if (useSaved) {
            repoInput = projectConfig.repo;
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
    } else {
      // Non-interactive or with -y / --yes
      repoInput = projectConfig.repo;
    }

    if (!repoInput) {
      error("No GitHub repository specified. Use --repo <owner/repo>");
      console.log(`\nRun ${c.cyan("dethz-crawler --help")} for usage.`);
      process.exit(1);
    }
  }

  const { owner, repo } = parseRepo(repoInput!);
  const token = values.token || (await getAuthToken());

  // 2. Fetch repository info and tree
  step(1, 3, `Connecting to ${c.cyan(`${owner}/${repo}`)} on GitHub...`);

  let branch =
    values.branch ||
    (repoInput === projectConfig.repo ? projectConfig.branch : undefined);
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

    console.log(c.bold(c.underline("RULES:")));
    if (rules.length === 0) {
      console.log(c.dim("  (no rules found)"));
    } else {
      for (const rule of rules) {
        console.log(
          `  ${c.cyan("•")} ${c.bold(rule.name)} ${c.dim(`(${rule.sourcePath})`)}`,
        );
      }
    }

    console.log("");
    console.log(c.bold(c.underline("SKILLS:")));
    if (skills.length === 0) {
      console.log(c.dim("  (no skills found)"));
    } else {
      for (const skill of skills) {
        console.log(
          `  ${c.magenta("•")} ${c.bold(skill.name)} ${c.dim(
            `(${skill.files.length} file${skill.files.length === 1 ? "" : "s"} at ${skill.baseDir})`,
          )}`,
        );
      }
    }
    divider();
    return;
  }

  // 4. PULL or SYNC Command
  if (command === "pull" || command === "sync") {
    const pullType = (values.type as PullItemType) || "all";
    const cliFormats = parseFormats(values.format);
    const savedFormats =
      projectConfig.formats ||
      (projectConfig.format ? [projectConfig.format] : []);

    let selectedFormats: AgentFormat[];
    if (command === "sync") {
      selectedFormats =
        cliFormats.length > 0
          ? cliFormats
          : savedFormats.length > 0
          ? savedFormats
          : ["agent"];
    } else {
      const isInteractive = Boolean(process.stdin.isTTY && !values.yes);
      selectedFormats = await resolveFormats(
        cliFormats,
        savedFormats,
        isInteractive,
        "Select target AI agents (formats):",
      );
    }

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
    } else if (command === "sync" && projectConfig.installedRules) {
      filteredRules = rules.filter((r) =>
        projectConfig.installedRules?.includes(r.name),
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
    } else if (command === "sync" && projectConfig.installedSkills) {
      filteredSkills = skills.filter((s) =>
        projectConfig.installedSkills?.includes(s.name),
      );
    }

    // 1. Select rules before pulling
    if (pullType !== "skills" && rules.length > 0 && command !== "sync") {
      if (!hasExplicitRule && !hasExplicitSkill) {
        if (process.stdin.isTTY && !values.yes) {
          try {
            const selectedRuleIds = await checkbox({
              message: "Select rules to pull:",
              choices: rules.map((rule) => ({
                name: `${c.bold(rule.name)} ${c.dim(`(${rule.sourcePath})`)}`,
                value: rule.id,
                checked: true,
              })),
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
          console.log(
            c.bold(`Discovered Rules (${c.green(String(rules.length))}):`),
          );
          rules.forEach((rule, idx) => {
            console.log(
              `  ${c.dim(`[${idx + 1}]`)} ${c.cyan(rule.name)} ${c.dim(
                `(${rule.sourcePath})`,
              )}`,
            );
          });
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
    if (pullType !== "rules" && skills.length > 0 && command !== "sync") {
      if (!hasExplicitSkill && !hasExplicitRule) {
        if (process.stdin.isTTY && !values.yes) {
          try {
            const selectedSkillIds = await checkbox({
              message: "Select skills to pull:",
              choices: skills.map((skill) => ({
                name: `${c.bold(skill.name)} ${c.dim(
                  `(${skill.files.length} file${skill.files.length === 1 ? "" : "s"} at ${skill.baseDir})`,
                )}`,
                value: skill.id,
                checked: true,
              })),
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
          console.log(
            c.bold(`Discovered Skills (${c.green(String(skills.length))}):`),
          );
          skills.forEach((skill, idx) => {
            console.log(
              `  ${c.dim(`[${idx + 1}]`)} ${c.magenta(skill.name)} ${c.dim(
                `(${skill.files.length} file${skill.files.length === 1 ? "" : "s"} at ${skill.baseDir})`,
              )}`,
            );
          });
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
      const mergedRules = Array.from(
        new Set([
          ...(projectConfig.installedRules || []),
          ...result.rulesPulled,
        ]),
      );
      const mergedSkills = Array.from(
        new Set([
          ...(projectConfig.installedSkills || []),
          ...result.skillsPulled,
        ]),
      );

      await saveConfig({
        repo: `${owner}/${repo}`,
        branch,
        format: selectedFormats[0],
        formats: selectedFormats,
        lastSync: new Date().toISOString(),
        installedRules: mergedRules,
        installedSkills: mergedSkills,
      });
    }

    console.log("");
    success("Done! Your agent rules and skills are ready.");
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
