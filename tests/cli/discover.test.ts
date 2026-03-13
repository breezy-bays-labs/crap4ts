import { describe, it, expect } from "vitest";
import { join } from "node:path";
import {
  discoverCoverage,
  discoverSourceRoot,
  formatCoverageNotFoundError,
  type DiscoverFs,
} from "../../src/cli/discover.js";

// ── Filesystem Helpers ──────────────────────────────────────────────

function createMockFs(
  files: Record<string, string | true>,
): DiscoverFs {
  return {
    exists: (path: string) => path in files,
    readFile: (path: string) => {
      const content = files[path];
      if (content === undefined) {
        throw new Error(`ENOENT: no such file — ${path}`);
      }
      return typeof content === "string" ? content : "";
    },
  };
}

// ── discoverCoverage ────────────────────────────────────────────────

describe("discoverCoverage", () => {
  it("returns first matching coverage file in probe order", () => {
    // coverage/coverage-final.json is checked first
    const fs = createMockFs({
      [join("/project", "coverage", "coverage-final.json")]:
        JSON.stringify({ "/file.ts": { fnMap: {} } }),
      [join("/project", ".nyc_output", "coverage-final.json")]:
        JSON.stringify({ "/other.ts": { fnMap: {} } }),
    });

    const result = discoverCoverage("/project", fs);
    expect(result).not.toBeNull();
    expect(result!.path).toBe(
      join("/project", "coverage", "coverage-final.json"),
    );
    expect(result!.format).toBe("istanbul");
  });

  it("falls back to .nyc_output when coverage/ is missing", () => {
    const fs = createMockFs({
      [join("/project", ".nyc_output", "coverage-final.json")]:
        JSON.stringify({ "/file.ts": { fnMap: {} } }),
    });

    const result = discoverCoverage("/project", fs);
    expect(result).not.toBeNull();
    expect(result!.path).toBe(
      join("/project", ".nyc_output", "coverage-final.json"),
    );
    expect(result!.format).toBe("istanbul");
  });

  it("falls back to coverage/coverage-v8.json", () => {
    const v8Data = { result: [{ scriptId: "1", url: "file:///a.ts", functions: [] }] };
    const fs = createMockFs({
      [join("/project", "coverage", "coverage-v8.json")]:
        JSON.stringify(v8Data),
    });

    const result = discoverCoverage("/project", fs);
    expect(result).not.toBeNull();
    expect(result!.path).toBe(
      join("/project", "coverage", "coverage-v8.json"),
    );
    expect(result!.format).toBe("v8");
  });

  it("detects V8 format from file contents", () => {
    const v8Array = [{ scriptId: "1", url: "file:///a.ts", functions: [] }];
    const fs = createMockFs({
      [join("/project", "coverage", "coverage-final.json")]:
        JSON.stringify(v8Array),
    });

    const result = discoverCoverage("/project", fs);
    expect(result).not.toBeNull();
    expect(result!.format).toBe("v8");
  });

  it("detects Istanbul format from file contents", () => {
    const istanbul = {
      "/src/index.ts": {
        path: "/src/index.ts",
        fnMap: {},
        f: {},
        statementMap: {},
        s: {},
        branchMap: {},
        b: {},
      },
    };
    const fs = createMockFs({
      [join("/project", "coverage", "coverage-final.json")]:
        JSON.stringify(istanbul),
    });

    const result = discoverCoverage("/project", fs);
    expect(result).not.toBeNull();
    expect(result!.format).toBe("istanbul");
  });

  it("returns null when no coverage files exist", () => {
    const fs = createMockFs({});
    const result = discoverCoverage("/project", fs);
    expect(result).toBeNull();
  });

  it("skips files with unreadable contents and tries next", () => {
    const fs: DiscoverFs = {
      exists: (path: string) =>
        path === join("/project", "coverage", "coverage-final.json") ||
        path === join("/project", ".nyc_output", "coverage-final.json"),
      readFile: (path: string) => {
        if (path === join("/project", "coverage", "coverage-final.json")) {
          throw new Error("Permission denied");
        }
        return JSON.stringify({ "/file.ts": { fnMap: {} } });
      },
    };

    const result = discoverCoverage("/project", fs);
    expect(result).not.toBeNull();
    expect(result!.path).toBe(
      join("/project", ".nyc_output", "coverage-final.json"),
    );
  });

  it("skips files with invalid JSON and tries next", () => {
    const fs = createMockFs({
      [join("/project", "coverage", "coverage-final.json")]:
        "not valid json {{{",
      [join("/project", ".nyc_output", "coverage-final.json")]:
        JSON.stringify({ "/file.ts": { fnMap: {} } }),
    });

    const result = discoverCoverage("/project", fs);
    expect(result).not.toBeNull();
    expect(result!.path).toBe(
      join("/project", ".nyc_output", "coverage-final.json"),
    );
  });

  it("skips files with unknown coverage format", () => {
    const fs = createMockFs({
      [join("/project", "coverage", "coverage-final.json")]:
        JSON.stringify({ someRandomKey: "value" }),
      [join("/project", ".nyc_output", "coverage-final.json")]:
        JSON.stringify({ "/file.ts": { fnMap: {} } }),
    });

    const result = discoverCoverage("/project", fs);
    expect(result).not.toBeNull();
    expect(result!.path).toBe(
      join("/project", ".nyc_output", "coverage-final.json"),
    );
    expect(result!.format).toBe("istanbul");
  });
});

