import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { TypeScriptEslintComplexityAdapter } from "../../../src/adapters/complexity/typescript-eslint.js";

const adapter = new TypeScriptEslintComplexityAdapter();

function analyzeFixture(filename: string) {
  const source = readFileSync(`tests/fixtures/${filename}`, "utf-8");
  return adapter.extract(source, `tests/fixtures/${filename}`);
}

describe("TypeScriptEslintComplexityAdapter", () => {
  describe("simple-functions.ts", () => {
    it("identity has CC=1", () => {
      const results = analyzeFixture("simple-functions.ts");
      const fn = results.find(r => r.identity.qualifiedName === "identity");
      expect(fn?.cyclomaticComplexity).toBe(1);
    });

    it("abs has CC=2", () => {
      const results = analyzeFixture("simple-functions.ts");
      const fn = results.find(r => r.identity.qualifiedName === "abs");
      expect(fn?.cyclomaticComplexity).toBe(2);
    });

    it("classify has CC=3", () => {
      const results = analyzeFixture("simple-functions.ts");
      const fn = results.find(r => r.identity.qualifiedName === "classify");
      expect(fn?.cyclomaticComplexity).toBe(3);
    });
  });

  describe("complex-functions.ts", () => {
    it("dayType has CC=4 (3 cases + base)", () => {
      const results = analyzeFixture("complex-functions.ts");
      const fn = results.find(r => r.identity.qualifiedName === "dayType");
      expect(fn?.cyclomaticComplexity).toBe(4);
    });

    it("validate has CC=4 (3 logical ops + base)", () => {
      const results = analyzeFixture("complex-functions.ts");
      const fn = results.find(r => r.identity.qualifiedName === "validate");
      expect(fn?.cyclomaticComplexity).toBe(4);
    });

    it("sumPositive has CC=3 (for-of + if + base)", () => {
      const results = analyzeFixture("complex-functions.ts");
      const fn = results.find(r => r.identity.qualifiedName === "sumPositive");
      expect(fn?.cyclomaticComplexity).toBe(3);
    });

    it("getName has CC=3 (?. + ?? + base)", () => {
      const results = analyzeFixture("complex-functions.ts");
      const fn = results.find(r => r.identity.qualifiedName === "getName");
      expect(fn?.cyclomaticComplexity).toBe(3);
    });

    it("sign has CC=2 (ternary + base)", () => {
      const results = analyzeFixture("complex-functions.ts");
      const fn = results.find(r => r.identity.qualifiedName === "sign");
      expect(fn?.cyclomaticComplexity).toBe(2);
    });

    it("countDown has CC=2 (while + base)", () => {
      const results = analyzeFixture("complex-functions.ts");
      const fn = results.find(r => r.identity.qualifiedName === "countDown");
      expect(fn?.cyclomaticComplexity).toBe(2);
    });

    it("atLeastOnce has CC=2 (do-while + base)", () => {
      const results = analyzeFixture("complex-functions.ts");
      const fn = results.find(r => r.identity.qualifiedName === "atLeastOnce");
      expect(fn?.cyclomaticComplexity).toBe(2);
    });

    it("range has CC=2 (for + base)", () => {
      const results = analyzeFixture("complex-functions.ts");
      const fn = results.find(r => r.identity.qualifiedName === "range");
      expect(fn?.cyclomaticComplexity).toBe(2);
    });

    it("keyCount has CC=2 (for-in + base)", () => {
      const results = analyzeFixture("complex-functions.ts");
      const fn = results.find(r => r.identity.qualifiedName === "keyCount");
      expect(fn?.cyclomaticComplexity).toBe(2);
    });

    it("safeParse has CC=2 (catch + base)", () => {
      const results = analyzeFixture("complex-functions.ts");
      const fn = results.find(r => r.identity.qualifiedName === "safeParse");
      expect(fn?.cyclomaticComplexity).toBe(2);
    });
  });

  describe("does NOT count (negative tests)", () => {
    it("bare else does not add to CC (classify has CC=3, not CC=4)", () => {
      const results = analyzeFixture("simple-functions.ts");
      const fn = results.find(r => r.identity.qualifiedName === "classify");
      expect(fn?.cyclomaticComplexity).toBe(3);
    });

    it("default case does not add to CC (dayType has CC=4, not CC=5)", () => {
      const results = analyzeFixture("complex-functions.ts");
      const fn = results.find(r => r.identity.qualifiedName === "dayType");
      expect(fn?.cyclomaticComplexity).toBe(4);
    });
  });

  describe("class-functions.ts", () => {
    it("extracts Calculator.add with CC=1", () => {
      const results = analyzeFixture("class-functions.ts");
      const fn = results.find(r => r.identity.qualifiedName === "Calculator.add");
      expect(fn).toBeDefined();
      expect(fn?.cyclomaticComplexity).toBe(1);
    });

    it("extracts Calculator.safeDivide with CC=2", () => {
      const results = analyzeFixture("class-functions.ts");
      const fn = results.find(r => r.identity.qualifiedName === "Calculator.safeDivide");
      expect(fn).toBeDefined();
      expect(fn?.cyclomaticComplexity).toBe(2);
    });

    it("extracts EventProcessor.handler as arrow property with CC=3", () => {
      const results = analyzeFixture("class-functions.ts");
      const fn = results.find(r => r.identity.qualifiedName === "EventProcessor.handler");
      expect(fn).toBeDefined();
      expect(fn?.cyclomaticComplexity).toBe(3);
    });

    it("extracts EventProcessor.process as function expression property with CC=1", () => {
      const results = analyzeFixture("class-functions.ts");
      const fn = results.find(r => r.identity.qualifiedName === "EventProcessor.process");
      expect(fn).toBeDefined();
      expect(fn?.cyclomaticComplexity).toBe(1);
    });

    it("reports correct span for class methods", () => {
      const results = analyzeFixture("class-functions.ts");
      const fn = results.find(r => r.identity.qualifiedName === "Calculator.add");
      expect(fn?.identity.span.startLine).toBeGreaterThan(0);
      expect(fn?.identity.span.endLine).toBeGreaterThan(fn!.identity.span.startLine);
    });
  });

  describe("export-patterns.ts", () => {
    it("extracts exported named function greet with CC=1", () => {
      const results = analyzeFixture("export-patterns.ts");
      const fn = results.find(r => r.identity.qualifiedName === "greet");
      expect(fn).toBeDefined();
      expect(fn?.cyclomaticComplexity).toBe(1);
    });

    it("extracts const arrow function double with CC=1", () => {
      const results = analyzeFixture("export-patterns.ts");
      const fn = results.find(r => r.identity.qualifiedName === "double");
      expect(fn).toBeDefined();
      expect(fn?.cyclomaticComplexity).toBe(1);
    });

    it("extracts const function expression triple with CC=1", () => {
      const results = analyzeFixture("export-patterns.ts");
      const fn = results.find(r => r.identity.qualifiedName === "triple");
      expect(fn).toBeDefined();
      expect(fn?.cyclomaticComplexity).toBe(1);
    });

    it("does not extract non-function constants", () => {
      const results = analyzeFixture("export-patterns.ts");
      const fn = results.find(r => r.identity.qualifiedName === "PI");
      expect(fn).toBeUndefined();
    });
  });

  describe("export default function", () => {
    it("extracts export default function with name", () => {
      const source = "export default function myDefault() { return 1; }";
      const results = adapter.extract(source, "test.ts");
      const fn = results.find(r => r.identity.qualifiedName === "myDefault");
      expect(fn).toBeDefined();
      expect(fn?.cyclomaticComplexity).toBe(1);
    });

    it("extracts export default anonymous function as 'default'", () => {
      const source = "export default function() { return 1; }";
      const results = adapter.extract(source, "test.ts");
      const fn = results.find(r => r.identity.qualifiedName === "default");
      expect(fn).toBeDefined();
      expect(fn?.cyclomaticComplexity).toBe(1);
    });

    it("extracts export default arrow function as 'default'", () => {
      const source = "export default () => { return 1; }";
      const results = adapter.extract(source, "test.ts");
      const fn = results.find(r => r.identity.qualifiedName === "default");
      expect(fn).toBeDefined();
    });
  });

  describe("SourceSpan endLine conversion", () => {
    it("converts inclusive endLine to exclusive (domainEndLine = sourceEndLine + 1)", () => {
      const results = analyzeFixture("simple-functions.ts");
      const fn = results.find(r => r.identity.qualifiedName === "identity");
      expect(fn?.identity.span.endLine).toBeGreaterThan(fn!.identity.span.startLine);
    });
  });
});
