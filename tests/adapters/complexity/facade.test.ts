import { describe, it, expect } from "vitest";
import {
  extractComplexity,
  ComplexityExtractionError,
} from "../../../src/adapters/complexity/facade.js";

describe("extractComplexity", () => {
  // --- Happy paths ---

  it("returns complexity 1 for a simple function with no branches", () => {
    const source = `function greet() { return "hello"; }`;
    const result = extractComplexity(source, "src/greet.ts");

    expect(result).toHaveLength(1);
    expect(result[0]!.cyclomaticComplexity).toBe(1);
    expect(result[0]!.identity.qualifiedName).toBe("greet");
  });

  it("returns correct CC for a function with branches", () => {
    const source = `
      function process(x: number) {
        if (x > 0) {
          for (let i = 0; i < x; i++) {
            console.log(i);
          }
        }
      }
    `;
    const result = extractComplexity(source, "src/process.ts");

    expect(result).toHaveLength(1);
    expect(result[0]!.cyclomaticComplexity).toBe(3); // 1 base + if + for
  });

  it("returns multiple functions from a single source", () => {
    const source = `
      function foo() { return 1; }
      function bar() { return 2; }
    `;
    const result = extractComplexity(source, "src/multi.ts");

    expect(result).toHaveLength(2);
  });

  it("returns qualified names for class methods", () => {
    const source = `
      class Service {
        init() { return true; }
        run() { return false; }
      }
    `;
    const result = extractComplexity(source, "src/service.ts");

    expect(result).toHaveLength(2);
    const names = result.map((r) => r.identity.qualifiedName);
    expect(names).toContain("Service.init");
    expect(names).toContain("Service.run");
  });

  // --- File path is metadata ---

  it("includes the provided file path in function identity", () => {
    const source = `function main() {}`;
    const result = extractComplexity(source, "src/app.ts");

    expect(result[0]!.identity.filePath).toBe("src/app.ts");
  });

  // --- Empty results ---

  it("returns empty array for source with no functions", () => {
    const source = `
      interface Foo { bar: string; }
      type Baz = number;
    `;
    const result = extractComplexity(source, "src/types.ts");

    expect(result).toEqual([]);
  });

  it("returns empty array for empty source", () => {
    const result = extractComplexity("", "src/empty.ts");
    expect(result).toEqual([]);
  });

  // --- Error handling ---

  it("throws ComplexityExtractionError for invalid TypeScript syntax", () => {
    const invalidSource = `function { broken syntax +++`;

    expect(() => extractComplexity(invalidSource, "src/bad.ts")).toThrow(
      ComplexityExtractionError,
    );
  });

  it("wraps the original parse error as cause", () => {
    const invalidSource = `function { broken syntax +++`;

    try {
      extractComplexity(invalidSource, "src/bad.ts");
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ComplexityExtractionError);
      expect((error as ComplexityExtractionError).cause).toBeDefined();
    }
  });

  it("throws ComplexityExtractionError for binary content", () => {
    const binaryContent = "\x00\x01\x02\x03\xFF\xFE";

    expect(() => extractComplexity(binaryContent, "src/binary.ts")).toThrow(
      ComplexityExtractionError,
    );
  });
});
