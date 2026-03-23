# Architecture

crap4ts uses hexagonal (ports & adapters) architecture with strict dependency direction:

```
domain/ → ports/ → adapters/ → core/ → cli/
```

## Layers

### domain/

Pure logic — CRAP formula, matching, thresholds, risk classification. No I/O, no Node APIs, no external packages. All shared type definitions live in `domain/types.ts`.

### ports/

Interfaces for complexity extraction, coverage parsing, and reporter capabilities. Ports depend only on domain types.

### adapters/

Implementations of port interfaces:

- **Complexity** — Uses `@typescript-eslint/typescript-estree` for AST-based cyclomatic complexity extraction.
- **Coverage** — Parses Istanbul and V8 JSON coverage formats with auto-detection.
- **Reporters** — Console (table), JSON, and Markdown output formatters.

### core/

Wiring layer that composes adapters through ports. Exposes the public `analyze()` API. Contains `createDefaultDeps()` for production adapter wiring and `defineConfig()` for typed configuration.

### cli/

Thin shell over core using Commander. Handles argument parsing, config file loading, coverage auto-discovery, and diff filtering. No business logic.

## Rules

- **Dependency direction**: Inner layers never import from outer layers. Domain imports nothing; ports use domain types only; adapters implement ports; core wires everything.
- **Domain purity**: `src/domain/` must never import Node APIs or external packages.
- **Port contracts**: Adapters must implement port interfaces exactly — no extra public methods.

## Sub-path Exports

| Import path | Entry point | Purpose |
|-------------|-------------|---------|
| `crap4ts` | `src/core/index.ts` | Main API: `analyze()`, `analyzeFile()`, types |
| `crap4ts/formula` | `src/domain/crap.ts` | Pure CRAP formula |
| `crap4ts/complexity` | `src/adapters/complexity/facade.ts` | Complexity extraction |
| `crap4ts/coverage` | `src/adapters/coverage/facade.ts` | Coverage parsing |

## Build

Dual ESM/CJS output via tsup. Target: Node 18.
