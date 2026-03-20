import { describe, it, expect } from "vitest";
import { getChangedFiles, parseUnifiedDiff, type ExecFn } from "../../src/cli/diff.js";

// ── Exec Helpers ────────────────────────────────────────────────────

function createMockExec(
  stdout: string,
  exitCode = 0,
): ExecFn {
  return async (_command: string, _args: string[]) => ({ stdout, exitCode });
}

// ── parseUnifiedDiff ────────────────────────────────────────────────

describe("parseUnifiedDiff", () => {
  it("single hunk adding lines 10 to 15 produces one span", () => {
    const diff = [
      "diff --git a/app.ts b/app.ts",
      "index abc123..def456 100644",
      "--- a/app.ts",
      "+++ b/app.ts",
      "@@ -5,3 +10,5 @@ function foo() {",
    ].join("\n");

    const result = parseUnifiedDiff(diff);
    expect(result.get("app.ts")).toEqual([
      { startLine: 10, endLine: 15, startColumn: 0, endColumn: 0 },
    ]);
  });

  it("multiple hunks in one file produce multiple spans", () => {
    const diff = [
      "diff --git a/app.ts b/app.ts",
      "index abc123..def456 100644",
      "--- a/app.ts",
      "+++ b/app.ts",
      "@@ -1,3 +5,5 @@ function foo() {",
      "@@ -20,2 +30,5 @@ function bar() {",
    ].join("\n");

    const result = parseUnifiedDiff(diff);
    const spans = result.get("app.ts");
    expect(spans).toEqual([
      { startLine: 5, endLine: 10, startColumn: 0, endColumn: 0 },
      { startLine: 30, endLine: 35, startColumn: 0, endColumn: 0 },
    ]);
  });

  it("deletion-only hunk (count=0) produces empty span list", () => {
    const diff = [
      "diff --git a/old.ts b/old.ts",
      "index abc123..def456 100644",
      "--- a/old.ts",
      "+++ b/old.ts",
      "@@ -5,3 +5,0 @@ function removed() {",
    ].join("\n");

    const result = parseUnifiedDiff(diff);
    expect(result.get("old.ts")).toEqual([]);
  });

  it("new file (--- /dev/null) maps to null (whole-file)", () => {
    const diff = [
      "diff --git a/dev/null b/new-file.ts",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/new-file.ts",
      "@@ -0,0 +1,42 @@",
    ].join("\n");

    const result = parseUnifiedDiff(diff);
    expect(result.get("new-file.ts")).toBeNull();
  });

  it("multiple files each get their own spans", () => {
    const diff = [
      "diff --git a/a.ts b/a.ts",
      "index abc123..def456 100644",
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -1,2 +1,5 @@ function x() {",
      "diff --git a/b.ts b/b.ts",
      "index 111222..333444 100644",
      "--- a/b.ts",
      "+++ b/b.ts",
      "@@ -10,3 +10,4 @@ function y() {",
    ].join("\n");

    const result = parseUnifiedDiff(diff);
    expect(result.has("a.ts")).toBe(true);
    expect(result.has("b.ts")).toBe(true);
    expect(result.get("a.ts")).toEqual([
      { startLine: 1, endLine: 6, startColumn: 0, endColumn: 0 },
    ]);
    expect(result.get("b.ts")).toEqual([
      { startLine: 10, endLine: 14, startColumn: 0, endColumn: 0 },
    ]);
  });

  it("single-line addition at line 42 produces span [42, 43)", () => {
    const diff = [
      "diff --git a/fix.ts b/fix.ts",
      "index abc123..def456 100644",
      "--- a/fix.ts",
      "+++ b/fix.ts",
      "@@ -40,0 +42 @@ function fix() {",
    ].join("\n");

    const result = parseUnifiedDiff(diff);
    expect(result.get("fix.ts")).toEqual([
      { startLine: 42, endLine: 43, startColumn: 0, endColumn: 0 },
    ]);
  });

  it("normalizes backslash paths to forward slashes", () => {
    const diff = [
      "diff --git a/src\\cli\\diff.ts b/src\\cli\\diff.ts",
      "index abc123..def456 100644",
      "--- a/src\\cli\\diff.ts",
      "+++ b/src\\cli\\diff.ts",
      "@@ -1,2 +1,3 @@",
    ].join("\n");

    const result = parseUnifiedDiff(diff);
    expect(result.has("src/cli/diff.ts")).toBe(true);
  });

  it("returns empty map for empty input", () => {
    const result = parseUnifiedDiff("");
    expect(result.size).toBe(0);
  });

  it("handles explicit +start,1 as count=1", () => {
    const diff = [
      "diff --git a/x.ts b/x.ts",
      "index abc..def 100644",
      "--- a/x.ts",
      "+++ b/x.ts",
      "@@ -10,1 +20,1 @@",
    ].join("\n");

    const result = parseUnifiedDiff(diff);
    expect(result.get("x.ts")).toEqual([
      { startLine: 20, endLine: 21, startColumn: 0, endColumn: 0 },
    ]);
  });
});

// ── getChangedFiles ─────────────────────────────────────────────────

describe("getChangedFiles", () => {
  it("passes --unified=0 to git diff", async () => {
    let capturedArgs: string[] = [];
    const exec: ExecFn = async (_command: string, args: string[]) => {
      capturedArgs = args;
      return { stdout: "", exitCode: 0 };
    };

    await getChangedFiles("HEAD~3", { exec });

    expect(capturedArgs).toEqual(["diff", "--unified=0", "HEAD~3", "--"]);
  });

  it("parses unified diff output into line-level spans", async () => {
    const diffOutput = [
      "diff --git a/src/foo.ts b/src/foo.ts",
      "index abc..def 100644",
      "--- a/src/foo.ts",
      "+++ b/src/foo.ts",
      "@@ -1,3 +1,5 @@ function foo() {",
      "",
    ].join("\n");
    const exec = createMockExec(diffOutput);
    const filter = await getChangedFiles("main", { exec });

    expect(filter.changedFiles.size).toBe(1);
    expect(filter.changedFiles.get("src/foo.ts")).toEqual([
      { startLine: 1, endLine: 6, startColumn: 0, endColumn: 0 },
    ]);
  });

  it("maps new files to null (whole-file)", async () => {
    const diffOutput = [
      "diff --git a/dev/null b/src/new.ts",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/src/new.ts",
      "@@ -0,0 +1,10 @@",
      "",
    ].join("\n");
    const exec = createMockExec(diffOutput);
    const filter = await getChangedFiles("main", { exec });

    expect(filter.changedFiles.get("src/new.ts")).toBeNull();
  });

  it("returns empty changedFiles map for empty diff", async () => {
    const exec = createMockExec("");
    const filter = await getChangedFiles("main", { exec });

    expect(filter.changedFiles.size).toBe(0);
  });

  it("includes ref in description", async () => {
    const exec = createMockExec("");
    const filter = await getChangedFiles("abc123", { exec });

    expect(filter.description).toBe("Changed since abc123");
  });

  it("includes branch name in description", async () => {
    const exec = createMockExec("");
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
    const exec = createMockExec("");
    const filter = await getChangedFiles("main\x1b[31m", { exec });

    expect(filter.description).not.toContain("\x1b");
  });
});
