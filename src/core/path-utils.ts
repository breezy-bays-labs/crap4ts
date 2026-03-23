import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, "/");
}

function stripLeadingDotSlash(value: string): string {
  return value.replace(/^\.\//, "");
}

export function normalizeProjectPath(
  inputPath: string,
  cwd: string,
): string {
  const relativePath = isAbsolute(inputPath)
    ? relative(canonicalizePath(cwd), canonicalizePath(inputPath))
    : inputPath;

  return stripLeadingDotSlash(normalizeSlashes(relativePath));
}

export function resolveInputPath(
  inputPath: string | undefined,
  cwd: string,
): string | undefined {
  if (!inputPath) return undefined;
  const absolutePath = isAbsolute(inputPath)
    ? inputPath
    : resolve(cwd, inputPath);
  return canonicalizePath(absolutePath);
}

export function normalizeGlobPattern(
  pattern: string,
  cwd: string,
): string {
  return normalizeProjectPath(pattern, cwd);
}

export function resolveIncludePatterns(
  cwd: string,
  src?: string | string[],
  include?: string[],
): string[] {
  if (include) {
    return include.map((pattern) => normalizeGlobPattern(pattern, cwd));
  }

  if (src) {
    const dirs = Array.isArray(src) ? src : [src];
    return dirs.flatMap((dir) => {
      const normalized = normalizeProjectPath(dir, cwd).replace(/\/+$/, "");
      if (normalized === "" || normalized === ".") {
        return ["**/*.ts", "**/*.tsx"];
      }
      return [`${normalized}/**/*.ts`, `${normalized}/**/*.tsx`];
    });
  }

  return ["**/*.ts", "**/*.tsx"];
}

function canonicalizePath(inputPath: string): string {
  try {
    return realpathSync.native(inputPath);
  } catch {
    return resolve(inputPath);
  }
}
