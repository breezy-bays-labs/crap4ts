import { existsSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { defineConfig, type Crap4tsConfig } from "../core/define-config.js";
import { createThresholdConfig } from "../domain/threshold.js";
import type { ThresholdConfig } from "../domain/types.js";

// ── Config File Names (discovery order) ──────────────────────────────

const CONFIG_FILE_NAMES = [
  "crap4ts.config.ts",
  "crap4ts.config.js",
  "crap4ts.config.mjs",
] as const;

// ── Filesystem abstraction (for testing) ─────────────────────────────

export interface FsOps {
  exists: (path: string) => boolean;
  readPackageJson?: (path: string) => Record<string, unknown> | null;
}

const defaultFsOps: FsOps = {
  exists: existsSync,
  readPackageJson: (path: string) => {
    try {
      const content = readFileSync(path, "utf-8");
      return JSON.parse(content) as Record<string, unknown>;
    } catch {
      return null;
    }
  },
};

// ── Import abstraction (for testing) ─────────────────────────────────

export interface ImportOps {
  importFile: (path: string) => Promise<Record<string, unknown>>;
}

// ── findConfigFile ───────────────────────────────────────────────────

/**
 * Probes for config files in priority order:
 *   crap4ts.config.ts > .js > .mjs > package.json "crap4ts" field
 *
 * Returns the absolute path to the found config, or null.
 */
export function findConfigFile(
  cwd: string,
  fs: FsOps = defaultFsOps,
): string | null {
  // Check dedicated config files in order
  for (const name of CONFIG_FILE_NAMES) {
    const fullPath = join(cwd, name);
    if (fs.exists(fullPath)) {
      return fullPath;
    }
  }

  // Check package.json for "crap4ts" field
  const pkgPath = join(cwd, "package.json");
  if (fs.exists(pkgPath)) {
    const readPkg = fs.readPackageJson ?? defaultFsOps.readPackageJson!;
    const pkg = readPkg(pkgPath);
    if (pkg && "crap4ts" in pkg) {
      return pkgPath;
    }
  }

  return null;
}

// ── loadConfigFile ───────────────────────────────────────────────────

/**
 * Loads and validates a config file using jiti (for TS/JS) or JSON parse (for package.json).
 * Throws with a clear error message on failure.
 */
export async function loadConfigFile(
  path: string,
  ops?: ImportOps,
): Promise<Crap4tsConfig> {
  const importFn = ops?.importFile ?? createDefaultImport();

  let raw: Record<string, unknown>;
  try {
    raw = await importFn(path);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to load config from "${path}": ${msg}`);
  }

  // If this is package.json, extract the "crap4ts" field
  if (basename(path) === "package.json") {
    const nested = extractFromPackageJson(raw);
    return defineConfig(nested);
  }

  // Handle default export vs named exports
  const config = extractConfigExport(raw);
  return defineConfig(config);
}

function extractFromPackageJson(
  raw: Record<string, unknown>,
): Crap4tsConfig {
  // The module might have `default` wrapping (ESM import of JSON)
  const obj = (raw["default"] as Record<string, unknown> | undefined) ?? raw;

  if (!obj || !("crap4ts" in obj)) {
    throw new Error(
      `package.json has no "crap4ts" field. Add a "crap4ts" key or use a dedicated config file.`,
    );
  }

  return obj["crap4ts"] as Crap4tsConfig;
}

function extractConfigExport(raw: Record<string, unknown>): Crap4tsConfig {
  // Prefer default export (standard defineConfig pattern)
  if ("default" in raw && raw["default"] != null) {
    return raw["default"] as Crap4tsConfig;
  }

  // Fall back to treating the module itself as the config (named exports)
  return raw as unknown as Crap4tsConfig;
}

function createDefaultImport(): (path: string) => Promise<Record<string, unknown>> {
  return async (filePath: string) => {
    const { createJiti } = await import("jiti");
    const jiti = createJiti(import.meta.url);
    const mod = await jiti.import(filePath) as Record<string, unknown>;
    return mod;
  };
}

// ── Resolved Config ──────────────────────────────────────────────────

export interface ResolvedConfig {
  threshold?: number;
  coverage?: string;
  format?: string;
  noColor: boolean;
  coverageMetric?: "line" | "branch";
  include?: string[];
  exclude?: string[];
  thresholds?: Record<string, number>;
  src?: string | string[];
}

export interface ResolveConfigOptions {
  fileConfig?: Crap4tsConfig;
  env?: Record<string, string | undefined>;
  cliFlags?: Partial<{
    threshold: number;
    coverage: string;
    format: string;
    noColor: boolean;
    coverageMetric: "line" | "branch";
    include: string[];
    exclude: string[];
    src: string | string[];
  }>;
}

// ── resolveConfig ────────────────────────────────────────────────────

/**
 * Merges config sources with priority: defaults < config file < env vars < CLI flags.
 *
 * Only defined values participate in the merge — undefined values are skipped
 * so lower-priority sources remain visible.
 */
export function resolveConfig(options: ResolveConfigOptions): ResolvedConfig {
  const file = options.fileConfig ?? {};
  const env = parseEnvVars(options.env ?? {});
  const cli = options.cliFlags ?? {};

  return {
    // Threshold: CLI > env > file
    threshold: cli.threshold ?? env.threshold ?? file.threshold,
    // Coverage path: CLI > env > file (file doesn't have coverage path)
    coverage: cli.coverage ?? env.coverage,
    // Format: CLI > env
    format: cli.format ?? env.format,
    // NO_COLOR: CLI > env
    noColor: cli.noColor ?? env.noColor ?? false,
    // File-only fields (no env var equivalent)
    coverageMetric: cli.coverageMetric ?? file.coverageMetric,
    include: cli.include ?? file.include,
    exclude: cli.exclude ?? file.exclude,
    thresholds: file.thresholds,
    src: cli.src,
  };
}

interface ParsedEnv {
  threshold?: number;
  coverage?: string;
  format?: string;
  noColor: boolean;
}

function parseEnvVars(env: Record<string, string | undefined>): ParsedEnv {
  const rawThreshold = env["CRAP4TS_THRESHOLD"];
  let threshold: number | undefined;
  if (rawThreshold !== undefined) {
    const parsed = Number(rawThreshold);
    if (!Number.isNaN(parsed) && parsed > 0) {
      threshold = parsed;
    }
  }

  const coverage = env["CRAP4TS_COVERAGE"] || undefined;
  const format = env["CRAP4TS_FORMAT"] || undefined;
  const noColor = Boolean(env["NO_COLOR"]);

  return { threshold, coverage, format, noColor };
}

// ── configToThresholdConfig ──────────────────────────────────────────

/**
 * Converts user-facing `{ threshold, thresholds }` to the domain `ThresholdConfig`.
 */
export function configToThresholdConfig(
  config: Pick<ResolvedConfig, "threshold" | "thresholds">,
): ThresholdConfig {
  const overrides = config.thresholds
    ? Object.entries(config.thresholds).map(([glob, threshold]) => ({
        glob,
        threshold,
      }))
    : undefined;

  return createThresholdConfig({
    preset: config.threshold,
    overrides,
  });
}
