import { describe, expect, it } from "bun:test";
import path from "node:path";
import os from "node:os";
import {
  TARGET_PLATFORMS,
  parseTargetArguments,
  computeSha256,
} from "../scripts/build.ts";

describe("build tool", () => {
  it("should define all supported target platforms", () => {
    const targetIds = TARGET_PLATFORMS.map((t) => t.id);
    expect(targetIds).toContain("darwin-arm64");
    expect(targetIds).toContain("darwin-x64");
    expect(targetIds).toContain("linux-x64");
    expect(targetIds).toContain("linux-arm64");
    expect(targetIds).toContain("windows-x64");
    expect(TARGET_PLATFORMS.length).toBe(5);
  });

  describe("parseTargetArguments", () => {
    it("should return all platforms when allFlag is true", () => {
      const targets = parseTargetArguments(undefined, undefined, true);
      expect(targets).toHaveLength(5);
      expect(targets.map((t) => t.id)).toEqual(TARGET_PLATFORMS.map((t) => t.id));
    });

    it("should parse explicit target IDs", () => {
      const targets = parseTargetArguments("darwin-arm64,windows-x64");
      expect(targets).toHaveLength(2);
      expect(targets.map((t) => t.id)).toContain("darwin-arm64");
      expect(targets.map((t) => t.id)).toContain("windows-x64");
    });

    it("should parse OS filters for mac", () => {
      const targets = parseTargetArguments(undefined, "mac");
      expect(targets).toHaveLength(2);
      expect(targets.map((t) => t.id)).toEqual(["darwin-arm64", "darwin-x64"]);
    });

    it("should parse OS filters for linux", () => {
      const targets = parseTargetArguments(undefined, "linux");
      expect(targets).toHaveLength(2);
      expect(targets.map((t) => t.id)).toEqual(["linux-x64", "linux-arm64"]);
    });

    it("should parse OS filters for windows", () => {
      const targets = parseTargetArguments(undefined, "windows");
      expect(targets).toHaveLength(1);
      expect(targets[0]?.id).toBe("windows-x64");
      expect(targets[0]?.ext).toBe(".exe");
    });

    it("should combine both target and os arguments without duplicates", () => {
      const targets = parseTargetArguments("darwin-arm64", "mac,linux");
      expect(targets.length).toBe(4);
      const ids = targets.map((t) => t.id);
      expect(ids).toContain("darwin-arm64");
      expect(ids).toContain("darwin-x64");
      expect(ids).toContain("linux-x64");
      expect(ids).toContain("linux-arm64");
    });
  });

  describe("computeSha256", () => {
    it("should compute accurate SHA-256 hash of a file", async () => {
      const tempFile = path.resolve(os.tmpdir(), `dethz-test-sha-${Date.now()}.txt`);
      await Bun.write(tempFile, "hello-world-dethz-agent");

      const hash = await computeSha256(tempFile);
      expect(hash).toBeString();
      expect(hash.length).toBe(64); // 64 hex characters for SHA-256
    });
  });
});
