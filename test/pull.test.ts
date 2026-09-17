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
  });

  describe("formatRuleFilename", () => {
    it("should convert to .mdc for cursor format", () => {
      expect(formatRuleFilename("use-bun.md", "cursor")).toBe("use-bun.mdc");
    });

    it("should convert to .md for agent format", () => {
      expect(formatRuleFilename("use-bun.mdc", "agent")).toBe("use-bun.md");
    });

    it("should preserve special root files", () => {
      expect(formatRuleFilename("CLAUDE.md", "cursor")).toBe("CLAUDE.md");
      expect(formatRuleFilename("AGENTS.md", "agent")).toBe("AGENTS.md");
    });
  });

  describe("config", () => {
    it("should save and load config properly using Bun.file", async () => {
      const tempDir = path.resolve(os.tmpdir(), `crawler-test-${Date.now()}`);
      const testConfig = {
        repo: "dethMastery/test-repo",
        format: "agent" as const,
        installedRules: ["rule-1", "rule-2"],
      };

      await saveConfig(testConfig, tempDir);
      const loaded = await loadConfig(tempDir);

      expect(loaded.repo).toBe("dethMastery/test-repo");
      expect(loaded.format).toBe("agent");
      expect(loaded.installedRules).toEqual(["rule-1", "rule-2"]);
    });
  });
});

