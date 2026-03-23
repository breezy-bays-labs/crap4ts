import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("action shell hardening", () => {
  const root = join(import.meta.dirname, "../..");
  const actionYml = readFileSync(join(root, "action.yml"), "utf-8");

  it("validates report format and threshold before invoking the CLI", () => {
    expect(actionYml).toContain('case "$format" in');
    expect(actionYml).toContain('json|markdown|table');
    expect(actionYml).toContain("Invalid threshold input");
  });

  it("fails the workflow if markdown comment generation exits unexpectedly", () => {
    expect(actionYml).toContain("MARKDOWN_EXIT_CODE=$?");
    expect(actionYml).toContain("markdown report failed with exit code");
    expect(actionYml).toContain("markdown report produced no output");
  });
});
