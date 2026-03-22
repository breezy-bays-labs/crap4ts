import type { ReporterPort } from "../../ports/reporter-port.js";
import type {
  AnalysisResult,
  BreakdownMode,
  FunctionVerdict,
} from "../../domain/types.js";
import { readPackageVersion } from "./version.js";

export interface JsonReporterOptions {
  breakdown?: BreakdownMode;
}

export class JsonReporter implements ReporterPort {
  private readonly breakdown: BreakdownMode;

  constructor(options: JsonReporterOptions = {}) {
    this.breakdown = options.breakdown ?? "off";
  }

  format(result: AnalysisResult): string {
    const envelope = {
      $schema: "",
      version: readPackageVersion(),
      timestamp: new Date().toISOString(),
      config: result.thresholdConfig,
      summary: result.summary,
      functions: result.functions.map((v) => this.formatVerdict(v)),
      unmatched: result.unmatched,
      warnings: result.warnings,
      passed: result.passed,
    };

    return JSON.stringify(envelope, null, 2);
  }

  private formatVerdict(verdict: FunctionVerdict): Record<string, unknown> {
    const includeContributors = this.breakdown !== "off" &&
      (this.breakdown === "all" || verdict.exceeds);

    return {
      scored: {
        identity: verdict.scored.identity,
        cyclomaticComplexity: verdict.scored.cyclomaticComplexity,
        coveragePercent: verdict.scored.coveragePercent,
        crap: verdict.scored.crap,
        ...(includeContributors ? { contributors: verdict.scored.contributors } : {}),
      },
      threshold: verdict.threshold,
      exceeds: verdict.exceeds,
    };
  }
}
