import { describe, expect, it } from "bun:test";
import { parseRepo } from "../src/github.ts";
import { formatRuleFilename, getTargetDirectories } from "../src/pull.ts";
import { loadConfig, saveConfig } from "../src/config.ts";
import path from "node:path";
import os from "node:os";

describe("github", () => {
  describe("parseRepo", () => {
    it("should parse owner/repo format", () => {
      const res = parseRepo("dethMastery/dotfiles");
      expect(res.owner).toBe("dethMastery");
      expect(res.repo).toBe("dotfiles");
    });

    it("should parse full https github urls", () => {
      const res = parseRepo("https://github.com/dethMastery/dethz-agent");
      expect(res.owner).toBe("dethMastery");
      expect(res.repo).toBe("dethz-agent");
    });

    it("should parse ssh github urls", () => {
      const res = parseRepo("git@github.com:facebook/react.git");
      expect(res.owner).toBe("facebook");
      expect(res.repo).toBe("react");
    });

    it("should throw on invalid format", () => {
      expect(() => parseRepo("invalid-repo")).toThrow();
    });
  });
});

describe("pull", () => {
  describe("getTargetDirectories", () => {
    it("should return .agent dirs for agent format", () => {
      const dirs = getTargetDirectories("/root", "agent");
      expect(dirs.rulesDir).toBe(path.resolve("/root/.agent/rules"));
      expect(dirs.skillsDir).toBe(path.resolve("/root/.agent/skills"));
    });

    it("should return .agents dirs for agents format", () => {
      const dirs = getTargetDirectories("/root", "agents");
      expect(dirs.rulesDir).toBe(path.resolve("/root/.agents/rules"));
      expect(dirs.skillsDir).toBe(path.resolve("/root/.agents/skills"));
    });

    it("should return .cursor dirs for cursor format", () => {
      const dirs = getTargetDirectories("/root", "cursor");
      expect(dirs.rulesDir).toBe(path.resolve("/root/.cursor/rules"));
      expect(dirs.skillsDir).toBe(path.resolve("/root/.cursor/skills"));
    });

    it("should return .claude dirs for claude format", () => {
      const dirs = getTargetDirectories("/root", "claude");
      expect(dirs.rulesDir).toBe(path.resolve("/root/.claude/rules"));
      expect(dirs.skillsDir).toBe(path.resolve("/root/.claude/skills"));
    });

    it("should return .windsurf dirs for windsurf format", () => {
      const dirs = getTargetDirectories("/root", "windsurf");
      expect(dirs.rulesDir).toBe(path.resolve("/root/.windsurf/rules"));
      expect(dirs.skillsDir).toBe(path.resolve("/root/.windsurf/skills"));
    });

    it("should return .github dirs for copilot format", () => {
      const dirs = getTargetDirectories("/root", "copilot");
      expect(dirs.rulesDir).toBe(path.resolve("/root/.github/instructions"));
      expect(dirs.skillsDir).toBe(path.resolve("/root/.github/skills"));
    });

    it("should return .cline dirs for cline format", () => {
      const dirs = getTargetDirectories("/root", "cline");
      expect(dirs.rulesDir).toBe(path.resolve("/root/.cline/rules"));
      expect(dirs.skillsDir).toBe(path.resolve("/root/.cline/skills"));
    });
  });

  describe("formatRuleFilename", () => {
    it("should convert to .mdc for cursor format", () => {
      expect(formatRuleFilename("use-bun.md", "cursor")).toBe("use-bun.mdc");
    });

    it("should convert to .md for agent format", () => {
      expect(formatRuleFilename("use-bun.mdc", "agent")).toBe("use-bun.md");
    });

    it("should convert to .md for claude format", () => {
      expect(formatRuleFilename("use-bun.mdc", "claude")).toBe("use-bun.md");
    });

    it("should preserve special root files", () => {
      expect(formatRuleFilename("CLAUDE.md", "cursor")).toBe("CLAUDE.md");
      expect(formatRuleFilename("AGENTS.md", "agent")).toBe("AGENTS.md");
      expect(formatRuleFilename(".windsurfrules", "windsurf")).toBe(".windsurfrules");
      expect(formatRuleFilename(".clinerules", "cline")).toBe(".clinerules");
    });
  });

  describe("config", () => {
    it("should save and load config properly using Bun.file", async () => {
      const tempDir = path.resolve(os.tmpdir(), `dethz-crawler-test-${Date.now()}`);
      const testConfig = {
        repo: "dethMastery/test-repo",
        format: "agent" as const,
        installedRules: ["rule-1", "rule-2"],
      };

      await saveConfig(testConfig, tempDir);
      const loaded = await loadConfig(tempDir);

      expect(loaded.repo).toBe("dethMastery/test-repo");
      expect(loaded.format).toBe("agent");
      expect(loaded.formats).toEqual(["agent"]);
      expect(loaded.installedRules).toEqual(["rule-1", "rule-2"]);
    });

    it("should support multiple formats in config", async () => {
      const tempDir = path.resolve(os.tmpdir(), `dethz-crawler-multi-${Date.now()}`);
      const testConfig = {
        repo: "dethMastery/test-repo",
        formats: ["claude" as const, "cursor" as const],
        installedRules: ["rule-1"],
      };

      await saveConfig(testConfig, tempDir);
      const loaded = await loadConfig(tempDir);

      expect(loaded.formats).toEqual(["claude", "cursor"]);
      expect(loaded.format).toBe("claude");
    });
  });

  describe("pullItems with multiple formats", () => {
    it("should handle multi-format dry run without throwing", async () => {
      const { pullItems } = await import("../src/pull.ts");
      const result = await pullItems({
        owner: "test",
        repo: "test-repo",
        branch: "main",
        rules: [
          {
            id: "rule1",
            name: "rule1",
            filename: "rule1.md",
            sourcePath: ".agent/rules/rule1.md",
            rawUrl: "http://example.com",
            sha: "123",
          },
        ],
        skills: [
          {
            id: "skill1",
            name: "skill1",
            skillMdPath: "skills/skill1/SKILL.md",
            baseDir: "skills/skill1",
            files: [
              {
                path: "skills/skill1/SKILL.md",
                relativePath: "SKILL.md",
                rawUrl: "http://example.com",
                sha: "456",
              },
            ],
          },
        ],
        options: {
          repo: "test/test-repo",
          formats: ["claude", "cursor"],
          dryRun: true,
        },
        projectRoot: "/mock/root",
      });

      expect(result.rulesPulled).toContain("rule1");
      expect(result.skillsPulled).toContain("skill1");
      expect(result.filesWritten.length).toBe(4); // 2 rule files (.claude, .cursor) + 2 skill files (.claude, .cursor)
      expect(result.filesWritten.some((f) => f.includes(".claude/rules"))).toBe(true);
      expect(result.filesWritten.some((f) => f.includes(".cursor/rules"))).toBe(true);
      expect(result.filesWritten.some((f) => f.includes(".claude/skills"))).toBe(true);
      expect(result.filesWritten.some((f) => f.includes(".cursor/skills"))).toBe(true);
    });
  });
});

