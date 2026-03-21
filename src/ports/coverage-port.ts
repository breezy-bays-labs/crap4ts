import type { FunctionCoverage, Warning } from "../domain/types.js";

export interface CoverageParseResult {
  readonly coverage: ReadonlyMap<string, ReadonlyArray<FunctionCoverage>>;
  readonly warnings: ReadonlyArray<Warning>;
}

export interface CoveragePort {
  /**
   * Parse coverage data into per-file function coverage entries.
   *
   * @param data - Raw coverage data (Istanbul JSON object or V8 array/result).
   * @param sources - Optional source text keyed by file path. When provided,
   *   V8 adapters use source text for precise byte-offset-to-line mapping
   *   (eliminating approximate-span warnings). Istanbul adapters accept the
   *   parameter for interface uniformity but currently ignore it — Istanbul
   *   coverage JSON already contains line-level data.
   */
  parse(
    data: unknown,
    sources?: ReadonlyMap<string, string>,
  ): CoverageParseResult;
}
