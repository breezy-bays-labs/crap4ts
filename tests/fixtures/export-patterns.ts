// tests/fixtures/export-patterns.ts

// export named function
export function greet(name: string): string {
  return `Hello, ${name}`;
}

// variable declaration with arrow function
export const double = (n: number): number => n * 2;

// variable declaration with function expression
export const triple = function (n: number): number {
  return n * 3;
};

// non-function variable (should not be extracted)
export const PI = 3.14159;
