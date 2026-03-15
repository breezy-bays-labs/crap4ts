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

## Rule Maintenance

Scoped rules live in `.claude/rules/` and load on-demand when matching files are touched.

- When you discover a new pattern, convention, or risk specific to a layer (domain, adapters, core, cli, tests), update the relevant rule file.
- When a rule becomes stale or contradicts current code, update or remove it.
- Keep rules actionable and concise — each point should prevent a concrete mistake.

## Compact Instructions

During context compaction, preserve:

- Architecture layer and dependency direction constraints
- Current task context, plan progress, and blocking issues
- File paths and line numbers actively being worked on
- Test results and CRAP scores from the most recent verification run
- Any user feedback or corrections given during the session

During context compaction, discard:

- Full file contents already committed (re-read from disk if needed)
- Intermediate failed attempts that were superseded by working solutions
- Verbose tool output that has already been summarized
- Completed and merged PR details (check git log if needed)
