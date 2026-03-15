---
paths:
  - "tests/**"
  - "**/*.test.ts"
  - "**/*.spec.ts"
---

# Testing

When working with tests:

1. **TDD** — write tests before implementation for domain and adapter code. For refactoring, write characterization tests first to lock behavior.
2. **Vitest** — test runner with v8 coverage. Run `npm run test` (all), `npx vitest run <path>` (single file).
3. **Fixtures** — test fixtures live in `tests/fixtures/`. Each fixture is a real TypeScript file that exercises specific AST patterns.
4. **Test helpers** — `analyzeFixture(name)` reads a fixture and extracts complexity. `createDeps()` builds injectable test dependencies.
5. **No mocking adapters in integration tests** — use the real adapter with fixture files. Mock only I/O boundaries (`readFile`, `readJson`, `findFiles`).
6. **Assert behavior, not implementation** — test `qualifiedName` and `cyclomaticComplexity` values, not internal AST traversal details.
7. **Coverage metric** — run `npm run test:coverage` and verify with `node dist/cli.js --coverage coverage/coverage-final.json --src src --threshold 8`.
