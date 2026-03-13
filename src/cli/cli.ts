#!/usr/bin/env node
import { Command } from "commander";
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyze } from "../core/analyze.js";
import {
  findConfigFile,
  loadConfigFile,
  resolveConfig,
  type ResolvedConfig,
} from "./config.js";
import {
  discoverCoverage,
  discoverSourceRoot,
  formatCoverageNotFoundError,
} from "./discover.js";
// getChangedFiles is available for future --changed-since enhancements
// import { getChangedFiles } from "./diff.js";
import { ConsoleReporter } from "../adapters/reporters/console.js";
import { JsonReporter } from "../adapters/reporters/json.js";
import { MarkdownReporter } from "../adapters/reporters/markdown.js";
import type { ReporterPort } from "../ports/reporter-port.js";
import { RiskLevel } from "../domain/types.js";
import type { AnalysisResult, FunctionVerdict } from "../domain/types.js";

// ── Exit Codes ─────────────────────────────────────────────────────

const EXIT_OK = 0;
const EXIT_THRESHOLD = 1;
const EXIT_CONFIG_ERROR = 2;
const EXIT_PARSE_ERROR = 3;

// ── Version ───────────────────────────────────────────────────────

function readVersion(): string {
  const __dirname = fileURLToPath(new URL(".", import.meta.url));
  const pkgPath = join(__dirname, "..", "package.json");
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version: string };
    return pkg.version;
  } catch {
    return "0.0.0";
  }
}

// ── CLI Definition ─────────────────────────────────────────────────

const program = new Command();

program
  .name("crap4ts")
  .description(
    "CRAP score analyzer for TypeScript — find complex, under-tested functions",
  )
  .version(readVersion())
  .option("-c, --coverage <path>", "path to coverage JSON")
  .option("-s, --src <paths...>", "source directories")
  .option("-t, --threshold <n>", "CRAP threshold", parseFloat)
  .option("--strict", "use strict threshold (8)")
  .option("--lenient", "use lenient threshold (30)")
  .option("--coverage-metric <type>", "coverage metric: line or branch")
  .option("-f, --format <type>", "output format: table, json, markdown")
  .option("-n, --top <n>", "show N worst functions", parseInt)
  .option("--sort <field>", "sort by: crap, complexity, coverage, name")
  .option(
    "--changed-since <ref>",
    "only analyze files changed since git ref",
  )
  .option("--diff <ref>", "alias for --changed-since")
  .option("--include <glob...>", "file include globs")
  .option("--exclude <glob...>", "file exclude globs")
  .option("--summary", "show summary line only")
  .option("-q, --quiet", "exit code only, no output")
  .option("-v, --verbose", "show discovery and warnings")
  .option("--no-color", "disable colors")
  .option("--config <path>", "explicit config file path");

// ── init subcommand ────────────────────────────────────────────────

program
  .command("init")
  .description("scaffold a crap4ts.config.ts with sensible defaults")
  .action(() => {
    const configPath = join(process.cwd(), "crap4ts.config.ts");

    if (existsSync(configPath)) {
      console.error(
        `Config file already exists: ${configPath}\nRemove it first if you want to reinitialize.`,
      );
      process.exit(EXIT_CONFIG_ERROR);
    }

    const template = `import { defineConfig } from "crap4ts";

export default defineConfig({
  threshold: 12,
  coverageMetric: "line",
  exclude: ["**/*.test.*", "**/*.spec.*", "**/*.d.ts"],
});
`;

    writeFileSync(configPath, template, "utf-8");
    console.log(`Created ${configPath}`);
    process.exit(EXIT_OK);
  });

// ── Main action ────────────────────────────────────────────────────

