import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { FunctionFilter, SourceSpan } from "../domain/types.js";

// ── Exec Abstraction (for testing) ──────────────────────────────────

export interface ExecFn {
  (command: string, args: string[]): Promise<{ stdout: string; exitCode: number }>;
}

const execFileAsync = promisify(execFile);

/**
 * Default exec implementation using execFile (not exec) to avoid
 * shell injection. Arguments are passed as an array, never interpolated.
 */
const defaultExec: ExecFn = async (command: string, args: string[]) => {
  try {
    const { stdout } = await execFileAsync(command, args);
    return { stdout, exitCode: 0 };
  } catch (error: unknown) {
    const execError = error as { stdout?: string; code?: number };
    return {
      stdout: execError.stdout ?? "",
      exitCode: execError.code ?? 1,
    };
  }
};

// ── getChangedFiles ─────────────────────────────────────────────────

interface GetChangedFilesOptions {
  cwd?: string;
  exec?: ExecFn;
}

/**
 * Runs `git diff --name-only <ref>` and produces a FunctionFilter
 * where each changed file maps to `null` spans (whole-file changed).
 *
 * V1 uses whole-file filtering only — line-level span filtering
 * is a future enhancement.
 */
export async function getChangedFiles(
  ref: string,
  options?: GetChangedFilesOptions,
): Promise<FunctionFilter> {
  // Validate ref: reject anything that looks like a flag to prevent argument injection
  if (ref.startsWith("-")) {
    throw new Error(
      `Invalid git ref: "${ref}". Refs must not start with "-".`,
    );
  }

  const exec = options?.exec ?? defaultExec;

  // Use -- separator to prevent git from interpreting ref as flags
  const { stdout, exitCode } = await exec("git", ["diff", "--name-only", ref, "--"]);

  if (exitCode !== 0) {
    const safeRef = ref.replace(/[\x00-\x1f\x7f-\x9f]/g, "");
    throw new Error(
      `git diff failed with exit code ${exitCode}: ${stdout.trim()} (ref: ${safeRef})`,
    );
  }

  const files = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((file) => file.replace(/\\/g, "/"));

  const changedFiles = new Map<string, ReadonlyArray<SourceSpan> | null>();
  for (const file of files) {
    changedFiles.set(file, null);
  }

  const safeRef = ref.replace(/[\x00-\x1f\x7f-\x9f]/g, "");
  return {
    description: `Changed since ${safeRef}`,
    changedFiles,
  };
}
