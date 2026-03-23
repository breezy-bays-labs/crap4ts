import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("action.yml parity with README", () => {
  const root = join(import.meta.dirname, "../..");
  const readme = readFileSync(join(root, "README.md"), "utf-8");
  const actionYml = readFileSync(join(root, "action.yml"), "utf-8");

  function extractYamlKeys(content: string, section: string): string[] {
    const sectionMatch = content.match(
      new RegExp(`^${section}:\\s*\\n([\\s\\S]*?)(?=^\\w|$)`, "m"),
    );
    if (!sectionMatch) return [];
    const block = sectionMatch[1];
    const keys: string[] = [];
    for (const line of block.split("\n")) {
      const match = line.match(/^ {2}(\S+):/);
      if (match) keys.push(match[1]);
    }
    return keys;
  }

  it("all action inputs are documented in README", () => {
    const inputs = extractYamlKeys(actionYml, "inputs").filter(
      (k) => k !== "local", // local is repo-internal smoke-test wiring
    );

    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) {
      expect(readme).toContain(`\`${input}\``);
    }
  });

  it("all action outputs are documented in README", () => {
    const outputs = extractYamlKeys(actionYml, "outputs");

    expect(outputs.length).toBeGreaterThan(0);
    for (const output of outputs) {
      expect(readme).toContain(`\`${output}\``);
    }
  });
});
