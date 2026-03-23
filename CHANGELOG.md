# Changelog

All notable changes to crap4ts are documented here. This project follows [Semantic Versioning](https://semver.org/).

## [1.0.0] — Unreleased

### Breaking Changes

- **Unmatched functions scored at 0% coverage.** Functions with cyclomatic complexity but no matching coverage entry are now included in results with 0% coverage (worst-case CRAP score). Previously these were silently excluded, which could produce false-green analysis results. They appear in both `result.functions` (as scored verdicts) and `result.unmatched` (as diagnostic detail).

### Upgrade Notes

- JSON/API consumers should treat `result.functions` as the canonical scored result set. `result.summary`, `result.passed`, and threshold outcomes are derived from that set.
- `result.unmatched` remains diagnostic mismatch detail and should not be added on top of summary totals.

### Added

- Path normalization (`src/core/path-utils.ts`) — resolves absolute/relative paths against cwd with symlink canonicalization. Glob metacharacters are detected and routed around `realpathSync.native`.
- CLI decomposition — extracted testable `runtime.ts` from `cli.ts`. `process.exit()` replaced with throwable `CliOptionError`.
- Action hardening — shell commands use bash arrays instead of string concatenation. Input validation for `format` and `threshold`. Markdown exit code captured. Empty output guard.
- Version lookup with injectable `VersionFs` interface and narrow ENOENT-only error catches.
- CI smoke test reads `crap4ts-report.json` via `jq` instead of unreliable action output.
- CHANGELOG.md, SECURITY.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md.
- RELEASING.md with the publish/tag checklist for npm and the floating GitHub Action `v1` tag.
- Comprehensive README rewrite (~260 lines) with full CLI reference, config docs, and FAQ.
- ARCHITECTURE.md for contributors.
- 3 doc drift tests (CLI help snapshot, config schema parity, action.yml parity).
- API surface snapshot test.
- 582 tests total (up from ~400 in 0.3.0).

### Changed

- Error handling narrowed from catch-all to ENOENT-only in `canonicalizePath` and `readPackageVersionFrom`. Permission and parse errors now propagate.
- `npm run test` runs `npm run build` first, eliminating per-test-file `beforeAll` build guards.
- API audit: removed dead `signal` field, deduplicated `spansOverlap`, expanded core re-exports (8 types + 3 values).
- Fixed `computeComplexity` → `extractComplexity` naming in docs and exports.

### Removed

- Dead code identified during API audit (unused signal field, duplicate utility).

## [0.3.0] — 2026-03-22

### Added

- Reusable GitHub Action with PR comment integration, threshold enforcement, and artifact upload.
- Config file support: `crap4ts.config.ts` discovery, Zod schema validation, `defineConfig()`.
- Config fields: `format`, `src`, `breakdown`, `sort`, `top`, `summary`.
- Environment variables: `CRAP4TS_THRESHOLD`, `CRAP4TS_FORMAT`, `CRAP4TS_COVERAGE`, `NO_COLOR`.
- `crap4ts init` subcommand for scaffolding config files.
- Default threshold raised from 12 to 16.

## [0.2.0] — 2026-03-22

### Added

- `--breakdown` flag for per-function cyclomatic complexity contributor maps (JSON output).
- Deferred facade consolidation — factory pattern, API split, sources uniformity.
- `--changed-since` / `--diff` flag for line-level diff filtering.
- `extractComplexity` and `parseCoverage` convenience functions (sub-path exports).
- Branchless function default coverage (100% for `branch` metric).
- Effective threshold display in console reporter when overrides active.

### Fixed

- Empty fall-through `SwitchCase` nodes no longer increment complexity.
- Flattened `AnalysisResult` with accurate byte-to-line coverage conversion.

## [0.1.0] — 2026-03-22

### Added

- Initial implementation: CRAP score analysis for TypeScript.
- Hexagonal architecture (domain → ports → adapters → core → cli).
- Istanbul and V8 JSON coverage format support.
- CLI with table, JSON, and markdown output formats.
- Per-path threshold overrides via config.
- Dual ESM/CJS build via tsup.
