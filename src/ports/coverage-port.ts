import type { FunctionCoverage, Warning } from "../domain/types.js";

export interface CoverageParseResult {
  readonly coverage: ReadonlyMap<string, ReadonlyArray<FunctionCoverage>>;
  readonly warnings: ReadonlyArray<Warning>;
}

export interface CoveragePort {
  parse(
    data: unknown,
    sources?: ReadonlyMap<string, string>,
  ): CoverageParseResult;
}
