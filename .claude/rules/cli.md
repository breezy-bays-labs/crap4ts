---
paths:
  - "src/cli/**"
---

# CLI

When working with CLI code:

1. **Thin shell** — the CLI is a thin wrapper over `core/analyze`. Business logic belongs in core or domain, not here.
2. **Commander** — uses `commander` for argument parsing. Flags map to `AnalyzeOptions`.
3. **Config discovery** — `config.ts` handles `crap4ts.config.ts` loading and merging with CLI flags. CLI flags take precedence.
4. **Diff filtering** — `diff.ts` implements `--since` / `--diff` for analyzing only changed files. This filters the file list before passing to `analyze()`.
5. **Environment variables** — `CRAP4TS_FORMAT`, `CRAP4TS_THRESHOLD`, `NO_COLOR` are supported. CLI flags override env vars.
6. **Exit codes** — exit 0 when all functions pass threshold, exit 1 when any exceed it. Never exit non-zero for warnings.
