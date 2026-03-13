import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { FunctionFilter, SourceSpan } from "../domain/types.js";

// ── Exec Abstraction (for testing) ──────────────────────────────────

export interface ExecFn {
  (cmd: string): Promise<{ stdout: string; exitCode: number }>;
}

const execFileAsync = promisify(execFile);

/**
 * Default exec implementation using execFile (not exec) to avoid
 * shell injection. The cmd string is split into command + args.
 */
const defaultExec: ExecFn = async (cmd: string) => {
  const parts = cmd.split(" ");
  const [command, ...args] = parts;
  try {
    const { stdout } = await execFileAsync(command!, args);
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
  const exec = options?.exec ?? defaultExec;
  const cmd = `git diff --name-only ${ref}`;

  const { stdout, exitCode } = await exec(cmd);

  if (exitCode !== 0) {
    throw new Error(
      `git diff failed with exit code ${exitCode}: ${stdout.trim()}`,
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

  return {
    description: `Changed since ${ref}`,
    changedFiles,
  };
}
