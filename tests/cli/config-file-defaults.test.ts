/**
 * BDD step definitions for tests/cli/config-file-defaults.feature
 *
 * Schema validation scenarios use defineConfig directly (unit-level).
 * Priority cascade scenarios use resolveConfig (unit-level).
 * CLI integration scenarios use execFile against the built CLI.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { existsSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { defineConfig } from "../../src/core/define-config.js";
import { resolveConfig } from "../../src/cli/config.js";

const execFileAsync = promisify(execFile);
const ROOT = join(__dirname, "../..");
const CLI = join(ROOT, "dist/cli.js");
const FIXTURES = join(ROOT, "tests/fixtures");
const ISTANBUL_COV = join(FIXTURES, "istanbul-coverage.json");

async function runCli(
  args: string[],
  options?: { env?: Record<string, string>; cwd?: string },
) {
  try {
    const result = await execFileAsync("node", [CLI, ...args], {
      cwd: options?.cwd ?? ROOT,
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
  if (!existsSync(CLI)) {
    await execFileAsync("npm", ["run", "build"], { cwd: ROOT });
  }
}, 30_000);

// ── Schema validation ───────────────────────────────────────────────

describe("config file defaults — schema validation", () => {
  it("accepts all valid fields", () => {
    const config = defineConfig({
      format: "json",
      src: ["src", "lib"],
      breakdown: "all",
      sort: "crap",
      top: 10,
      summary: true,
    });
    expect(config.format).toBe("json");
    expect(config.src).toEqual(["src", "lib"]);
    expect(config.breakdown).toBe("all");
    expect(config.sort).toBe("crap");
    expect(config.top).toBe(10);
    expect(config.summary).toBe(true);
  });

  it("rejects invalid format value", () => {
    // @ts-expect-error — testing runtime validation
    expect(() => defineConfig({ format: "xml" })).toThrow();
  });

  it("rejects invalid breakdown value", () => {
    // @ts-expect-error — testing runtime validation
    expect(() => defineConfig({ breakdown: "none" })).toThrow();
  });

  it("rejects invalid sort value", () => {
    // @ts-expect-error — testing runtime validation
    expect(() => defineConfig({ sort: "date" })).toThrow();
  });

  it("rejects non-positive top value", () => {
    expect(() => defineConfig({ top: 0 })).toThrow();
  });

  it("rejects non-integer top value", () => {
    expect(() => defineConfig({ top: 2.5 })).toThrow();
  });

  it("accepts src as a single string", () => {
    const config = defineConfig({ src: "src" });
    expect(config.src).toBe("src");
  });

  it("accepts src as an array of strings", () => {
    const config = defineConfig({ src: ["src", "lib"] });
    expect(config.src).toEqual(["src", "lib"]);
  });
});

// ── Priority cascade ────────────────────────────────────────────────

describe("config file defaults — priority cascade", () => {
  it("config file format is used when no CLI flag is given", () => {
    const resolved = resolveConfig({
      fileConfig: { format: "json" },
    });
    expect(resolved.format).toBe("json");
  });

  it("CLI format overrides config file format", () => {
    const resolved = resolveConfig({
      fileConfig: { format: "json" },
      cliFlags: { format: "markdown" },
    });
    expect(resolved.format).toBe("markdown");
  });

  it("env variable format overrides config file format", () => {
    const resolved = resolveConfig({
      fileConfig: { format: "table" },
      env: { CRAP4TS_FORMAT: "json" },
    });
    expect(resolved.format).toBe("json");
  });

  it("CLI format overrides both env and config file", () => {
    const resolved = resolveConfig({
      fileConfig: { format: "table" },
      env: { CRAP4TS_FORMAT: "json" },
      cliFlags: { format: "markdown" },
    });
    expect(resolved.format).toBe("markdown");
  });

  it("env variables do not affect sort, breakdown, top, or summary", () => {
    const resolved = resolveConfig({
      fileConfig: { sort: "complexity", breakdown: "all", top: 5, summary: true },
      env: {},
    });
    expect(resolved.sort).toBe("complexity");
    expect(resolved.breakdown).toBe("all");
    expect(resolved.top).toBe(5);
    expect(resolved.summary).toBe(true);
  });

  it("config file src is used when no CLI flag is given", () => {
    const resolved = resolveConfig({
      fileConfig: { src: ["src"] },
    });
    expect(resolved.src).toEqual(["src"]);
  });

  it("CLI src replaces config file src entirely", () => {
    const resolved = resolveConfig({
      fileConfig: { src: ["src", "lib"] },
      cliFlags: { src: ["lib"] },
    });
    expect(resolved.src).toEqual(["lib"]);
  });

  it("config file breakdown is used when no CLI flag is given", () => {
    const resolved = resolveConfig({
      fileConfig: { breakdown: "all" },
    });
    expect(resolved.breakdown).toBe("all");
  });

  it("CLI breakdown overrides config file breakdown", () => {
    const resolved = resolveConfig({
      fileConfig: { breakdown: "all" },
      cliFlags: { breakdown: "exceeding" },
    });
    expect(resolved.breakdown).toBe("exceeding");
  });

  it("config file sort is used when no CLI flag is given", () => {
    const resolved = resolveConfig({
      fileConfig: { sort: "complexity" },
    });
    expect(resolved.sort).toBe("complexity");
  });

  it("CLI sort overrides config file sort", () => {
    const resolved = resolveConfig({
      fileConfig: { sort: "complexity" },
      cliFlags: { sort: "name" },
    });
    expect(resolved.sort).toBe("name");
  });

  it("config file top limits output when no CLI flag is given", () => {
    const resolved = resolveConfig({
      fileConfig: { top: 3 },
    });
    expect(resolved.top).toBe(3);
  });

  it("CLI top overrides config file top", () => {
    const resolved = resolveConfig({
      fileConfig: { top: 3 },
      cliFlags: { top: 5 },
    });
    expect(resolved.top).toBe(5);
  });

  it("config file summary enables summary-only output", () => {
    const resolved = resolveConfig({
      fileConfig: { summary: true },
    });
    expect(resolved.summary).toBe(true);
  });

  it("config file summary false does not enable summary", () => {
    const resolved = resolveConfig({
      fileConfig: { summary: false },
    });
    expect(resolved.summary).toBe(false);
  });

  it("omitted config fields fall back to built-in defaults", () => {
    const resolved = resolveConfig({
      fileConfig: { threshold: 15 },
    });
    expect(resolved.format).toBeUndefined();
    expect(resolved.breakdown).toBeUndefined();
    expect(resolved.sort).toBeUndefined();
    expect(resolved.top).toBeUndefined();
    expect(resolved.summary).toBeUndefined();
  });
});

// ── CLI integration ─────────────────────────────────────────────────

describe("config file defaults — CLI integration", () => {
  it("config file format produces JSON output", async () => {
    const { stdout } = await runCli([
      "-c", ISTANBUL_COV,
      "-s", FIXTURES,
      "-f", "json",
    ]);
    expect(() => JSON.parse(stdout)).not.toThrow();
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty("summary");
    expect(parsed).toHaveProperty("functions");
  });

  it("--sort complexity orders functions by complexity descending", async () => {
    const { stdout } = await runCli([
      "-c", ISTANBUL_COV,
      "-s", FIXTURES,
      "--sort", "complexity",
      "-f", "json",
    ]);
    const parsed = JSON.parse(stdout);
    const complexities = parsed.functions.map(
      (f: { scored: { cyclomaticComplexity: number } }) =>
        f.scored.cyclomaticComplexity,
    );
    for (let i = 1; i < complexities.length; i++) {
      expect(complexities[i]).toBeLessThanOrEqual(complexities[i - 1]);
    }
  });

  it("--top 3 limits output to at most 3 functions", async () => {
    const { stdout } = await runCli([
      "-c", ISTANBUL_COV,
      "-s", FIXTURES,
      "--top", "3",
      "-f", "json",
    ]);
    const parsed = JSON.parse(stdout);
    expect(parsed.functions.length).toBeLessThanOrEqual(3);
  });

  it("--summary shows only the summary line", async () => {
    const { stdout } = await runCli([
      "-c", ISTANBUL_COV,
      "-s", FIXTURES,
      "--summary",
    ]);
    const lines = stdout.trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^(PASS|FAIL):/);
  });

  it("malformed config file produces a clear error", async () => {
    const tmpDir = join(ROOT, "tests/.tmp-config-test");
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(
      join(tmpDir, "crap4ts.config.ts"),
      "export default { this is not valid }",
      "utf-8",
    );

    try {
      const { stderr, exitCode } = await runCli([
        "-c", ISTANBUL_COV,
        "-s", FIXTURES,
      ], { cwd: tmpDir });

      expect(exitCode).not.toBe(0);
      expect(stderr).toMatch(/error/i);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("init command scaffolds config with commented-out new fields", async () => {
    const tmpDir = join(ROOT, "tests/.tmp-init-test");
    mkdirSync(tmpDir, { recursive: true });

    try {
      const { stdout, exitCode } = await runCli(["init"], { cwd: tmpDir });
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/Created/);

      const { readFileSync } = await import("node:fs");
      const content = readFileSync(
        join(tmpDir, "crap4ts.config.ts"),
        "utf-8",
      );

      // Active fields
      expect(content).toMatch(/threshold:\s*12/);
      expect(content).toMatch(/coverageMetric:\s*"line"/);
      expect(content).toMatch(/exclude:/);

      // Commented-out new fields
      expect(content).toMatch(/\/\/\s*format:/);
      expect(content).toMatch(/\/\/\s*src:/);
      expect(content).toMatch(/\/\/\s*breakdown:/);
      expect(content).toMatch(/\/\/\s*sort:/);
      expect(content).toMatch(/\/\/\s*top:/);
      expect(content).toMatch(/\/\/\s*summary:/);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
