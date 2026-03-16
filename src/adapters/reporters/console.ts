import { Chalk, type ChalkInstance } from "chalk";
import type { ReporterPort } from "../../ports/reporter-port.js";
import type { AnalysisResult } from "../../domain/types.js";
import { readPackageVersion } from "./version.js";

export interface ConsoleReporterOptions {
  color?: boolean;
}

export class ConsoleReporter implements ReporterPort {
  private readonly c: ChalkInstance;

  constructor(options: ConsoleReporterOptions = {}) {
    const useColor = options.color ?? (process.stdout?.isTTY ?? false);
    this.c = new Chalk({ level: useColor ? 3 : 0 });
  }

  format(result: AnalysisResult): string {
    const lines: string[] = [];
    const { summary, thresholdConfig } = result;

    // ── Header ──────────────────────────────────────────────────────
    lines.push("");
    lines.push(` ${this.c.bold("crap4ts")} v${this.version()} — CRAP Score Analysis`);
    lines.push("");

    // ── Table ───────────────────────────────────────────────────────
    const verdicts = result.functions;

    if (verdicts.length > 0) {
      // Column widths
      const fileW = Math.max(
        4,
        ...verdicts.map((v) => v.scored.identity.filePath.length),
      );
      const fnW = Math.max(
        8,
        ...verdicts.map((v) => v.scored.identity.qualifiedName.length),
      );
      const ccW = 4;
      const covW = 6;
      const crapW = 6;

      // Header row
      lines.push(
        ` ${"File".padEnd(fileW)}  ${"Function".padEnd(fnW)}  ${"CC".padStart(ccW)}  ${"Cov%".padStart(covW)}  ${"CRAP".padStart(crapW)}`,
      );

      // Separator
      lines.push(
        ` ${"─".repeat(fileW)}  ${"─".repeat(fnW)}  ${"─".repeat(ccW)}  ${"─".repeat(covW)}  ${"─".repeat(crapW)}`,
      );

      // Data rows
      for (const v of verdicts) {
        const { scored, exceeds } = v;
        const filePath = scored.identity.filePath.padEnd(fileW);
        const fnName = scored.identity.qualifiedName.padEnd(fnW);
        const cc = String(scored.cyclomaticComplexity).padStart(ccW);
        const covStr = scored.coveragePercent.toFixed(1).padStart(covW);
        const crapStr = scored.crap.value.toFixed(1).padStart(crapW);

        const coloredCov = this.colorizeCoverage(covStr, scored.coveragePercent);
        const coloredCrap = exceeds
          ? this.c.bold.red(crapStr)
          : crapStr;

        lines.push(` ${filePath}  ${fnName}  ${cc}  ${coloredCov}  ${coloredCrap}`);
      }

      lines.push("");
    }

    // ── Summary ─────────────────────────────────────────────────────
    const threshold = thresholdConfig.defaultThreshold;
    const passFailLabel = result.passed
      ? this.c.bold.green("PASS")
      : this.c.bold.red("FAIL");

    lines.push(
      ` Summary: ${summary.totalFunctions} functions | ${summary.exceedingThreshold} above threshold (${threshold}) | worst: ${summary.maxCrap.value.toFixed(1)} | ${passFailLabel}`,
    );
    lines.push("");

    return lines.join("\n");
  }

  private colorizeCoverage(formatted: string, percent: number): string {
    if (percent < 50) return this.c.red(formatted);
    if (percent < 80) return this.c.yellow(formatted);
    return this.c.green(formatted);
  }

  private version(): string {
    return readPackageVersion();
  }
}
