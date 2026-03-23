# crap4ts

[![npm version](https://img.shields.io/npm/v/crap4ts)](https://www.npmjs.com/package/crap4ts)
[![CI](https://github.com/breezy-bays-labs/crap4ts/actions/workflows/ci.yml/badge.svg)](https://github.com/breezy-bays-labs/crap4ts/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

CRAP score analyzer for TypeScript — find functions that are too complex and too poorly tested.

Unlike hosted services, crap4ts runs locally and in CI with zero configuration, combining cyclomatic complexity *and* test coverage into a single actionable score.

```
$ npx crap4ts --top 5

 crap4ts v1.0.0 — CRAP Score Analysis

 Function                        CC   Cov%   CRAP   Risk
 ────────────────────────────────────────────────────────
 parseLegacyConfig               12    20%    85.73  High
 resolveImports                   8    45%    18.65  Moderate
 validateSchema                   6    70%     6.97  Acceptable
 transformOutput                  3    85%     3.03  Low
 formatResult                     2   100%     2.0   Low

 Summary: 42 functions | 2 above threshold (16) | worst: 85.73 | FAIL
```

## Install

```bash
npm install --save-dev crap4ts
```

Or run directly with `npx`:

```bash
npx crap4ts
```

**Requirements:** Node.js >= 18, TypeScript >= 5.0 (peer dependency). Works in both ESM and CommonJS projects.

## Quick Start

```bash
# 1. Run your tests with coverage
vitest run --coverage          # or: jest --coverage

# 2. Analyze
npx crap4ts
```

crap4ts reads an existing coverage report, so step 1 must produce coverage JSON before step 2 runs.

crap4ts auto-discovers coverage files (`coverage/coverage-final.json`, `coverage/coverage-v8.json`) and source directories (via `tsconfig.json` or `src/`).

## What is CRAP?

```
CRAP(m) = CC(m)^2 * (1 - cov(m)/100)^3 + CC(m)
```

A function with **high complexity and low coverage** gets a high CRAP score. High complexity but high coverage gets a moderate score. Low complexity gets a low score regardless of coverage.

| CRAP Score | Risk Level |
|:----------:|------------|
| ≤ 5        | Low        |
| 5 < x ≤ 8  | Acceptable |
| 8 < x ≤ 30 | Moderate   |
| > 30       | High       |

## GitHub Action

The action is designed for pull request quality gates: it reads an existing coverage report, comments on the PR, uploads a JSON artifact, and fails the workflow if functions exceed your threshold.

```yaml
name: Quality

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read
  pull-requests: write

jobs:
  crap:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci
      - run: npm run test:coverage

      - uses: breezy-bays-labs/crap4ts@v1
        with:
          threshold: 16
          changed-only: true
          post-comment: true
          upload-artifact: true
```

Notes:

- The action does not generate coverage for you. Run your test command with coverage before invoking it.
- `post-comment` requires `pull-requests: write` permissions.
- `changed-only` uses the PR base SHA when available and falls back to full analysis outside PR workflows.
- Self-hosted runners must provide `git`, `jq`, and `gh` on `PATH`.
- Use `working-directory` for monorepos or nested packages.

| Input | Default | Description |
|-------|---------|-------------|
| `threshold` | `16` | CRAP score threshold |
| `changed-only` | `true` | Only analyze functions changed in PR |
| `post-comment` | `true` | Post/update PR comment with results |
| `upload-artifact` | `true` | Upload JSON report as artifact |
| `coverage-path` | auto | Path to coverage JSON |
| `src` | auto | Source directories (space-separated) |
| `coverage-metric` | auto (`line` in the CLI) | Coverage metric: `line` or `branch` |
| `version` | `latest` | crap4ts version to install via npx |
| `working-directory` | `.` | Directory to run analysis from |

`src` is split on spaces inside the composite action. Paths containing spaces are not currently supported there.

| Output | Description |
|--------|-------------|
| `passed` | Whether all functions passed threshold |
| `total` | Total functions analyzed |
| `exceeding` | Count of functions exceeding threshold |
| `exit-code` | Raw exit code (0=pass, 1=threshold, 2=config, 3=parse) |

If you only want a machine-readable report in CI, set `post-comment: false` and consume `crap4ts-report.json` from the uploaded artifact.

## CLI

```bash
npx crap4ts                           # zero-config analysis
npx crap4ts --top 10                  # 10 worst functions
npx crap4ts --strict                  # threshold 8 (strict mode)
npx crap4ts --lenient                 # threshold 30 (gradual adoption)
npx crap4ts --diff main              # only changed files since main
npx crap4ts -f json -t 12            # JSON output, threshold 12
npx crap4ts --sort complexity --top 5 # top 5 by complexity
npx crap4ts --summary                # one-line summary only
npx crap4ts --breakdown all -f json  # CC contributor breakdown (JSON)
npx crap4ts -q                       # quiet — exit code only
```

Scaffold a config file:

```bash
npx crap4ts init    # creates crap4ts.config.ts with sensible defaults
```

Run `crap4ts --help` for the full option reference.

**Mutual exclusions:** `--strict`, `--lenient`, and `--threshold` cannot be combined. `--quiet` and `--verbose` cannot be combined.

### Exit Codes

| Code | Meaning |
|------|---------|
| 0    | All functions below threshold |
| 1    | One or more functions above threshold |
| 2    | Configuration/input error |
| 3    | Parse error |

### Output Formats

Use `-f` / `--format` to choose output format: `table` (default), `json`, or `markdown`.

The `--breakdown` flag (JSON only) adds per-function cyclomatic complexity contributor maps. Values: `all`, `exceeding` (default when flag is present), or `off`.

## Configuration

```ts
// crap4ts.config.ts
import { defineConfig } from "crap4ts";

export default defineConfig({
  threshold: 12,
  coverageMetric: "line",
  exclude: ["**/*.test.*", "**/*.spec.*"],
  thresholds: {
    "src/domain/**": 8,    // strict for domain layer
    "src/legacy/**": 30,   // lenient for legacy code
  },
});
```

**Config file discovery** (first match wins): `crap4ts.config.ts` > `.js` > `.mjs` > `package.json` `"crap4ts"` field.

**Config priority:** defaults < config file < environment variables < CLI flags.

### All Config Fields

| Field | Type | Description |
|-------|------|-------------|
| `threshold` | `number` | Default CRAP threshold |
| `coverageMetric` | `"line" \| "branch"` | Coverage metric to use |
| `include` | `string[]` | File include globs |
| `exclude` | `string[]` | File exclude globs |
| `thresholds` | `Record<string, number>` | Per-path threshold overrides |
| `format` | `"table" \| "json" \| "markdown"` | Output format |
| `src` | `string \| string[]` | Source directories |
| `breakdown` | `"off" \| "exceeding" \| "all"` | CC contributor breakdown |
| `sort` | `"crap" \| "complexity" \| "coverage" \| "name"` | Sort field |
| `top` | `number` | Show N worst functions |
| `summary` | `boolean` | Show summary line only |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `CRAP4TS_THRESHOLD` | CRAP threshold (number) |
| `CRAP4TS_FORMAT` | Output format: `table`, `json`, `markdown` |
| `CRAP4TS_COVERAGE` | Path to coverage JSON |
| `NO_COLOR` | Disable colors ([no-color.org](https://no-color.org) convention) |

### Coverage Metric

- **`line`** (default) — Uses line coverage percentages.
- **`branch`** — Uses branch coverage. Functions with no branches default to 100% coverage.

## Programmatic API

### Primary API

```ts
import { analyze, RiskLevel } from "crap4ts";

const result = await analyze({
  coverage: "./coverage/coverage-final.json",
  threshold: 12,
});

console.log(result.passed);              // true if all functions pass
console.log(result.summary.crapLoad);    // total excess over threshold
console.log(result.summary.maxCrap);     // worst CRAP score

for (const fn of result.functions) {
  if (fn.scored.crap.riskLevel === RiskLevel.High) {
    console.log(`${fn.scored.identity.qualifiedName}: ${fn.scored.crap.value}`);
  }
}
```

`result.functions` is the canonical scored result set used for `result.summary` and `result.passed`. If a function has complexity but no matching coverage entry, crap4ts includes it there as a worst-case 0% coverage verdict. The lower-level `result.unmatched` field is diagnostic mismatch detail and should not be added on top of the summary totals.

Also available: `analyzeFile()` for single-file analysis, `defineConfig()` for typed configuration, and constants like `PRESETS` and `createThresholdConfig()`.

### Sub-path Exports

For building custom tooling, crap4ts exposes composable primitives:

```ts
// Pure CRAP formula — no I/O, no dependencies
import { computeCrap, classifyRisk } from "crap4ts/formula";
const { value, riskLevel } = computeCrap(12, 45); // CC=12, coverage=45%

// Complexity extraction from source text
import { extractComplexity } from "crap4ts/complexity";
const functions = extractComplexity(sourceCode, "file.ts");

// Coverage parsing — sync (in-memory) or async (from file)
import { parseCoverage, parseCoverageFile } from "crap4ts/coverage";
const result = await parseCoverageFile("./coverage/coverage-final.json");
```

## Upgrading From 0.x

- Functions with complexity but no matching coverage entry are now scored at 0% coverage and included in `result.functions`, `result.summary`, and threshold decisions.
- Treat `result.functions` as the canonical scored result set. `result.unmatched` remains diagnostic mismatch detail and should not be added on top of summary totals.
- GitHub Action users should update `uses: breezy-bays-labs/crap4ts@v0` to `uses: breezy-bays-labs/crap4ts@v1` once the v1 tag is published.

## Coverage Format Support

| Format | Source | Status |
|--------|--------|--------|
| Istanbul JSON | jest, vitest (istanbul), nyc | Supported |
| V8 JSON | vitest (v8), c8 | Supported |
| LCOV | various | Planned |

## FAQ

**I get "0 functions analyzed"** — crap4ts couldn't match coverage data to source files. Check that your coverage path is correct and your source files are under the discovered `src/` directory. Use `--verbose` to see discovery details.

**All functions show 100% coverage** — You may be pointing at the wrong coverage file format. If using vitest with V8 provider, ensure you're using the V8 JSON output, not the Istanbul-format summary.

**CRAP scores seem too high** — The CRAP formula is sensitive to low coverage on complex functions. A function with CC=10 and 50% coverage scores 22.5. The same function at 80% coverage scores 10.8. Focus on improving coverage for your most complex functions first.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development workflow, local quality gates, and PR expectations.

Additional project docs:

- [ARCHITECTURE.md](./ARCHITECTURE.md) for layering and dependency rules
- [CHANGELOG.md](./CHANGELOG.md) for release notes and upgrade history
- [SECURITY.md](./SECURITY.md) for vulnerability reporting
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) for community expectations
- [RELEASING.md](./RELEASING.md) for the publish and tagging checklist

## License

MIT
