# crap4ts

CRAP (Change Risk Anti-Patterns) score analyzer for TypeScript.
Find functions that are too complex and too poorly tested.

## Quick Start

```bash
# Run your tests with coverage first
vitest run --coverage

# Then analyze
npx crap4ts
```

## What is CRAP?

```
CRAP(m) = CC(m)^2 * (1 - cov(m)/100)^3 + CC(m)
```

A function with **high complexity and low coverage** gets a high CRAP score.
High complexity but high coverage gets a moderate score.
Low complexity gets a low score regardless of coverage.

| CRAP Score | Risk Level |
|:----------:|------------|
| ≤ 5        | Low        |
| 5 < x ≤ 8  | Acceptable |
| 8 < x ≤ 30 | Moderate   |
| > 30       | High       |

## CLI

```bash
npx crap4ts                      # zero-config analysis
npx crap4ts --top 10             # 10 worst functions
npx crap4ts --strict             # threshold 8 (Uncle Bob mode)
npx crap4ts --diff main          # only changed files
npx crap4ts -f json -t 12        # JSON output, threshold 12
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0    | All functions below threshold |
| 1    | One or more functions above threshold |
| 2    | Configuration/input error |
| 3    | Parse error |

## Programmatic API

```ts
import { analyze } from "crap4ts";

const result = await analyze({
  coverage: "./coverage/coverage-final.json",
  threshold: 12,
});

console.log(result.passed); // true if all functions pass
console.log(result.summary.crapLoad); // total excess over threshold
```

### Composable Primitives

```ts
import { computeCrap, classifyRisk } from "crap4ts/formula";
import { computeComplexity } from "crap4ts/complexity";
import { parseCoverage } from "crap4ts/coverage";
```

## Configuration

```ts
// crap4ts.config.ts
import { defineConfig } from "crap4ts";

export default defineConfig({
  threshold: 12,
  coverageMetric: "line",
  thresholds: {
    "src/domain/**": 8,
    "src/legacy/**": 30,
  },
});
```

## Coverage Format Support

| Format | Source | Status |
|--------|--------|--------|
| Istanbul JSON | jest, vitest (istanbul), nyc | Supported |
| V8 JSON | vitest (v8), c8 | Supported |
| LCOV | various | Planned |

## License

MIT