// ── discoverSourceRoot ──────────────────────────────────────────────

describe("discoverSourceRoot", () => {
  it("reads rootDir from tsconfig.json", () => {
    const tsconfig = { compilerOptions: { rootDir: "lib" } };
    const fs = createMockFs({
      [join("/project", "tsconfig.json")]: JSON.stringify(tsconfig),
      [join("/project", "lib")]: true,
    });

    const result = discoverSourceRoot("/project", fs);
    expect(result).toBe(join("/project", "lib"));
  });

  it("reads include[0] from tsconfig.json when no rootDir", () => {
    const tsconfig = { include: ["src/**/*.ts"] };
    const fs = createMockFs({
      [join("/project", "tsconfig.json")]: JSON.stringify(tsconfig),
      [join("/project", "src")]: true,
    });

    const result = discoverSourceRoot("/project", fs);
    expect(result).toBe(join("/project", "src"));
  });

  it("falls back to ./src if it exists", () => {
    const fs = createMockFs({
      [join("/project", "src")]: true,
    });

    const result = discoverSourceRoot("/project", fs);
    expect(result).toBe(join("/project", "src"));
  });

  it("falls back to cwd when nothing else matches", () => {
    const fs = createMockFs({});
    const result = discoverSourceRoot("/project", fs);
    expect(result).toBe("/project");
  });

  it("falls back to ./src when tsconfig.json is invalid JSON", () => {
    const fs = createMockFs({
      [join("/project", "tsconfig.json")]: "not json",
      [join("/project", "src")]: true,
    });

    const result = discoverSourceRoot("/project", fs);
    expect(result).toBe(join("/project", "src"));
  });

  it("falls back to cwd when tsconfig rootDir does not exist", () => {
    const tsconfig = { compilerOptions: { rootDir: "nonexistent" } };
    const fs = createMockFs({
      [join("/project", "tsconfig.json")]: JSON.stringify(tsconfig),
    });

    const result = discoverSourceRoot("/project", fs);
    expect(result).toBe("/project");
  });

  it("extracts base dir from glob include pattern", () => {
    // "src/**/*.ts" → "src"
    const tsconfig = { include: ["source/**/*.ts"] };
    const fs = createMockFs({
      [join("/project", "tsconfig.json")]: JSON.stringify(tsconfig),
      [join("/project", "source")]: true,
    });

    const result = discoverSourceRoot("/project", fs);
    expect(result).toBe(join("/project", "source"));
  });
});

// ── formatCoverageNotFoundError ─────────────────────────────────────

describe("formatCoverageNotFoundError", () => {
  it("lists all probed paths", () => {
    const message = formatCoverageNotFoundError("/my/project");
    expect(message).toContain("coverage/coverage-final.json");
    expect(message).toContain(".nyc_output/coverage-final.json");
    expect(message).toContain("coverage/coverage-v8.json");
  });

  it("includes actionable guidance", () => {
    const message = formatCoverageNotFoundError("/my/project");
    expect(message).toMatch(/--coverage/i);
  });

  it("mentions the working directory", () => {
    const message = formatCoverageNotFoundError("/my/project");
    expect(message).toContain("/my/project");
  });
});
