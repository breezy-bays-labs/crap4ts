import { TypeScriptEslintComplexityAdapter } from "../adapters/complexity/typescript-eslint.js";
import { IstanbulCoverageAdapter } from "../adapters/coverage/istanbul.js";
import { V8CoverageAdapter } from "../adapters/coverage/v8.js";
import { detectCoverageFormat } from "../adapters/coverage/detect.js";
import { defaultSpanMatcher } from "../domain/matching.js";
import picomatch from "picomatch";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import type { AnalyzeDeps } from "./analyze.js";
import type { CoveragePort, CoverageParseResult } from "../ports/coverage-port.js";

// ── Auto-Detecting Coverage Port ──────────────────────────────────

class AutoDetectCoverageAdapter implements CoveragePort {
  private readonly istanbul: IstanbulCoverageAdapter;
  private readonly v8: V8CoverageAdapter;

  constructor(cwd?: string) {
    this.istanbul = new IstanbulCoverageAdapter(cwd);
    this.v8 = new V8CoverageAdapter(cwd);
  }

  parse(data: unknown, sources?: ReadonlyMap<string, string>): CoverageParseResult {
    const format = detectCoverageFormat(data);
    switch (format) {
      case "istanbul":
        return this.istanbul.parse(data);
      case "v8":
        return this.v8.parse(data, sources);
      default:
        throw new Error(
          `Unknown coverage format. Expected Istanbul JSON or V8 format.`,
        );
    }
  }
}

// ── File Finding ──────────────────────────────────────────────────

async function findFilesRecursive(
  patterns: string[],
  options: { cwd: string; exclude: string[] },
): Promise<string[]> {
  const matchers = patterns.map((p) => picomatch(p));
  const excludeMatchers = options.exclude.map((p) => picomatch(p));

  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relPath = relative(options.cwd, fullPath).split("\\").join("/");

      if (excludeMatchers.some((m) => m(relPath))) {
        continue;
      }

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && matchers.some((m) => m(relPath))) {
        files.push(relPath);
      }
    }
  }

  await walk(options.cwd);
  return files.sort();
}

// ── Default Dependencies ──────────────────────────────────────────

export function createDefaultDeps(cwd?: string): AnalyzeDeps {
  return {
    complexityPort: new TypeScriptEslintComplexityAdapter(),
    coveragePort: new AutoDetectCoverageAdapter(cwd),
    matcher: defaultSpanMatcher,
    globMatcher: (path: string, pattern: string) => picomatch(pattern)(path),
    readFile: async (path: string) => readFile(path, "utf-8"),
    readJson: async (path: string) => {
      const content = await readFile(path, "utf-8");
      return JSON.parse(content) as unknown;
    },
    findFiles: findFilesRecursive,
  };
}
