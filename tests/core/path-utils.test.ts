import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  normalizeGlobPattern,
  normalizeProjectPath,
  resolveIncludePatterns,
  resolveInputPath,
} from "../../src/core/path-utils.js";

const tempDirs: string[] = [];

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("normalizeProjectPath", () => {
  it("strips leading ./ segments", () => {
    expect(normalizeProjectPath("./src/example.ts", "/repo")).toBe("src/example.ts");
  });

  it("normalizes backslashes to forward slashes", () => {
    expect(normalizeProjectPath("src\\cli\\file.ts", "/repo")).toBe("src/cli/file.ts");
  });

  it("canonicalizes existing absolute paths against a symlinked cwd", () => {
    const root = createTempDir("crap4ts-paths-");
    const actual = join(root, "actual");
    const link = join(root, "link");

    mkdirSync(join(actual, "src"), { recursive: true });
    symlinkSync(actual, link);

    expect(normalizeProjectPath(join(actual, "src", "file.ts"), link)).toBe("src/file.ts");
  });

  it("falls back to resolved paths for missing absolute inputs", () => {
    const cwd = createTempDir("crap4ts-paths-");
    const missing = join(cwd, "missing", "file.ts");

    expect(normalizeProjectPath(missing, cwd)).toBe("missing/file.ts");
  });
});

describe("resolveInputPath", () => {
  it("returns undefined when no input path is provided", () => {
    expect(resolveInputPath(undefined, "/repo")).toBeUndefined();
  });

  it("resolves relative input paths from cwd", () => {
    const cwd = createTempDir("crap4ts-paths-");
    const canonicalCwd = realpathSync.native(cwd);
    expect(resolveInputPath("coverage/coverage-final.json", cwd))
      .toBe(join(canonicalCwd, "coverage", "coverage-final.json"));
  });

  it("returns missing absolute paths without throwing", () => {
    const cwd = createTempDir("crap4ts-paths-");
    const canonicalCwd = realpathSync.native(cwd);
    const missing = join(cwd, "coverage", "missing.json");

    expect(resolveInputPath(missing, cwd)).toBe(join(canonicalCwd, "coverage", "missing.json"));
  });

  it("canonicalizes deeply nested missing paths from the nearest existing ancestor", () => {
    const root = createTempDir("crap4ts-paths-");
    const actual = join(root, "actual");
    const link = join(root, "link");

    mkdirSync(actual, { recursive: true });
    symlinkSync(actual, link);
    const canonicalActual = realpathSync.native(actual);

    const missing = join(link, "coverage", "nested", "reports", "missing.json");

    expect(resolveInputPath(missing, link))
      .toBe(join(canonicalActual, "coverage", "nested", "reports", "missing.json"));
  });
});

describe("normalizeGlobPattern", () => {
  it("normalizes relative glob patterns", () => {
    expect(normalizeGlobPattern("./src/*.{ts,tsx}", "/repo")).toBe("src/*.{ts,tsx}");
  });

  it("normalizes absolute glob patterns with metacharacters", () => {
    const cwd = createTempDir("crap4ts-paths-");
    const pattern = join(cwd, "src", "**", "*.ts");

    expect(normalizeGlobPattern(pattern, cwd)).toBe("src/**/*.ts");
  });
});

describe("resolveIncludePatterns", () => {
  it("uses root globs when src is '.'", () => {
    expect(resolveIncludePatterns("/repo", ".")).toEqual(["**/*.ts", "**/*.tsx"]);
  });

  it("normalizes source directories into ts and tsx include patterns", () => {
    expect(resolveIncludePatterns("/repo", ["./src", "lib\\nested"])).toEqual([
      "src/**/*.ts",
      "src/**/*.tsx",
      "lib/nested/**/*.ts",
      "lib/nested/**/*.tsx",
    ]);
  });

  it("prefers include globs over src directories", () => {
    expect(resolveIncludePatterns("/repo", "src", ["./custom/**/*.ts"]))
      .toEqual(["custom/**/*.ts"]);
  });
});
