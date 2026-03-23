import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "../..");
const CLI = join(ROOT, "dist/cli.js");

beforeAll(() => {
  if (!existsSync(CLI)) {
    execFileSync("npm", ["run", "build"], { cwd: ROOT });
  }
}, 30_000);

describe("CLI help output", () => {
  it("matches the expected options snapshot", () => {
    const help = execFileSync("node", [CLI, "--help"], {
      encoding: "utf-8",
    });
    expect(help).toMatchSnapshot();
  });
});
