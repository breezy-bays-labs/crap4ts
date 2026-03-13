import type { FunctionCoverage } from "../domain/types.js";

export interface CoveragePort {
  parse(data: unknown): Map<string, FunctionCoverage[]>;
}
