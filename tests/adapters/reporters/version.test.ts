import { describe, expect, it } from "vitest";
import {
  readPackageVersionFrom,
  type VersionFs,
} from "../../../src/adapters/reporters/version.js";

function createFs(overrides: Partial<VersionFs> = {}): VersionFs {
  return {
    exists: () => false,
    read: () => '{"version":"1.2.3"}',
    ...overrides,
  };
}

describe("readPackageVersionFrom", () => {
  it("returns the version from the nearest package.json", () => {
    const fs = createFs({
      exists: (path: string) => path === "/repo/package.json",
    });

    expect(readPackageVersionFrom("/repo/dist/chunks", fs)).toBe("1.2.3");
  });

  it("falls back to 0.0.0 when package.json cannot be found", () => {
    expect(readPackageVersionFrom("/repo/dist/chunks", createFs())).toBe("0.0.0");
  });

  it("falls back to 0.0.0 when package.json disappears before read", () => {
    const fs = createFs({
      exists: (path: string) => path === "/repo/package.json",
      read: () => {
        const error = new Error("missing") as Error & { code: string };
        error.code = "ENOENT";
        throw error;
      },
    });

    expect(readPackageVersionFrom("/repo/dist/chunks", fs)).toBe("0.0.0");
  });

  it("rethrows invalid package.json contents", () => {
    const fs = createFs({
      exists: (path: string) => path === "/repo/package.json",
      read: () => "{not-json",
    });

    expect(() => readPackageVersionFrom("/repo/dist/chunks", fs)).toThrow();
  });
});
