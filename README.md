# ⚡ dethz-crawler

> Fast, lightweight CLI tool to pull `SKILL.md` (skills) and rules from GitHub directly into your local project.

Built natively with **[Bun](https://bun.com)** and TypeScript. Zero external runtime dependencies.

---

## Features

- 🚀 **Zero external runtime dependencies**: Uses Bun's native `Bun.file`, `Bun.$`, and `fetch`.
- 📁 **Universal agent formats**: Automatically places rules and skills into:
  - `.agent/rules/` and `.agent/skills/` (Universal Agent convention)
  - `.agents/rules/` and `.agents/skills/` (Antigravity convention)
  - `.cursor/rules/*.mdc` (Cursor IDE convention)
  - `.claude/` / `CLAUDE.md` (Anthropic Claude convention)
- 🧠 **Smart Skill Tree Discovery**: Automatically discovers any `SKILL.md` along with its auxiliary files (`scripts/`, `references/`, `resources/`).
- 🔑 **Automatic GitHub Auth**: Dynamically checks `GITHUB_TOKEN` or `gh auth token` via `gh` CLI so you never hit GitHub rate limits, even for private repositories.
- 🔄 **One-Command Sync**: Re-sync your local skills and rules anytime with `dethz-crawler sync`.
- 🛡️ **Safe by Default**: Won't overwrite existing local files unless you explicitly pass `--force`. Includes `--dry-run` to preview changes safely.

---

## Quick Start

Run directly with `bunx`:

```bash
# Pull all rules and skills from a repository
bunx dethz-crawler pull --repo owner/repo

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
Pull rules and skills from a remote GitHub repository.

```bash
# Pull everything into default format (.agent/)
dethz-crawler pull --repo owner/repo

# Pull only skills
dethz-crawler pull -r owner/repo --type skills

# Pull a specific skill
dethz-crawler pull -r owner/repo --skill web-search

# Pull only rules
dethz-crawler pull -r owner/repo --type rules

# Pull rules in Cursor format (.cursor/rules/*.mdc)
dethz-crawler pull -r owner/repo --format cursor

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
Re-fetch and update all previously pulled rules and skills recorded in `.agentrc.json`.

```bash
dethz-crawler sync
```

### 4. `init`
Initialize local agent directories and configuration.

```bash
# Initialize universal format (.agent/rules, .agent/skills)
dethz-crawler init

# Initialize Cursor format (.cursor/rules, .cursor/skills)
dethz-crawler init --format cursor
```

---

## Options & Flags

| Flag | Description | Default |
|------|-------------|---------|
| `-r, --repo <repo>` | GitHub repository (`owner/repo` or full URL) | Prompt / `.agentrc.json` |
| `-b, --branch <name>` | Branch or git ref | Default branch (`main`/`master`) |
| `-t, --type <type>` | What to pull: `all` \| `rules` \| `skills` | `all` |
| `-f, --format <fmt>` | Target format: `agent` \| `agents` \| `cursor` \| `claude` | Auto-detected / `agent` |
| `-d, --target <dir>` | Custom local directory destination | Current project |
| `--rule <name>` | Pull specific rule(s) (comma-separated or multiple) | All discovered |
| `--skill <name>` | Pull specific skill(s) (comma-separated or multiple) | All discovered |
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
  "repo": "owner/repo",
  "branch": "main",
  "format": "agent",
  "lastSync": "2026-09-17T02:00:00.000Z",
  "installedRules": ["use-bun-instead-of-node-vite-npm-pnpm"],
  "installedSkills": ["web-search"]
}
```

Running `dethz-crawler sync` will re-pull all items listed in `installedRules` and `installedSkills` from the remote repository.

---

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Run linter
bun run lint

# Build binary / distribution
bun run build
```

## License

MIT © [Suphakit P.](https://github.com/dethMastery)
