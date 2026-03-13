// CC=4: switch with 3 cases
export function dayType(day: string): string {
  switch (day) {
    case "mon": return "weekday";
    case "sat": return "weekend";
    case "sun": return "weekend";
    default: return "weekday";
  }
}

// CC=4: logical operators
export function validate(x: number | null): boolean {
  return x !== null && x > 0 && x < 100 || x === -1;
}

// CC=3: loop + condition
export function sumPositive(nums: number[]): number {
  let sum = 0;
  for (const n of nums) {
    if (n > 0) sum += n;
  }
  return sum;
}

// CC=3: optional chaining + nullish coalescing
export function getName(user?: { name?: string }): string {
  return user?.name ?? "anonymous";
}

// CC=2: ternary
export function sign(x: number): string {
  return x >= 0 ? "positive" : "negative";
}

// CC=2: while loop
export function countDown(n: number): number {
  let count = 0;
  while (n > 0) { n--; count++; }
  return count;
}

// CC=2: do-while loop
export function atLeastOnce(n: number): number {
  let count = 0;
  do { count++; n--; } while (n > 0);
  return count;
}

// CC=2: classic for loop
export function range(n: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < n; i++) result.push(i);
  return result;
}

// CC=2: for-in loop
export function keyCount(obj: Record<string, unknown>): number {
  let count = 0;
  for (const _k in obj) count++;
  return count;
}

// CC=2: try-catch
export function safeParse(json: string): unknown {
  try { return JSON.parse(json); }
  catch (_e) { return null; }
}
