# ⚡ dethz-crawler

> Fast, lightweight CLI tool to pull `SKILL.md` (skills) and rules from GitHub directly into your local project.

Built natively with **[Bun](https://bun.com)** and TypeScript. Zero external runtime dependencies.

---

## Features

- 🚀 **Zero external runtime dependencies**: Uses Bun's native `Bun.file`, `Bun.$`, and `fetch`.
- 📁 **Universal & Multi-Agent formats**: Automatically distributes rules and skills into one or multiple AI agents simultaneously:
  - **Claude**: `.claude/rules/`, `.claude/skills/`, and `CLAUDE.md` (Anthropic Claude Code)
  - **Cursor**: `.cursor/rules/*.mdc` and `.cursor/skills/` (Cursor IDE)
  - **Windsurf**: `.windsurf/rules/`, `.windsurf/skills/`, and `.windsurfrules` (Codeium Windsurf)
  - **GitHub Copilot**: `.github/instructions` and `.github/copilot-instructions.md`
  - **Cline**: `.cline/rules/`, `.cline/skills/`, and `.clinerules` (Cline / Roo Code)
  - **Universal Agent**: `.agent/rules/` and `.agent/skills/`
  - **Antigravity**: `.agents/rules/`, `.agents/skills/`, and `GEMINI.md`
- 🎯 **Multi-Agent Sync**: Select multiple agents via CLI (`-f claude,cursor`) or interactive multi-select checkbox prompt.
- 🧠 **Smart Skill Tree Discovery**: Automatically discovers any `SKILL.md` along with its auxiliary files (`scripts/`, `references/`, `resources/`).
- 🔑 **Automatic GitHub Auth**: Dynamically checks `GITHUB_TOKEN` or `gh auth token` via `gh` CLI so you never hit GitHub rate limits, even for private repositories.
- 🔄 **One-Command Sync**: Re-sync your local skills and rules anytime across all configured agents with `dethz-crawler sync`.
- 🔔 **Automatic Update Check**: Non-blocking background check notifies you when a newer version is published on npm.
- 🛡️ **Safe by Default**: Won't overwrite existing local files unless you explicitly pass `--force`. Includes `--dry-run` to preview changes safely.

---

## Quick Start

Run directly with `bunx`:

```bash
# Pull all rules and skills from a repository
bunx dethz-crawler pull --repo owner/repo

# Pull for multiple AI agents (e.g. Claude and Cursor simultaneously)
bunx dethz-crawler pull --repo owner/repo -f claude,cursor

# List what is available before pulling
bunx dethz-crawler list --repo owner/repo
```

Or install globally in your environment:

```bash
bun add -g dethz-crawler
```

---

## Commands

### 1. `pull` (default)
Pull rules and skills from a remote GitHub repository into your chosen AI agent format(s).

```bash
# Interactive mode (prompts for rules, skills, and target AI agents)
dethz-crawler pull --repo owner/repo

# Pull for multiple AI agents simultaneously
dethz-crawler pull -r owner/repo -f claude,cursor

# Pull only skills into Claude
dethz-crawler pull -r owner/repo --type skills -f claude

# Pull a specific skill
dethz-crawler pull -r owner/repo --skill web-search

# Pull only rules
dethz-crawler pull -r owner/repo --type rules

# Force overwrite existing files
dethz-crawler pull -r owner/repo --force

# Preview actions without writing anything
dethz-crawler pull -r owner/repo --dry-run
```

### 2. `list`
Discover and preview all rules and skills available in a GitHub repository without downloading.

```bash
dethz-crawler list --repo owner/repo
```

### 3. `sync`
Re-fetch and update all previously pulled rules and skills across all configured agents recorded in `.agentrc.json`.

```bash
dethz-crawler sync
```

### 4. `init`
Initialize agent directories and configuration for one or more AI agents.

```bash
# Interactive selection of AI agents
dethz-crawler init

# Initialize specific formats (e.g. Claude and Cursor)
dethz-crawler init -f claude,cursor
```

### 5. `update`
Check npm registry for newer versions of `dethz-crawler`.

```bash
dethz-crawler update
```

---

## Options & Flags

| Flag | Description | Default |
|------|-------------|---------|
| `-r, --repo <repo>` | GitHub repository (`owner/repo` or full URL) | Prompt / `.agentrc.json` |
| `-b, --branch <name>` | Branch or git ref | Default branch (`main`/`master`) |
| `-t, --type <type>` | What to pull: `all` \| `rules` \| `skills` | `all` |
| `-f, --format <fmt...>` | Target AI agent format(s): `claude` \| `cursor` \| `windsurf` \| `copilot` \| `cline` \| `agent` \| `agents` (comma-separated or multiple) | Interactive / Auto-detected |
| `-d, --target <dir>` | Custom local directory destination | Current project |
| `--rule <name>` | Pull specific rule(s) (comma-separated or multiple) | All discovered |
| `--skill <name>` | Pull specific skill(s) (comma-separated or multiple) | All discovered |
| `--check-update` | Check npm registry for newer CLI version | `false` |
| `--force` | Overwrite existing local files | `false` |
| `--dry-run` | Simulate actions without writing files | `false` |
| `--token <token>` | Explicit GitHub Personal Access Token | Auto-detected from `gh` / env |
| `-y, --yes` | Skip interactive prompt and pull all | `false` |
| `-v, --version` | Display CLI version | |
| `-h, --help` | Display help screen | |

---

## Configuration (`.agentrc.json`)

When you pull or initialize rules, `dethz-crawler` stores project settings in `.agentrc.json`:

```json
{
  "formats": ["claude", "cursor"],
  "installedRules": [
    "rules/kizuna-inc/kz-rule:99521e5/rules/version-bump.md"
  ],
  "installedSkills": [
    "skill/kizuna-inc/kz-skill:7bcb366/skills/workspace-allow"
  ]
}
```

Running `dethz-crawler sync` will re-pull all items listed in `installedRules` and `installedSkills` across their respective repositories and configured `formats`.

---

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Run linter
bun run lint

# Build standard distribution (dist/index.js)
bun run build

# Interactive Multi-OS Build Tool (prompts for targets)
bun run build:bin

# Compile standalone executables for all platforms (macOS, Linux, Windows)
bun run build:all

# Target-specific builds
bun run scripts/build.ts --os mac                 # macOS Apple Silicon & Intel
bun run scripts/build.ts --os linux               # Linux x64 & ARM64
bun run scripts/build.ts --os windows             # Windows x64 .exe
bun run scripts/build.ts -t darwin-arm64,linux-x64 # Specific targets
```

### Supported Standalone Executable Targets
- 🍏 **macOS Apple Silicon**: `dethz-crawler-darwin-arm64` (`bun-darwin-arm64`)
- 🍏 **macOS Intel**: `dethz-crawler-darwin-x64` (`bun-darwin-x64`)
- 🐧 **Linux x64**: `dethz-crawler-linux-x64` (`bun-linux-x64`)
- 🐧 **Linux ARM64**: `dethz-crawler-linux-arm64` (`bun-linux-arm64`)
- 🪟 **Windows x64**: `dethz-crawler-windows-x64.exe` (`bun-windows-x64`)
- 📦 **JavaScript Bundle**: `dist/index.js`

---

## License

MIT © [Suphakit P.](https://github.com/dethMastery)

