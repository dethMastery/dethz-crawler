import { describe, expect, it } from "bun:test";
import os from "node:os";
import path from "node:path";
import {
  checkPackageUpdate,
  isNewerVersion,
  loadCache,
} from "../src/update.ts";

describe("update", () => {
  describe("isNewerVersion", () => {
    it("should return true when remote patch version is higher", () => {
      expect(isNewerVersion("0.2.1", "0.2.0")).toBe(true);
    });

    it("should return true when remote minor version is higher", () => {
      expect(isNewerVersion("0.3.0", "0.2.0")).toBe(true);
    });

    it("should return true when remote major version is higher", () => {
      expect(isNewerVersion("1.0.0", "0.2.0")).toBe(true);
    });

    it("should return false when versions are identical", () => {
      expect(isNewerVersion("0.2.0", "0.2.0")).toBe(false);
    });

    it("should return false when local version is higher", () => {
      expect(isNewerVersion("0.1.9", "0.2.0")).toBe(false);
      expect(isNewerVersion("0.1.0", "0.2.0")).toBe(false);
    });

    it("should handle 'v' prefix in version string", () => {
      expect(isNewerVersion("v0.3.0", "v0.2.0")).toBe(true);
      expect(isNewerVersion("v0.2.0", "v0.2.0")).toBe(false);
    });
  });

  describe("checkPackageUpdate with cache", () => {
    it("should correctly detect when an update is available", async () => {
      const tempCacheFile = path.resolve(
        os.tmpdir(),
        `dethz-crawler-update-test-${Date.now()}.json`
      );

      // Pre-seed cache with newer version
      await Bun.write(
        tempCacheFile,
        JSON.stringify({
          lastChecked: Date.now(),
          latestVersion: "99.0.0",
        })
      );

      const res = await checkPackageUpdate("0.2.0", false, tempCacheFile);
      expect(res).not.toBeNull();
      expect(res?.hasUpdate).toBe(true);
      expect(res?.latest).toBe("99.0.0");
      expect(res?.current).toBe("0.2.0");
    });

    it("should correctly detect when already up to date", async () => {
      const tempCacheFile = path.resolve(
        os.tmpdir(),
        `dethz-crawler-update-test-${Date.now()}.json`
      );

      // Pre-seed cache with current version
      await Bun.write(
        tempCacheFile,
        JSON.stringify({
          lastChecked: Date.now(),
          latestVersion: "0.2.0",
        })
      );

      const res = await checkPackageUpdate("0.2.0", false, tempCacheFile);
      expect(res).not.toBeNull();
      expect(res?.hasUpdate).toBe(false);
      expect(res?.latest).toBe("0.2.0");
    });
  });
});
