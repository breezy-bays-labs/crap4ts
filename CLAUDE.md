# CLAUDE.md — crap4ts

## Architecture

Hexagonal (ports & adapters) with strict dependency direction:

```
domain/ → ports/ → adapters/ → core/ → cli/
```

- **domain/** — Pure logic (CRAP formula, matching, thresholds). No I/O, no Node APIs.
- **ports/** — Interfaces for complexity, coverage, and reporter capabilities.
- **adapters/** — Implementations of ports (ts-estree complexity, v8 coverage, reporters).
- **core/** — Wiring layer: composes adapters through ports, exposes `analyze()` API.
- **cli/** — Thin shell over core (commander). Config loading, discovery, diff filtering.

## Development Rules

- **TDD** — Write tests before implementation for all domain and adapter code.
- **Domain purity** — `src/domain/` must never import Node APIs or external packages.
- **Dependency direction** — Never import "inward": domain imports nothing, ports use domain types only, adapters implement ports, core wires everything.

## Commands

| Task | Command |
|------|---------|
| Build | `npm run build` (tsup — dual ESM/CJS) |
| Test | `npm run test` (vitest) |
| Coverage | `npm run test:coverage` |
| Typecheck | `npm run typecheck` (tsc --noEmit) |
| Lint | `npm run lint` (eslint) |
| Quick verify | `npm run typecheck && npm run lint && npm run test && npm run build` |

## Commit Convention

Conventional commits with architectural scope:

```
feat(domain):  feat(ports):  feat(adapters):  feat(core):  feat(cli):
fix(domain):   test:         ci:              docs:        chore:
```

## Key Config Files

- `tsup.config.ts` — Build entry points and output format
- `vitest.config.ts` — Test configuration
- `crap4ts.config.ts` — Local dev config (not committed by default)
- `eslint.config.ts` — Flat ESLint config
