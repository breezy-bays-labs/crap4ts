// tests/fixtures/class-functions.ts

export class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  safeDivide(a: number, b: number): number {
    if (b === 0) {
      return 0;
    }
    return a / b;
  }
}

export class EventProcessor {
  handler = (event: string): string => {
    if (event === "click") return "clicked";
    if (event === "hover") return "hovered";
    return "unknown";
  };

  process = function (data: unknown): boolean {
    return data !== null;
  };
}
