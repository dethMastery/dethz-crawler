import { describe, expect, it } from "bun:test";
import { isRulePath, parseFrontmatter, scanTree } from "../src/scanner.ts";
import type { GitHubTreeItem } from "../src/types.ts";

describe("scanner", () => {
  describe("parseFrontmatter", () => {
    it("should parse yaml frontmatter correctly", () => {
      const content = `---
description: "Use Bun instead of Node"
globs: "*.ts, *.tsx"
alwaysApply: false
---

# Bun Rules
Content goes here.`;

      const { metadata, body } = parseFrontmatter(content);
      expect(metadata.description).toBe("Use Bun instead of Node");
      expect(metadata.globs).toBe("*.ts, *.tsx");
      expect(metadata.alwaysApply).toBe(false);
      expect(body).toContain("# Bun Rules");
    });

    it("should return empty metadata when no frontmatter exists", () => {
      const content = "# Just a markdown file\nSome text";
      const { metadata, body } = parseFrontmatter(content);
      expect(metadata).toEqual({});
      expect(body).toBe(content);
    });
  });

  describe("isRulePath", () => {
    it("should recognize valid rule paths", () => {
      expect(isRulePath(".agent/rules/use-bun.md")).toBe(true);
      expect(isRulePath(".agents/rules/test.md")).toBe(true);
      expect(isRulePath(".cursor/rules/bun.mdc")).toBe(true);
      expect(isRulePath(".claude/rules/guidelines.md")).toBe(true);
      expect(isRulePath(".windsurf/rules/rules.md")).toBe(true);
      expect(isRulePath(".cline/rules/coding.md")).toBe(true);
      expect(isRulePath(".github/instructions/guidelines.md")).toBe(true);
      expect(isRulePath("rules/standard.md")).toBe(true);
      expect(isRulePath("CLAUDE.md")).toBe(true);
      expect(isRulePath("AGENTS.md")).toBe(true);
      expect(isRulePath("GEMINI.md")).toBe(true);
      expect(isRulePath(".windsurfrules")).toBe(true);
      expect(isRulePath(".clinerules")).toBe(true);
      expect(isRulePath(".cursorrules")).toBe(true);
      expect(isRulePath(".github/copilot-instructions.md")).toBe(true);
    });

    it("should reject non-rule paths", () => {
      expect(isRulePath("src/index.ts")).toBe(false);
      expect(isRulePath("package.json")).toBe(false);
      expect(isRulePath("README.md")).toBe(false);
      expect(isRulePath("docs/rules.txt")).toBe(false);
    });
  });

  describe("scanTree", () => {
    it("should detect skills and attached files", () => {
      const mockTree: GitHubTreeItem[] = [
        {
          path: "skills/test-skill/SKILL.md",
          mode: "100644",
          type: "blob",
          sha: "sha1",
          url: "url1",
          size: 100,
        },
        {
          path: "skills/test-skill/scripts/helper.sh",
          mode: "100644",
          type: "blob",
          sha: "sha2",
          url: "url2",
          size: 50,
        },
        {
          path: ".agent/rules/use-bun.md",
          mode: "100644",
          type: "blob",
          sha: "sha3",
          url: "url3",
          size: 200,
        },
      ];

      const { rules, skills } = scanTree(mockTree, "owner", "repo", "main");

      expect(skills.length).toBe(1);
      expect(skills[0]!.name).toBe("test-skill");
      expect(skills[0]!.files.length).toBe(2);
      expect(skills[0]!.files.map((f) => f.relativePath)).toContain("SKILL.md");
      expect(skills[0]!.files.map((f) => f.relativePath)).toContain("scripts/helper.sh");

      expect(rules.length).toBe(1);
      expect(rules[0]!.name).toBe("use-bun");
      expect(rules[0]!.filename).toBe("use-bun.md");
    });
  });
});
