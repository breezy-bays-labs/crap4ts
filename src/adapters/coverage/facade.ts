import { readFileSync } from "node:fs";
import { IstanbulCoverageAdapter } from "./istanbul.js";
import { V8CoverageAdapter } from "./v8.js";
import { detectCoverageFormat } from "./detect.js";
import type { CoverageFormat } from "./detect.js";
import type {
  FunctionCoverage,
  Warning,
} from "../../domain/types.js";

// ── API Boundary Errors ───────────────────────────────────────────

export class CoverageParseError extends Error {
  readonly filePath?: string;
  constructor(message: string, filePath?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CoverageParseError";
    this.filePath = filePath;
  }
}

export class UnsupportedFormatError extends Error {
  constructor(detail?: string) {
    const base =
      "Unknown coverage format. Expected Istanbul JSON (object with fnMap) or V8 format (array or object with result array).";
    super(detail ? `${base} Got: ${detail}` : base);
    this.name = "UnsupportedFormatError";
  }
}

// ── Types ─────────────────────────────────────────────────────────

type UserFormat = Exclude<CoverageFormat, "unknown">;

export interface ParseCoverageOptions {
  readonly format?: UserFormat;
  readonly sources?: ReadonlyMap<string, string>;
}

export interface ParseCoverageResult {
  readonly coverage: ReadonlyMap<string, ReadonlyArray<FunctionCoverage>>;
  readonly warnings: ReadonlyArray<Warning>;
}

// ── Convenience Function ──────────────────────────────────────────

const istanbulAdapter = new IstanbulCoverageAdapter();
const v8Adapter = new V8CoverageAdapter();

export function parseCoverage(
  input: string | object,
  options?: ParseCoverageOptions,
): ParseCoverageResult {
  const data = resolveInput(input);

  let format: UserFormat;
  try {
    format = options?.format ?? detectAndValidateFormat(data);
  } catch (error) {
    if (error instanceof UnsupportedFormatError) throw error;
    throw new CoverageParseError("Failed to detect coverage format", undefined, {
      cause: error,
    });
  }

  const adapter = format === "istanbul" ? istanbulAdapter : v8Adapter;

  try {
    return adapter.parse(data, options?.sources);
  } catch (error) {
    if (error instanceof CoverageParseError) throw error;
    throw new CoverageParseError("Failed to parse coverage data", undefined, {
      cause: error,
    });
  }
}

// ── Internal Helpers ──────────────────────────────────────────────

function resolveInput(input: string | object): unknown {
  if (typeof input !== "string") return input;

  let content: string;
  try {
    content = readFileSync(input, "utf-8");
  } catch (error) {
    throw new CoverageParseError(
      `Failed to read coverage file: ${input}`,
      input,
      { cause: error },
    );
  }

  try {
    return JSON.parse(content);
  } catch (error) {
    throw new CoverageParseError(
      `Coverage file contains invalid JSON: ${input}`,
      input,
      { cause: error },
    );
  }
}

function detectAndValidateFormat(data: unknown): UserFormat {
  const format = detectCoverageFormat(data);
  if (format === "unknown") {
    throw new UnsupportedFormatError();
  }
  return format;
}

// Re-export adapters for advanced usage
export { IstanbulCoverageAdapter } from "./istanbul.js";
export { V8CoverageAdapter } from "./v8.js";
export { detectCoverageFormat } from "./detect.js";
export type { CoverageFormat } from "./detect.js";
