# Contributing to crap4ts

Thanks for your interest in contributing to crap4ts. This guide covers the
development workflow, quality gates, and the public-surface checks that matter
most before changes merge.

## Getting Started

```bash
git clone https://github.com/breezy-bays-labs/crap4ts.git
cd crap4ts
npm install
npm run build
npm test
```

Requirements: Node.js >= 18, TypeScript >= 5.0.

## Before You Start

- Read [ARCHITECTURE.md](./ARCHITECTURE.md) before changing layer boundaries or exports.
- Read [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) before participating in issues, reviews, or discussions.
- Use [SECURITY.md](./SECURITY.md) for vulnerability reports. Do not open public issues for security problems.

## Architecture

crap4ts uses hexagonal (ports & adapters) architecture with strict dependency direction:

```
domain/ → ports/ → adapters/ → core/ → cli/
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full details. The key rule: **inner layers never import from outer layers.**

## Development Workflow

1. Create a branch from `main`.
2. Add or update tests with the code change. Domain and adapter work should stay TDD-friendly and deterministic.
3. Update user-facing docs when behavior, flags, outputs, config fields, or Action behavior changes.
4. Update [CHANGELOG.md](./CHANGELOG.md) for release-visible changes.
5. Run the local quality gates before opening a PR.

## Local Quality Gates

Run these before asking for review:

```bash
npm run typecheck
npm run lint
npm test
npm run mutation
npm pack --dry-run
```

Notes:

- `npm test` builds `dist/` first because several CLI-facing tests execute the built bundle.
- `npm run mutation` is slower and intended as a release-grade confidence check, not a tight feedback loop.
- `npm pack --dry-run` catches packaging mistakes before publish.

## Public Surface Changes

If your change touches any of these, update docs and tests in the same PR:

- CLI flags or help text
- `action.yml` inputs or outputs
- Config file fields or defaults
- JSON output or programmatic API semantics
- README examples or release notes

The repo includes doc-drift tests for the CLI help output, config schema, and Action input/output tables. Treat those as contract tests, not incidental snapshots.

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/) with architectural scope:

```
feat(domain):    # new domain logic
feat(adapters):  # new adapter implementation
fix(core):       # bug fix in wiring layer
test:            # test additions/changes
docs:            # documentation only
chore:           # maintenance, dependencies
```

## Code Style

- ESLint and Prettier handle formatting. Run `npm run lint` to check.
- Domain code (`src/domain/`) must be pure: no I/O, no Node APIs, no external packages
- Adapters must implement port interfaces exactly

## Tests

```bash
npm test                    # all tests (builds first)
npm run test:watch          # watch mode
npm run test:coverage       # with coverage report
npm run mutation            # mutation testing (Stryker)
```

The test suite covers domain logic, adapters, CLI behavior, and doc-drift checks for the public surface.

## Release Process

See [RELEASING.md](./RELEASING.md) for the publish, tag, and GitHub Action release checklist.

## Questions?

Open an issue or start a discussion on GitHub for feature work, bugs, and usage questions.
