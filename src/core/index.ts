export { analyze } from "./analyze.js";
export type { AnalyzeDeps } from "./analyze.js";
export { analyzeFile } from "./analyze-file.js";
export type { AnalyzeFileOptions, AnalyzeFileResult } from "./analyze-file.js";
export { defineConfig } from "./define-config.js";
export type { Crap4tsConfig } from "./define-config.js";
export { createDefaultDeps } from "./defaults.js";

// Re-export commonly-used domain types for library consumers
export type {
  AnalyzeOptions,
  AnalysisResult,
  AnalysisSummary,
  FunctionVerdict,
  ScoredFunction,
  CrapScore,
  FunctionIdentity,
  SourceSpan,
  ThresholdConfig,
  ThresholdOverride,
  CoverageRatio,
  FunctionComplexity,
  FunctionCoverage,
  RiskDistribution,
  UnmatchedFunction,
  Warning,
  WarningCode,
} from "../domain/types.js";
export { RiskLevel } from "../domain/types.js";
