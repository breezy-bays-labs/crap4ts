// CC=1: no branches
export function identity(x: number): number {
  return x;
}

// CC=2: one if
export function abs(x: number): number {
  if (x < 0) return -x;
  return x;
}

// CC=3: if + else if
export function classify(x: number): string {
  if (x > 0) return "positive";
  else if (x < 0) return "negative";
  return "zero";
}
