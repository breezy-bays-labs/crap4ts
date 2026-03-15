---
paths:
  - "src/domain/**"
---

# Domain

When working with domain code:

1. **Purity** — no I/O, no Node APIs, no external packages. Domain code is pure logic only.
2. **No inward imports** — domain imports nothing from ports, adapters, core, or cli.
3. **Immutability** — prefer `ReadonlyArray` and `Readonly<T>` for function parameters. Never mutate inputs — copy before sorting or modifying.
4. **Types live here** — all shared type definitions (`FunctionComplexity`, `CrapScore`, `SourceSpan`, etc.) are defined in `domain/types.ts`.
5. **CRAP formula** — `CC^2 * (1 - coverage)^3 + CC`. Changes to the formula must update both `crap.ts` and its tests.
6. **Half-open spans** — `SourceSpan` uses exclusive `endLine`. All span arithmetic must respect this convention.
7. **Threshold config** — `threshold.ts` supports glob-based per-path overrides. Default threshold is 30, `--strict` is 8.
