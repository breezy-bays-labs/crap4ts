import { describe, it, expect } from "vitest";
import { getChangedFiles, type ExecFn } from "../../src/cli/diff.js";

// ── Exec Helpers ────────────────────────────────────────────────────

function createMockExec(
  stdout: string,
  exitCode = 0,
): ExecFn {
  return async (_command: string, _args: string[]) => ({ stdout, exitCode });
}

// ── getChangedFiles ─────────────────────────────────────────────────

describe("getChangedFiles", () => {
  it("returns a FunctionFilter with changed files as keys", async () => {
    const exec = createMockExec("src/foo.ts\nsrc/bar.ts\n");
    const filter = await getChangedFiles("main", { exec });

    expect(filter.changedFiles.size).toBe(2);
    expect(filter.changedFiles.has("src/foo.ts")).toBe(true);
    expect(filter.changedFiles.has("src/bar.ts")).toBe(true);
  });

  it("sets null spans for each file (whole-file changed)", async () => {
    const exec = createMockExec("src/foo.ts\n");
    const filter = await getChangedFiles("main", { exec });

    expect(filter.changedFiles.get("src/foo.ts")).toBeNull();
  });

  it("normalizes paths to forward slashes", async () => {
    const exec = createMockExec("src\\cli\\diff.ts\n");
    const filter = await getChangedFiles("main", { exec });

    expect(filter.changedFiles.has("src/cli/diff.ts")).toBe(true);
  });

  it("trims whitespace and filters empty lines", async () => {
    const exec = createMockExec("  src/a.ts  \n\n  src/b.ts\n\n");
    const filter = await getChangedFiles("main", { exec });

    expect(filter.changedFiles.size).toBe(2);
    expect(filter.changedFiles.has("src/a.ts")).toBe(true);
    expect(filter.changedFiles.has("src/b.ts")).toBe(true);
  });

  it("returns empty changedFiles map for empty diff", async () => {
    const exec = createMockExec("");
    const filter = await getChangedFiles("main", { exec });

    expect(filter.changedFiles.size).toBe(0);
  });

  it("returns empty changedFiles map for whitespace-only diff", async () => {
    const exec = createMockExec("  \n  \n");
    const filter = await getChangedFiles("main", { exec });

    expect(filter.changedFiles.size).toBe(0);
  });

  it("includes ref in description", async () => {
    const exec = createMockExec("src/foo.ts\n");
    const filter = await getChangedFiles("abc123", { exec });

    expect(filter.description).toBe("Changed since abc123");
  });

  it("includes branch name in description", async () => {
    const exec = createMockExec("src/foo.ts\n");
    const filter = await getChangedFiles("origin/main", { exec });

    expect(filter.description).toBe("Changed since origin/main");
  });

  it("throws with clear error on non-zero git exit", async () => {
    const exec = createMockExec("fatal: bad revision 'nonexistent'", 128);

    await expect(getChangedFiles("nonexistent", { exec })).rejects.toThrow(
      /git diff failed.*exit code 128/i,
    );
  });

  it("includes stderr/stdout context in error message", async () => {
    const exec = createMockExec("fatal: bad revision 'nope'", 1);

    await expect(getChangedFiles("nope", { exec })).rejects.toThrow(
      "bad revision",
    );
  });

  it("passes correct git arguments to exec", async () => {
    let capturedCommand = "";
    let capturedArgs: string[] = [];
    const exec: ExecFn = async (command: string, args: string[]) => {
      capturedCommand = command;
      capturedArgs = args;
      return { stdout: "", exitCode: 0 };
    };

    await getChangedFiles("HEAD~3", { exec });

    expect(capturedCommand).toBe("git");
    expect(capturedArgs).toEqual(["diff", "--name-only", "HEAD~3", "--"]);
  });

  it("handles single file without trailing newline", async () => {
    const exec = createMockExec("src/only.ts");
    const filter = await getChangedFiles("main", { exec });

    expect(filter.changedFiles.size).toBe(1);
    expect(filter.changedFiles.has("src/only.ts")).toBe(true);
  });

  it("deduplicates repeated file paths", async () => {
    const exec = createMockExec("src/foo.ts\nsrc/foo.ts\n");
    const filter = await getChangedFiles("main", { exec });

    expect(filter.changedFiles.size).toBe(1);
  });

  // ── Security: argument injection prevention ──────────────────────

  it("rejects refs that start with a dash (flag injection)", async () => {
    const exec = createMockExec("");

    await expect(
      getChangedFiles("--output=/tmp/evil", { exec }),
    ).rejects.toThrow(/invalid git ref/i);
  });

  it("rejects refs with leading dash even with spaces", async () => {
    const exec = createMockExec("");

    await expect(
      getChangedFiles("-flag value", { exec }),
    ).rejects.toThrow(/invalid git ref/i);
  });

  it("strips control characters from ref in description", async () => {
    const exec = createMockExec("src/foo.ts\n");
    const filter = await getChangedFiles("main\x1b[31m", { exec });

    expect(filter.description).not.toContain("\x1b");
  });
});