program.action(async (opts: Record<string, unknown>) => {
  try {
    // 1. Validate mutual exclusions
    validateMutualExclusions(opts);

    const cwd = process.cwd();
    const verbose = Boolean(opts["verbose"]);

    // 2. Resolve threshold from --strict, --lenient, or --threshold
    const threshold = resolveThresholdFlag(opts);

    // 3. Load config file
    const configFilePath = opts["config"]
      ? resolve(String(opts["config"]))
      : findConfigFile(cwd);

    let fileConfig = {};
    if (configFilePath) {
      if (verbose) {
        console.error(`Loading config from ${configFilePath}`);
      }
      try {
        fileConfig = await loadConfigFile(configFilePath);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Error loading config: ${msg}`);
        process.exit(EXIT_CONFIG_ERROR);
      }
    } else if (opts["config"]) {
      console.error(
        `Config file not found: ${String(opts["config"])}`,
      );
      process.exit(EXIT_CONFIG_ERROR);
    }

    // 4. Merge config layers (defaults < file < env < CLI)
    const coverageMetricRaw = opts["coverageMetric"] as
      | string
      | undefined;
    let coverageMetric: "line" | "branch" | undefined;
    if (coverageMetricRaw === "line" || coverageMetricRaw === "branch") {
      coverageMetric = coverageMetricRaw;
    } else if (coverageMetricRaw !== undefined) {
      console.error(
        `Invalid --coverage-metric: "${coverageMetricRaw}". Must be "line" or "branch".`,
      );
      process.exit(EXIT_CONFIG_ERROR);
    }

    const resolved: ResolvedConfig = resolveConfig({
      fileConfig,
      env: process.env as Record<string, string | undefined>,
      cliFlags: {
        threshold,
        coverage: opts["coverage"] as string | undefined,
        format: opts["format"] as string | undefined,
        noColor: opts["color"] === false ? true : undefined, // only set when --no-color is explicit
        coverageMetric,
        include: opts["include"] as string[] | undefined,
        exclude: opts["exclude"] as string[] | undefined,
        src: opts["src"] as string[] | undefined,
      },
    });

    // 5. Auto-discover coverage if not explicitly provided
    let coveragePath = resolved.coverage;
    if (!coveragePath) {
      const discovered = discoverCoverage(cwd);
      if (discovered) {
        coveragePath = discovered.path;
        if (verbose) {
          console.error(
            `Auto-discovered coverage: ${discovered.path} (${discovered.format})`,
          );
        }
      } else {
        console.error(formatCoverageNotFoundError(cwd));
        process.exit(EXIT_PARSE_ERROR);
      }
    }

    // 6. Auto-discover source root if not explicitly provided
    let srcPaths: string[] | undefined;
    if (resolved.src) {
      srcPaths = Array.isArray(resolved.src)
        ? resolved.src
        : [resolved.src];
    } else {
      const sourceRoot = discoverSourceRoot(cwd);
      if (verbose) {
        console.error(`Auto-discovered source root: ${sourceRoot}`);
      }
      srcPaths = [sourceRoot];
    }

    // 7. Handle --changed-since / --diff
    const changedSinceRef =
      (opts["changedSince"] as string | undefined) ??
      (opts["diff"] as string | undefined);

    // 8. Call analyze()
    let result: AnalysisResult;
    try {
      result = await analyze({
        src: srcPaths,
        coverage: coveragePath,
        threshold: resolved.threshold,
        thresholds: resolved.thresholds,
        coverageMetric: resolved.coverageMetric ?? "line",
        include: resolved.include,
        exclude: resolved.exclude,
        changedSince: changedSinceRef,
        cwd,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Analysis failed: ${msg}`);
      process.exit(EXIT_PARSE_ERROR);
    }

    // 9. Output (unless --quiet)
    const quiet = Boolean(opts["quiet"]);
    if (!quiet) {
      const reporter = createReporter(resolved);
      let output: string;

      const summaryOnly = Boolean(opts["summary"]);
      if (summaryOnly) {
        output = formatSummaryLine(result);
      } else {
        // Apply --sort and --top before formatting
        const sortField = opts["sort"] as string | undefined;
        const topN = opts["top"] as number | undefined;
        const filtered = applyFilters(result, sortField, topN);
        output = reporter.format(filtered);
      }

      console.log(output);
    }

    // 10. Exit with appropriate code
    process.exit(result.passed ? EXIT_OK : EXIT_THRESHOLD);
  } catch (err) {
    if (err instanceof MutualExclusionError) {
      console.error(err.message);
      process.exit(EXIT_CONFIG_ERROR);
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Unexpected error: ${msg}`);
    process.exit(EXIT_CONFIG_ERROR);
  }
});

// ── Validation ─────────────────────────────────────────────────────

class MutualExclusionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MutualExclusionError";
  }
}

function validateMutualExclusions(
  opts: Record<string, unknown>,
): void {
  // --strict, --lenient, --threshold are mutually exclusive
  const thresholdFlags = [
    opts["strict"] ? "--strict" : null,
    opts["lenient"] ? "--lenient" : null,
    opts["threshold"] !== undefined ? "--threshold" : null,
  ].filter(Boolean) as string[];

  if (thresholdFlags.length > 1) {
    throw new MutualExclusionError(
      `Conflicting options: ${thresholdFlags.join(", ")} — pick one.`,
    );
  }

  // --quiet and --verbose are mutually exclusive
  if (opts["quiet"] && opts["verbose"]) {
    throw new MutualExclusionError(
      "Conflicting options: --quiet, --verbose — pick one.",
    );
  }
}

function resolveThresholdFlag(
  opts: Record<string, unknown>,
): number | undefined {
  if (opts["strict"]) return 8;
  if (opts["lenient"]) return 30;
  return opts["threshold"] as number | undefined;
}

// ── Reporter Factory ───────────────────────────────────────────────

function createReporter(config: ResolvedConfig): ReporterPort {
  const format = config.format ?? "table";

  switch (format) {
    case "json":
      return new JsonReporter();
    case "markdown":
      return new MarkdownReporter();
    case "table":
      return new ConsoleReporter({ color: !config.noColor });
    default:
      throw new Error(`Unknown output format: "${format}". Valid formats: table, json, markdown`);
  }
}

// ── Filtering & Sorting ────────────────────────────────────────────

function applyFilters(
  result: AnalysisResult,
  sortField?: string,
  topN?: number,
): AnalysisResult {
  // Collect all verdicts
  let allVerdicts: FunctionVerdict[] = [];
  for (const file of result.files) {
    for (const fn of file.functions) {
      allVerdicts.push(fn);
    }
  }

  // Sort
  if (sortField) {
    allVerdicts = sortVerdicts(allVerdicts, sortField);
  }

  // Top N
  if (topN !== undefined && topN > 0) {
    // Default to sorting by CRAP descending if no explicit sort
    if (!sortField) {
      allVerdicts = sortVerdicts(allVerdicts, "crap");
    }
    allVerdicts = allVerdicts.slice(0, topN);
  }

  if (!sortField && (topN === undefined || topN <= 0)) {
    // No filtering needed — return original result
    return result;
  }

  // Rebuild the result with filtered verdicts grouped by file
  return rebuildResult(result, allVerdicts);
}

function sortVerdicts(
  verdicts: FunctionVerdict[],
  field: string,
): FunctionVerdict[] {
  const sorted = [...verdicts];

  switch (field) {
    case "crap":
      sorted.sort((a, b) => b.scored.crap.value - a.scored.crap.value);
      break;
    case "complexity":
      sorted.sort(
        (a, b) =>
          b.scored.cyclomaticComplexity - a.scored.cyclomaticComplexity,
      );
      break;
    case "coverage":
      sorted.sort(
        (a, b) =>
          a.scored.coveragePercent - b.scored.coveragePercent,
      );
      break;
    case "name":
      sorted.sort((a, b) =>
        a.scored.identity.qualifiedName.localeCompare(
          b.scored.identity.qualifiedName,
        ),
      );
      break;
  }

  return sorted;
}

function rebuildResult(
  original: AnalysisResult,
  filteredVerdicts: FunctionVerdict[],
): AnalysisResult {
  // Group filtered verdicts by file
  const byFile = new Map<string, FunctionVerdict[]>();
  for (const v of filteredVerdicts) {
    const file = v.scored.identity.filePath;
    let group = byFile.get(file);
    if (!group) {
      group = [];
      byFile.set(file, group);
    }
    group.push(v);
  }

  // Rebuild file results preserving only the filtered verdicts
  const files = [...byFile.entries()].map(([filePath, verdicts]) => {
    const originalFile = original.files.find(
      (f) => f.filePath === filePath,
    );
    return {
      filePath,
      functions: verdicts,
      unmatched: originalFile?.unmatched ?? [],
      summary: originalFile?.summary ?? {
        totalFunctions: verdicts.length,
        exceedingThreshold: verdicts.filter((v) => v.exceeds).length,
        maxCrap: verdicts[0]?.scored.crap ?? {
          value: 0,
          riskLevel: RiskLevel.Low,
        },
        averageCrap: 0,
      },
    };
  });

  return {
    files,
    summary: original.summary,
    thresholdConfig: original.thresholdConfig,
    passed: original.passed,
  };
}

// ── Summary Formatting ─────────────────────────────────────────────

function formatSummaryLine(result: AnalysisResult): string {
  const { summary, thresholdConfig, passed } = result;
  const status = passed ? "PASS" : "FAIL";
  return `${status}: ${summary.totalFunctions} functions | ${summary.exceedingThreshold} above threshold (${thresholdConfig.defaultThreshold}) | worst: ${summary.maxCrap.value.toFixed(1)} | avg: ${summary.averageCrap.toFixed(1)}`;
}

// ── Run ────────────────────────────────────────────────────────────

program.parse();
