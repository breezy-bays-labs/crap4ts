import { describe, it, expect } from "vitest";
import { TypeScriptEslintComplexityAdapter } from "../../../src/adapters/complexity/typescript-eslint.js";

const adapter = new TypeScriptEslintComplexityAdapter();

function extract(source: string) {
  return adapter.extract(source, "test.ts");
}

function extractSingle(source: string) {
  const results = extract(source);
  expect(results).toHaveLength(1);
  return results[0];
}

describe("Complexity contributor collection", () => {
  // --- Invariant: contributors.length === CC - 1 ---

  it("simple function has empty contributors", () => {
    const fn = extractSingle("function foo() { return 1; }");
    expect(fn.cyclomaticComplexity).toBe(1);
    expect(fn.contributors).toEqual([]);
  });

  it("contributors count equals complexity minus one", () => {
    const fn = extractSingle(`function foo(x: number) {
  if (x > 0) {
    for (let i = 0; i < x; i++) {}
  }
}`);
    expect(fn.cyclomaticComplexity).toBe(3);
    expect(fn.contributors).toHaveLength(2);
  });

  // --- ContributorKind mapping ---

  it("if statement produces if-branch contributor", () => {
    const fn = extractSingle(`function foo() {
  if (true) {}
}`);
    expect(fn.contributors).toHaveLength(1);
    expect(fn.contributors[0].kind).toBe("if-branch");
    expect(fn.contributors[0].line).toBe(2);
  });

  it("ternary expression produces ternary contributor", () => {
    const fn = extractSingle(`function foo(x: number) {
  return x > 0 ? 1 : -1;
}`);
    expect(fn.contributors).toHaveLength(1);
    expect(fn.contributors[0].kind).toBe("ternary");
    expect(fn.contributors[0].line).toBe(2);
  });

  it("for loop produces for-loop contributor", () => {
    const fn = extractSingle(`function foo() {
  for (let i = 0; i < 10; i++) {}
}`);
    expect(fn.contributors).toHaveLength(1);
    expect(fn.contributors[0].kind).toBe("for-loop");
    expect(fn.contributors[0].line).toBe(2);
  });

  it("for-in loop produces for-loop contributor", () => {
    const fn = extractSingle(`function foo(obj: Record<string, unknown>) {
  for (const k in obj) {}
}`);
    expect(fn.contributors).toHaveLength(1);
    expect(fn.contributors[0].kind).toBe("for-loop");
  });

  it("for-of loop produces for-loop contributor", () => {
    const fn = extractSingle(`function foo(arr: number[]) {
  for (const x of arr) {}
}`);
    expect(fn.contributors).toHaveLength(1);
    expect(fn.contributors[0].kind).toBe("for-loop");
  });

  it("while loop produces while-loop contributor", () => {
    const fn = extractSingle(`function foo() {
  while (true) { break; }
}`);
    expect(fn.contributors).toHaveLength(1);
    expect(fn.contributors[0].kind).toBe("while-loop");
  });

  it("do-while loop produces do-while-loop contributor", () => {
    const fn = extractSingle(`function foo() {
  do {} while (false);
}`);
    expect(fn.contributors).toHaveLength(1);
    expect(fn.contributors[0].kind).toBe("do-while-loop");
  });

  it("catch clause produces catch contributor", () => {
    const fn = extractSingle(`function foo() {
  try {} catch (e) {}
}`);
    expect(fn.contributors).toHaveLength(1);
    expect(fn.contributors[0].kind).toBe("catch");
  });

  it("switch case produces case-branch contributors", () => {
    const fn = extractSingle(`function foo(x: string) {
  switch (x) {
    case "a": return 1;
    case "b": return 2;
    default: return 0;
  }
}`);
    const caseBranches = fn.contributors.filter((c) => c.kind === "case-branch");
    expect(caseBranches).toHaveLength(2);
  });

  it("default case and empty fall-through cases are not counted", () => {
    const fn = extractSingle(`function foo(x: string) {
  switch (x) {
    case "a":
    case "b": return 1;
    default: return 0;
  }
}`);
    // "a" is an empty fall-through (no statements), only "b" should count
    const caseBranches = fn.contributors.filter((c) => c.kind === "case-branch");
    expect(caseBranches).toHaveLength(1);
  });

  // --- Logical operators with operator field ---

  it("logical AND produces logical-operator contributor with operator", () => {
    const fn = extractSingle(`function foo(a: boolean, b: boolean) {
  return a && b;
}`);
    expect(fn.contributors).toHaveLength(1);
    expect(fn.contributors[0].kind).toBe("logical-operator");
    expect(fn.contributors[0].operator).toBe("&&");
    expect(fn.contributors[0].line).toBe(2);
  });

  it("logical OR produces logical-operator contributor with operator", () => {
    const fn = extractSingle(`function foo(a: boolean, b: boolean) {
  return a || b;
}`);
    expect(fn.contributors).toHaveLength(1);
    expect(fn.contributors[0].kind).toBe("logical-operator");
    expect(fn.contributors[0].operator).toBe("||");
  });

  it("nullish coalescing produces logical-operator contributor with operator", () => {
    const fn = extractSingle(`function foo(a: string | null) {
  return a ?? "default";
}`);
    expect(fn.contributors).toHaveLength(1);
    expect(fn.contributors[0].kind).toBe("logical-operator");
    expect(fn.contributors[0].operator).toBe("??");
  });

  it("optional chain produces optional-chain contributor with operator", () => {
    const fn = extractSingle(`function foo(a?: { b: string }) {
  return a?.b;
}`);
    expect(fn.contributors).toHaveLength(1);
    expect(fn.contributors[0].kind).toBe("optional-chain");
    expect(fn.contributors[0].operator).toBe("?.");
  });

  // --- Else-if chains ---

  it("else-if chain produces one if-branch contributor per condition", () => {
    const fn = extractSingle(`function foo(x: number) {
  if (x > 0) return "a";
  else if (x < 0) return "b";
  else if (x === 0) return "c";
  else return "d";
}`);
    const ifBranches = fn.contributors.filter((c) => c.kind === "if-branch");
    expect(ifBranches).toHaveLength(3);
  });

  // --- Multiple contributors on same line ---

  it("multiple contributors on the same line are preserved", () => {
    const fn = extractSingle(`function foo(a: boolean, b: boolean) {
  if (a && b) return 1;
  return 0;
}`);
    const onLine2 = fn.contributors.filter((c) => c.line === 2);
    expect(onLine2).toHaveLength(2);
    const kinds = onLine2.map((c) => c.kind).sort();
    expect(kinds).toEqual(["if-branch", "logical-operator"]);
  });

  // --- Source ordering ---

  it("contributors are ordered by source position", () => {
    const fn = extractSingle(`function foo(x: number, arr: number[]) {
  if (x > 0) {
    // lines 3-4 padding
    //
    for (const n of arr) {}
  }
}`);
    expect(fn.contributors).toHaveLength(2);
    expect(fn.contributors[0].line).toBeLessThan(fn.contributors[1].line);
  });

  // --- Column disambiguation ---

  it("contributors include column for disambiguation", () => {
    const fn = extractSingle(`function foo(a: boolean, b: boolean) {
  return a && b;
}`);
    expect(fn.contributors[0].column).toBeGreaterThanOrEqual(0);
  });

  // --- Existing behavior preserved ---

  it("complexity counts are unchanged by contributor collection", () => {
    const fn = extractSingle(`function foo(a: number, b: boolean, c: string) {
  if (a > 0) {
    for (let i = 0; i < a; i++) {
      if (b && c === "x") return i;
    }
  }
  return -1;
}`);
    expect(fn.cyclomaticComplexity).toBe(5);
    expect(fn.contributors).toHaveLength(4);
  });
});
