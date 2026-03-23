import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import {
  mkdtempSync,
  existsSync,
  readFileSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";

const execFileAsync = promisify(execFile);
const ROOT = join(__dirname, "../..");
const CLI = join(ROOT, "dist/cli.js");
const FIXTURES = join(ROOT, "tests/fixtures");
const ISTANBUL_COV = join(FIXTURES, "istanbul-coverage.json");
const PACKAGE_VERSION = JSON.parse(
  readFileSync(join(ROOT, "package.json"), "utf-8"),
) as { version: string };

// ── Helper ──────────────────────────────────────────────────────────

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

// ── Exit Codes ──────────────────────────────────────────────────────

describe("exit codes", () => {
  it("exits 0 on --help", async () => {
    const { exitCode, stdout } = await runCli(["--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Usage:");
  });

  it("exits 0 on --version", async () => {
    const { exitCode } = await runCli(["--version"]);
    expect(exitCode).toBe(0);
  });

  it("exits 2 on --strict --lenient together", async () => {
    const { exitCode, stderr } = await runCli([
      "--strict",
      "--lenient",
      "--coverage",
      ISTANBUL_COV,
      "--src",
      FIXTURES,
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/conflicting/i);
  });

  it("exits 2 on --strict --threshold together", async () => {
    const { exitCode, stderr } = await runCli([
      "--strict",
      "--threshold",
      "15",
      "--coverage",
      ISTANBUL_COV,
      "--src",
      FIXTURES,
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/conflicting/i);
  });

  it("exits 2 on --quiet --verbose together", async () => {
    const { exitCode, stderr } = await runCli([
      "--quiet",
      "--verbose",
      "--coverage",
      ISTANBUL_COV,
      "--src",
      FIXTURES,
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/conflicting/i);
  });
});

// ── Output Formats ──────────────────────────────────────────────────

describe("output formats", () => {
  it("JSON output parses and contains envelope fields", async () => {
    const { exitCode, stdout } = await runCli([
      "--coverage",
      ISTANBUL_COV,
      "--src",
      FIXTURES,
      "--threshold",
      "1000",
      "-f",
      "json",
    ]);
    expect(exitCode).toBe(0);

    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty("$schema");
    expect(parsed).toHaveProperty("version");
    expect(parsed).toHaveProperty("timestamp");
    expect(parsed).toHaveProperty("summary");
    expect(parsed).toHaveProperty("passed");
  });

  it("--version shows the correct version string", async () => {
    const { stdout } = await runCli(["--version"]);
    expect(stdout.trim()).toBe("0.3.0");
  });

  it("markdown output contains content", async () => {
    const { exitCode, stdout } = await runCli([
      "--coverage",
      ISTANBUL_COV,
      "--src",
      FIXTURES,
      "--threshold",
      "1000",
      "-f",
      "markdown",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toBeDefined();
    expect(stdout.length).toBeGreaterThan(0);
  });
});

// ── Flags ───────────────────────────────────────────────────────────

describe("flags", () => {
  it("--strict sets threshold to 8", async () => {
    const { stdout } = await runCli([
      "--coverage",
      ISTANBUL_COV,
      "--src",
      FIXTURES,
      "-f",
      "json",
      "--strict",
    ]);
    const parsed = JSON.parse(stdout);
    expect(parsed.config.defaultThreshold).toBe(8);
  });

  it("--lenient sets threshold to 30", async () => {
    const { stdout } = await runCli([
      "--coverage",
      ISTANBUL_COV,
      "--src",
      FIXTURES,
      "-f",
      "json",
      "--lenient",
    ]);
    const parsed = JSON.parse(stdout);
    expect(parsed.config.defaultThreshold).toBe(30);
  });

  it("--quiet produces no stdout", async () => {
    const { exitCode, stdout } = await runCli([
      "--coverage",
      ISTANBUL_COV,
      "--src",
      FIXTURES,
      "--threshold",
      "1000",
      "--quiet",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
  });

  it("--no-color suppresses ANSI codes", async () => {
    const { stdout } = await runCli([
      "--coverage",
      ISTANBUL_COV,
      "--src",
      FIXTURES,
      "--no-color",
    ]);
    // ANSI escape codes start with ESC (0x1b)
     
    expect(stdout).not.toMatch(/\u001b\[/);
  });

  it("NO_COLOR=1 env var suppresses ANSI codes", async () => {
    const { stdout } = await runCli(
      ["--coverage", ISTANBUL_COV, "--src", FIXTURES],
      { env: { NO_COLOR: "1" } },
    );
     
    expect(stdout).not.toMatch(/\u001b\[/);
  });

  it("--summary produces a single summary line", async () => {
    const { exitCode, stdout } = await runCli([
      "--coverage",
      ISTANBUL_COV,
      "--src",
      FIXTURES,
      "--threshold",
      "1000",
      "--summary",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toMatch(/^(PASS|FAIL):/);
    // Summary is a single line
    const lines = stdout.trim().split("\n");
    expect(lines).toHaveLength(1);
  });

  it("--sort with invalid value produces an error", async () => {
    const { stderr, exitCode } = await runCli([
      "--coverage",
      ISTANBUL_COV,
      "--src",
      FIXTURES,
      "--sort",
      "nonsense",
    ]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("Invalid --sort value");
  });
});

// ── Environment Variables ───────────────────────────────────────────

describe("environment variables", () => {
  it("CRAP4TS_FORMAT=json sets output format", async () => {
    const { exitCode, stdout } = await runCli(
      ["--coverage", ISTANBUL_COV, "--src", FIXTURES, "--threshold", "1000"],
      { env: { CRAP4TS_FORMAT: "json" } },
    );
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty("$schema");
    expect(parsed).toHaveProperty("version");
  });

  it("CRAP4TS_THRESHOLD overrides default threshold", async () => {
    const { stdout } = await runCli(
      ["--coverage", ISTANBUL_COV, "--src", FIXTURES, "-f", "json"],
      { env: { CRAP4TS_THRESHOLD: "20" } },
    );
    const parsed = JSON.parse(stdout);
    expect(parsed.config.defaultThreshold).toBe(20);
  });

  it("CLI --threshold overrides CRAP4TS_THRESHOLD env var", async () => {
    const { stdout } = await runCli(
      [
        "--coverage",
        ISTANBUL_COV,
        "--src",
        FIXTURES,
        "-f",
        "json",
        "--threshold",
        "25",
      ],
      { env: { CRAP4TS_THRESHOLD: "20" } },
    );
    const parsed = JSON.parse(stdout);
    expect(parsed.config.defaultThreshold).toBe(25);
  });
});

// ── Path Handling ───────────────────────────────────────────────────

describe("path handling and auto-discovery", () => {
  let tempProjectDir: string;
  let coveragePath: string;
  let absoluteSrcPath: string;

  beforeAll(() => {
    tempProjectDir = mkdtempSync(join(tmpdir(), "crap4ts-project-"));
    absoluteSrcPath = join(tempProjectDir, "src");
    coveragePath = join(tempProjectDir, "coverage", "coverage-final.json");
    const sourcePath = join(absoluteSrcPath, "math.ts");

    mkdirSync(absoluteSrcPath, { recursive: true });
    mkdirSync(join(tempProjectDir, "coverage"), { recursive: true });

    writeFileSync(
      join(tempProjectDir, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { rootDir: "src" } }, null, 2),
      "utf-8",
    );
    writeFileSync(
      sourcePath,
      [
        "export function add(a: number, b: number) {",
        "  return a + b;",
        "}",
        "",
      ].join("\n"),
      "utf-8",
    );
    writeFileSync(
      coveragePath,
      JSON.stringify(
        {
          [sourcePath]: {
            path: sourcePath,
            fnMap: {
              "0": {
                name: "add",
                decl: {
                  start: { line: 1, column: 16 },
                  end: { line: 1, column: 19 },
                },
                loc: {
                  start: { line: 1, column: 0 },
                  end: { line: 3, column: 1 },
                },
              },
            },
            f: { "0": 1 },
            statementMap: {
              "0": {
                start: { line: 2, column: 2 },
                end: { line: 2, column: 15 },
              },
            },
            s: { "0": 1 },
            branchMap: {},
            b: {},
          },
        },
        null,
        2,
      ),
      "utf-8",
    );
  });

  afterAll(() => {
    rmSync(tempProjectDir, { recursive: true, force: true });
  });

  it("auto-discovers coverage and source roots without returning a false-green empty analysis", async () => {
    const { exitCode, stdout } = await runCli(["-f", "json"], {
      cwd: tempProjectDir,
    });

    expect(exitCode).toBe(0);

    const parsed = JSON.parse(stdout);
    expect(parsed.summary.totalFunctions).toBe(1);
    expect(parsed.functions).toHaveLength(1);
    expect(parsed.functions[0].scored.identity.filePath).toBe("src/math.ts");
    expect(parsed.version).toBe(PACKAGE_VERSION.version);
  });

  it("accepts absolute --src paths and relative --coverage paths together", async () => {
    const { exitCode, stdout } = await runCli(
      [
        "--coverage",
        "coverage/coverage-final.json",
        "--src",
        absoluteSrcPath,
        "-f",
        "json",
      ],
      { cwd: tempProjectDir },
    );

    expect(exitCode).toBe(0);

    const parsed = JSON.parse(stdout);
    expect(parsed.summary.totalFunctions).toBe(1);
    expect(parsed.functions[0].scored.identity.filePath).toBe("src/math.ts");
  });
});

// ── Init Command ────────────────────────────────────────────────────

describe("init command", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "crap4ts-init-"));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates crap4ts.config.ts in a temp directory", async () => {
    const { exitCode, stdout } = await runCli(["init"], { cwd: tempDir });
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Created");

    const configPath = join(tempDir, "crap4ts.config.ts");
    expect(existsSync(configPath)).toBe(true);
  });

  it("warns and exits 2 when config already exists", async () => {
    // The config was created by the previous test — running init again should fail
    const { exitCode, stderr } = await runCli(["init"], { cwd: tempDir });
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/already exists/i);
  });

  it("generated config contains defineConfig import", async () => {
    // Use a fresh temp dir to get a clean config
    const freshDir = mkdtempSync(join(tmpdir(), "crap4ts-init-"));
    await runCli(["init"], { cwd: freshDir });

    const configPath = join(freshDir, "crap4ts.config.ts");
    const content = readFileSync(configPath, "utf-8");
    expect(content).toContain('import { defineConfig } from "crap4ts"');
    expect(content).toContain("defineConfig(");

    rmSync(freshDir, { recursive: true, force: true });
  });
});
