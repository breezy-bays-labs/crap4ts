import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "../..");
const CLI = join(ROOT, "dist/cli.js");

describe("CLI help output", () => {
  it("matches the expected options snapshot", () => {
    const help = execFileSync("node", [CLI, "--help"], {
      encoding: "utf-8",
    });
    expect(help).toMatchSnapshot();
  });
});
