---
paths:
  - "src/adapters/**"
---

# Adapters

When working with adapter code:

1. **Implements ports** — every adapter must implement a port interface from `src/ports/`. Never add public methods beyond the port contract.
2. **Complexity adapter** — uses `@typescript-eslint/typescript-estree` to parse ASTs. Cyclomatic complexity counts: `IfStatement`, `ConditionalExpression`, `For*Statement`, `While*Statement`, `DoWhileStatement`, `CatchClause`, `LogicalExpression` (`&&`, `||`, `??`), `ChainExpression` (`?.`), and non-default `SwitchCase`.
3. **Coverage adapter** — parses V8 and Istanbul/NYC JSON formats. Detects format automatically via `detect.ts`.
4. **Keep CC low** — adapter methods tend toward high CC from AST traversal. Extract helper methods aggressively. Use `Set.has()` over `||` chains for type checks.
5. **Reporter adapters** — implement `ReporterPort`. Available formats: text (default), JSON, markdown. Reporters must not import from domain or core.
6. **Span conventions** — AST `loc.end.line` is inclusive; convert to exclusive (`+1`) when creating `SourceSpan` objects.
