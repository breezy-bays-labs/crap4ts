import { describe, it, expect, beforeAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

const execFileAsync = promisify(execFile);
const ROOT = join(__dirname, "../..");
const CLI = join(ROOT, "dist/cli.js");
const FIXTURES = join(ROOT, "tests/fixtures");
const ISTANBUL_COV = join(FIXTURES, "istanbul-coverage.json");

async function runCli(
  args: string[],
  options?: { env?: Record<string, string> },
) {
  try {
    const result = await execFileAsync("node", [CLI, ...args], {
      cwd: ROOT,
      env: { ...process.env, ...options?.env, NO_COLOR: "1" },
    });
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
  } catch (_e: unknown) {
    const err = _e as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      exitCode: err.code ?? 1,
    };
  }
}

beforeAll(async () => {
  await execFileAsync("npm", ["run", "build"], { cwd: ROOT });
}, 30_000);

describe("--breakdown CLI flag", () => {
  describe("flag parsing", () => {
    it("--breakdown without value defaults to exceeding mode", async () => {
      const { stdout } = await runCli([
        "-c", ISTANBUL_COV,
        "-s", FIXTURES,
        "--breakdown",
        "-f", "json",
      ]);
      const parsed = JSON.parse(stdout);
      // Exceeding functions should have contributors, non-exceeding should not
      for (const fn of parsed.functions) {
        if (fn.exceeds) {
          expect(fn.scored).toHaveProperty("contributors");
        } else {
          expect(fn.scored).not.toHaveProperty("contributors");
        }
      }
    });

    it("--breakdown all sets mode to all", async () => {
      const { stdout } = await runCli([
        "-c", ISTANBUL_COV,
        "-s", FIXTURES,
        "--breakdown", "all",
        "-f", "json",
      ]);
      const parsed = JSON.parse(stdout);
      for (const fn of parsed.functions) {
        expect(fn.scored).toHaveProperty("contributors");
      }
    });

    it("no --breakdown flag defaults to off mode", async () => {
      const { stdout } = await runCli([
        "-c", ISTANBUL_COV,
        "-s", FIXTURES,
        "-f", "json",
      ]);
      const parsed = JSON.parse(stdout);
      for (const fn of parsed.functions) {
        expect(fn.scored).not.toHaveProperty("contributors");
      }
    });

    it("--breakdown with invalid value produces an error", async () => {
      const { stderr, exitCode } = await runCli([
        "-c", ISTANBUL_COV,
        "-s", FIXTURES,
        "--breakdown", "nonsense",
        "-f", "json",
      ]);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("Invalid --breakdown");
    });
  });

  describe("format interactions", () => {
    it("--breakdown without -f json warns and omits contributors (table format)", async () => {
      const { stdout, stderr, exitCode } = await runCli([
        "-c", ISTANBUL_COV,
        "-s", FIXTURES,
        "--breakdown",
      ]);
      expect(exitCode).toBeLessThanOrEqual(1);
      expect(stderr).toContain("--breakdown is only supported with JSON format");
      expect(stdout).not.toContain('"contributors"');
    });

    it("--breakdown with -f markdown warns and omits contributors", async () => {
      const { stdout, stderr, exitCode } = await runCli([
        "-c", ISTANBUL_COV,
        "-s", FIXTURES,
        "--breakdown",
        "-f", "markdown",
      ]);
      expect(exitCode).toBeLessThanOrEqual(1);
      expect(stderr).toContain("--breakdown is only supported with JSON format");
      expect(stdout).toContain("crap4ts Report");
    });
  });

  describe("suppression flags", () => {
    it("--summary suppresses breakdown output", async () => {
      const { stdout } = await runCli([
        "-c", ISTANBUL_COV,
        "-s", FIXTURES,
        "--breakdown",
        "--summary",
        "-f", "json",
      ]);
      // Summary line doesn't contain contributor data
      expect(stdout).not.toContain('"contributors"');
    });

    it("--quiet suppresses all output including breakdown", async () => {
      const { stdout } = await runCli([
        "-c", ISTANBUL_COV,
        "-s", FIXTURES,
        "--breakdown",
        "-q",
      ]);
      expect(stdout).toBe("");
    });
  });

  describe("edge cases", () => {
    it("--breakdown with no source files produces empty result", async () => {
      const { stdout } = await runCli([
        "-c", ISTANBUL_COV,
        "-s", "/tmp/crap4ts-empty-dir-nonexistent",
        "--breakdown",
        "-f", "json",
      ]);
      const parsed = JSON.parse(stdout);
      expect(parsed.functions).toEqual([]);
    });
  });

  describe("composition with existing flags", () => {
    it("--breakdown composes with --top", async () => {
      const { stdout } = await runCli([
        "-c", ISTANBUL_COV,
        "-s", FIXTURES,
        "--breakdown", "all",
        "--top", "3",
        "-f", "json",
      ]);
      const parsed = JSON.parse(stdout);
      expect(parsed.functions.length).toBeLessThanOrEqual(3);
      for (const fn of parsed.functions) {
        expect(fn.scored).toHaveProperty("contributors");
      }
    });

    it("--breakdown composes with --sort", async () => {
      const { stdout } = await runCli([
        "-c", ISTANBUL_COV,
        "-s", FIXTURES,
        "--breakdown", "all",
        "--sort", "complexity",
        "-f", "json",
      ]);
      const parsed = JSON.parse(stdout);
      // Verify sorted by complexity descending
      for (let i = 1; i < parsed.functions.length; i++) {
        expect(parsed.functions[i - 1].scored.cyclomaticComplexity)
          .toBeGreaterThanOrEqual(parsed.functions[i].scored.cyclomaticComplexity);
      }
      for (const fn of parsed.functions) {
        expect(fn.scored).toHaveProperty("contributors");
      }
    });
  });
});
