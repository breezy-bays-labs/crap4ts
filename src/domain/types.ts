// ── Source Location ──────────────────────────────────────────────────
/**
 * Half-open line+column range in original source coordinates.
 * startLine is 1-based inclusive, endLine is exclusive.
 * Columns are 0-based (matches typescript-eslint and Istanbul conventions).
 *
 * IMPORTANT: Both typescript-eslint (ESTree loc) and Istanbul use INCLUSIVE endLine.
 * Adapters MUST convert to exclusive: domainEndLine = sourceEndLine + 1.
 */
export interface SourceSpan {
  readonly startLine: number; // 1-based, inclusive
  readonly startColumn: number; // 0-based
  readonly endLine: number; // exclusive
  readonly endColumn: number; // 0-based
}

// ── Function Identity & Metrics ─────────────────────────────────────

export interface FunctionIdentity {
  readonly filePath: string; // project-relative, forward-slash normalized
  readonly qualifiedName: string; // dot-delimited: "OrderService.calculateTotal"
  readonly span: SourceSpan;
  readonly signature?: string; // for disambiguation in reports
}

export interface FunctionComplexity {
  readonly identity: FunctionIdentity;
  readonly cyclomaticComplexity: number; // >= 1
}

export interface CoverageRatio {
  readonly covered: number;
  readonly total: number;
  readonly percent: number; // [0, 100]
}

export interface FunctionCoverage {
  readonly filePath: string;
  readonly name: string;
  readonly span: SourceSpan;
  readonly lineCoverage: CoverageRatio;
  readonly branchCoverage: CoverageRatio | null; // null = no branches in function
}

// ── CRAP Scoring ────────────────────────────────────────────────────

export enum RiskLevel {
  Low = "low",
  Acceptable = "acceptable",
  Moderate = "moderate",
  High = "high",
}

export interface CrapScore {
  readonly value: number; // rounded to 2 decimal places
  readonly riskLevel: RiskLevel;
}

export interface ScoredFunction {
  readonly identity: FunctionIdentity;
  readonly cyclomaticComplexity: number;
  readonly coveragePercent: number;
  readonly crap: CrapScore;
}

// ── Verdicts & Unmatched ────────────────────────────────────────────

export interface FunctionVerdict {
  readonly scored: ScoredFunction;
  readonly threshold: number;
  readonly exceeds: boolean; // true when crap.value > threshold
}

export type UnmatchedFunction =
  | {
      readonly kind: "no-coverage";
      readonly complexity: FunctionComplexity;
      readonly worstCaseCrap: CrapScore;
    }
  | {
      readonly kind: "no-ast";
      readonly coverage: FunctionCoverage;
    };

// ── Warnings ────────────────────────────────────────────────────────

export type WarningCode =
  | "unmatched-no-coverage"
  | "unmatched-no-ast"
  | "approximate-span"
  | "missing-coverage-file";

export interface Warning {
  readonly code: WarningCode;
  readonly message: string;
  readonly file?: string;
  readonly function?: string;
}

// ── Analysis Results ────────────────────────────────────────────────

export interface RiskDistribution {
  readonly [RiskLevel.Low]: number;
  readonly [RiskLevel.Acceptable]: number;
  readonly [RiskLevel.Moderate]: number;
  readonly [RiskLevel.High]: number;
}

export interface AnalysisSummary {
  readonly totalFunctions: number;
  readonly totalFiles: number;
  readonly exceedingThreshold: number;
  readonly exceedingPercent: number;
  readonly averageCrap: number;
  readonly medianCrap: number;
  readonly maxCrap: CrapScore;
  readonly worstFunction: FunctionIdentity | null;
  readonly distribution: RiskDistribution;
  readonly crapLoad: number;
}

// ── Threshold Configuration ─────────────────────────────────────────

export interface ThresholdConfig {
  readonly defaultThreshold: number;
  readonly overrides: readonly ThresholdOverride[];
}

export interface ThresholdOverride {
  readonly glob: string;
  readonly threshold: number;
}

export type ThresholdPreset = "strict" | "default" | "lenient";

// ── Top-Level Analysis Result ───────────────────────────────────────

export interface AnalysisResult {
  readonly functions: ReadonlyArray<FunctionVerdict>;
  readonly unmatched: ReadonlyArray<UnmatchedFunction>;
  readonly warnings: ReadonlyArray<Warning>;
  readonly summary: AnalysisSummary;
  readonly thresholdConfig: ThresholdConfig;
  readonly passed: boolean;
}

// ── Filtering & Matching ────────────────────────────────────────────

export interface FunctionFilter {
  readonly description: string;
  readonly changedFiles: ReadonlyMap<string, ReadonlyArray<SourceSpan> | null>;
}

export interface MatchResult {
  readonly matched: ReadonlyArray<{
    readonly complexity: FunctionComplexity;
    readonly coverage: FunctionCoverage;
  }>;
  readonly unmatchedComplexity: ReadonlyArray<FunctionComplexity>;
  readonly unmatchedCoverage: ReadonlyArray<FunctionCoverage>;
}

export type MatchFunctions = (
  complexities: ReadonlyArray<FunctionComplexity>,
  coverages: ReadonlyArray<FunctionCoverage>,
) => MatchResult;

// ── Analyze Options ─────────────────────────────────────────────────

export interface AnalyzeOptions {
  src?: string | string[];
  coverage?: string;
  threshold?: number;
  thresholds?: Record<string, number>;
  coverageMetric?: "line" | "branch";
  include?: string[];
  exclude?: string[];
  changedSince?: string;
  cwd?: string;
  signal?: AbortSignal;
}

// ── Custom Errors ───────────────────────────────────────────────────

export class InvalidComplexityError extends Error {
  constructor(value: number) {
    super(`Invalid cyclomatic complexity: ${value}. Must be >= 1 and finite.`);
    this.name = "InvalidComplexityError";
  }
}

export class InvalidCoverageError extends Error {
  constructor(value: number) {
    super(`Invalid coverage percentage: ${value}. Must be a finite number.`);
    this.name = "InvalidCoverageError";
  }
}
