---
paths:
  - "src/core/**"
---

# Core

When working with core code:

1. **Wiring layer** — core composes adapters through port interfaces. It should contain orchestration logic, not business rules.
2. **Dependency injection** — `analyze()` and `analyzeFile()` accept an `AnalyzeDeps` parameter for testing. Production defaults are lazy-loaded from `defaults.ts`.
3. **No direct adapter imports in analyze** — always go through ports. Direct adapter imports belong only in `defaults.ts`.
4. **Shared helpers** — `extractCoveragePercent` and `flattenCoverages` are exported from `analyze.ts` for reuse by `analyze-file.ts`. `groupBy` comes from `domain/matching.ts`.
5. **Option resolution** — `resolveOptions` binds `options ?? {}` early to avoid repeated optional chaining (reduces CC). Follow this pattern for new option-heavy functions.
6. **Config loading** — `define-config.ts` provides the `defineConfig()` API for `crap4ts.config.ts` files.
