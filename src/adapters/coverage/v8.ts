import type { CoveragePort } from "../../ports/coverage-port.js";
import type {
  FunctionCoverage,
  CoverageRatio,
  SourceSpan,
} from "../../domain/types.js";

// ── V8 Coverage JSON types ────────────────────────────────────────

interface V8Range {
  readonly startOffset: number;
  readonly endOffset: number;
  readonly count: number;
}

interface V8FunctionCoverage {
  readonly functionName: string;
  readonly ranges: readonly V8Range[];
  readonly isBlockCoverage: boolean;
}

interface V8ScriptCoverage {
  readonly scriptId: string;
  readonly url: string;
  readonly functions: readonly V8FunctionCoverage[];
}

interface V8CoverageData {
  readonly result: readonly V8ScriptCoverage[];
}

// ── Constants ─────────────────────────────────────────────────────

/** Approximate characters per line for byte-offset → line-number conversion. */
const APPROX_CHARS_PER_LINE = 40;

// ── Helpers ───────────────────────────────────────────────────────

function stripFileProtocol(url: string): string {
  if (url.startsWith("file:///")) {
    const stripped = url.slice("file:///".length);
    // On Unix, paths start with / (e.g. file:///home/...) → restore leading /
    // On Windows, paths start with drive letter (e.g. file:///C:/...) → no leading /
    if (/^[a-zA-Z]:/.test(stripped)) {
      return stripped;
    }
    return "/" + stripped;
  }
  return url;
}

function findLongestCommonPrefix(paths: readonly string[]): string {
  if (paths.length === 0) return "";
  if (paths.length === 1) {
    const lastSlash = paths[0]!.lastIndexOf("/");
    return lastSlash >= 0 ? paths[0]!.slice(0, lastSlash + 1) : "";
  }

  const sorted = [...paths].sort();
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;

  let i = 0;
  while (i < first.length && i < last.length && first[i] === last[i]) {
    i++;
  }

  const prefix = first.slice(0, i);
  const lastSlash = prefix.lastIndexOf("/");
  return lastSlash >= 0 ? prefix.slice(0, lastSlash + 1) : "";
}

function normalizePath(absolutePath: string, prefix: string): string {
  let relative = absolutePath;
  if (prefix && absolutePath.startsWith(prefix)) {
    relative = absolutePath.slice(prefix.length);
  }
  return relative.replace(/\\/g, "/").replace(/^\/+/, "");
}

function computeByteCoverage(ranges: readonly V8Range[]): CoverageRatio {
  const outer = ranges[0]!;
  const totalBytes = outer.endOffset - outer.startOffset;

  if (totalBytes === 0) {
    return { covered: 0, total: 0, percent: 100 };
  }

  // Sum bytes from ranges with count === 0
  let uncoveredBytes = 0;
  for (const range of ranges) {
    if (range.count === 0) {
      uncoveredBytes += range.endOffset - range.startOffset;
    }
  }

  const coveredBytes = totalBytes - uncoveredBytes;
  const percent =
    Math.round((coveredBytes / totalBytes) * 10000) / 100;

  return { covered: coveredBytes, total: totalBytes, percent };
}

function byteOffsetToLine(offset: number): number {
  return Math.max(1, Math.ceil(offset / APPROX_CHARS_PER_LINE));
}

function computeApproximateSpan(outerRange: V8Range): SourceSpan {
  const startLine = byteOffsetToLine(outerRange.startOffset);
  const endLine = Math.max(
    startLine + 1,
    Math.ceil(outerRange.endOffset / APPROX_CHARS_PER_LINE) + 1,
  );

  return {
    startLine,
    startColumn: 0,
    endLine, // exclusive, per domain convention
    endColumn: 0,
  };
}

// ── Adapter ───────────────────────────────────────────────────────

export class V8CoverageAdapter implements CoveragePort {
  private readonly cwd: string | undefined;

  constructor(cwd?: string) {
    this.cwd = cwd;
  }

  parse(data: unknown): Map<string, FunctionCoverage[]> {
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      throw new Error(
        "Invalid V8 coverage data: expected an object with a 'result' array",
      );
    }

    const v8Data = data as V8CoverageData;

    if (!Array.isArray(v8Data.result)) {
      throw new Error(
        "Invalid V8 coverage data: expected an object with a 'result' array",
      );
    }

    const scripts = v8Data.result;

    // Resolve absolute paths from URLs
    const absolutePaths = scripts.map((s) => stripFileProtocol(s.url));

    // Determine prefix to strip
    const prefix = this.cwd
      ? this.cwd.replace(/\\/g, "/").replace(/\/?$/, "/")
      : findLongestCommonPrefix(absolutePaths);

    const result = new Map<string, FunctionCoverage[]>();

    for (let i = 0; i < scripts.length; i++) {
      const script = scripts[i]!;
      const absolutePath = absolutePaths[i]!;
      const relativePath = normalizePath(absolutePath, prefix);
      const functions: FunctionCoverage[] = [];

      for (const fn of script.functions) {
        // Skip anonymous functions (empty name)
        if (!fn.functionName) continue;

        // Skip functions with no ranges
        if (fn.ranges.length === 0) continue;

        const outerRange = fn.ranges[0]!;
        const span = computeApproximateSpan(outerRange);
        const lineCoverage = computeByteCoverage(fn.ranges);

        functions.push({
          filePath: relativePath,
          name: fn.functionName,
          span,
          lineCoverage,
          branchCoverage: null, // Raw V8 coverage lacks branch semantics
        });
      }

      result.set(relativePath, functions);
    }

    return result;
  }
}
