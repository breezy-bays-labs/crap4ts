# CI Integration for crap4ts

**Date**: 2026-03-22
**Status**: Draft
**Scope**: Reusable GitHub Action, PR comments, artifact upload, workflow improvements, default threshold change

## Problem

crap4ts has a functional CLI with threshold enforcement, diff-based filtering, and multiple output formats, but no turnkey CI integration. Users (including ourselves) must manually wire up shell commands in GitHub Actions workflows. There's no PR comment feedback, no artifact persistence, and the dogfooding step in our own CI is a bare `node dist/cli.js --format json` with no threshold enforcement.

## Changes

### 1. Default Threshold: 12 → 16

The current default of 12 is too close to the strict preset (8), making it impractical as a general-purpose default. Adjusting to 16 provides better spacing across the preset scale.

| Preset | Value | Purpose |
|--------|-------|---------|
| strict | 8 | High-discipline codebases |
| **default** | **16** (was 12) | Balanced — catches genuinely risky code |
| lenient | 30 | Gradual adoption in legacy codebases |

**Files to change:**
- `src/domain/threshold.ts`: `PRESETS.default` from 12 → 16
- `src/cli/cli.ts`: init template `threshold: 12` → `threshold: 16`
- Tests referencing the default threshold value of 12
- `.claude/rules/domain.md`: update threshold documentation (currently says "30" which is already stale — the actual code default is 12, changing to 16)

### 2. Reusable GitHub Action

A composite action at the repo root (`action.yml`) that anyone can reference as `uses: breezy-bays-labs/crap4ts@v1`.

#### Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `threshold` | no | `16` | CRAP score threshold (use 30 for lenient adoption) |
| `coverage-path` | no | *(none)* | Path to coverage JSON. When omitted, the CLI's auto-discovery runs (probes `coverage/coverage-final.json`, `.nyc_output/`, etc.) |
| `src` | no | *(none)* | Source directories (space-separated). When omitted, the CLI auto-discovers the source root. |
| `changed-only` | no | `true` | Only analyze functions changed in this PR |
| `post-comment` | no | `true` | Post/update a PR comment with results |
| `upload-artifact` | no | `true` | Upload JSON report as workflow artifact |
| `version` | no | `latest` | crap4ts version to install via npx |
| `working-directory` | no | `.` | Directory to run analysis from |
| `coverage-metric` | no | *(none)* | Coverage metric: `line` or `branch`. When omitted, uses CLI default (`line`) or config file value. |

**Omitted inputs use CLI defaults.** The action only passes flags to the CLI when the user explicitly sets them. This avoids conflicts with `crap4ts.config.ts` values — the CLI's own precedence chain (defaults < config file < env vars < CLI flags) handles merging.

#### Threshold Precedence

The Action's default threshold of `30` (lenient) intentionally diverges from the CLI default of `16`. Rationale: the Action is the adoption entry point for new codebases. A threshold of 16 would fail most existing projects on first run, discouraging adoption. Setting 30 (lenient) lets teams see results before enforcing. Teams tighten the threshold as they improve their codebase.

**Precedence when both Action input and config file exist:** The Action passes `--threshold` as a CLI flag, which takes highest priority in the merge chain. If a user has `threshold: 16` in their `crap4ts.config.ts` and doesn't set `threshold` in the Action, the CLI flag is omitted and the config file value (16) wins. If the user sets `threshold: 30` in the Action, the CLI flag overrides the config file.

#### Outputs

| Output | Description |
|--------|-------------|
| `passed` | `true` or `false` |
| `total` | Total functions analyzed |
| `exceeding` | Count of functions exceeding threshold |
| `exit-code` | Raw exit code (0, 1, 2, 3) |

#### Implementation (Composite Steps)

All `run:` steps use `working-directory: ${{ inputs.working-directory }}`. The action relies on the ambient `GITHUB_TOKEN` (automatically available in GitHub Actions); `gh` uses it for PR comment API calls.

1. **Run JSON analysis** — Build the command dynamically: start with `npx crap4ts@${{ inputs.version }}` and `--format json`, then conditionally append `--threshold`, `--coverage`, `--src`, `--coverage-metric`, and `--changed-since` only when the corresponding inputs are explicitly set. Capture exit code via shell pattern:

   ```bash
   set +e
   $CRAP4TS_CMD > crap4ts-report.json
   echo "exit_code=$?" >> "$GITHUB_OUTPUT"
   set -e
   ```

   Exit codes 2 (config error) and 3 (parse error) skip to step 6 and fail immediately — no comment or artifact is posted for broken configurations.

2. **Parse outputs** — Use `jq` (pre-installed on GitHub-hosted runners) to extract fields from `crap4ts-report.json`:

   ```bash
   echo "passed=$(jq -r '.passed' crap4ts-report.json)" >> "$GITHUB_OUTPUT"
   echo "total=$(jq -r '.summary.totalFunctions' crap4ts-report.json)" >> "$GITHUB_OUTPUT"
   echo "exceeding=$(jq -r '.summary.exceedingThreshold' crap4ts-report.json)" >> "$GITHUB_OUTPUT"
   ```

   Conditional: only runs if step 1 exit code was 0 or 1 (successful analysis).

3. **Run markdown analysis** (conditional: `post-comment: true` AND PR context AND exit code 0 or 1) — Same flags as step 1 but `--format markdown`. Save stdout to `crap4ts-comment.md`.

4. **Upsert PR comment** (conditional: PR context AND `post-comment: true` AND markdown file exists) — Use `gh api` to:
   - List issue comments, find one containing `<!-- crap4ts-report -->`
   - If found: PATCH to update
   - If not found: POST to create

   The comment body wraps the markdown output:
   ```
   <!-- crap4ts-report -->
   {contents of crap4ts-comment.md}

   ---
   *Threshold: {threshold} · {Changed functions only | Full analysis} · [Workflow run]({url})*
   ```

   The footer is appended by the action, not the markdown reporter. The reporter remains a general-purpose formatter.

5. **Upload artifact** (conditional: `upload-artifact: true` AND report file exists) — Uses `actions/upload-artifact@v4` to upload `crap4ts-report.json` as `crap4ts-report` with 30-day retention.

6. **Exit with analysis result** — Reads the captured exit code. If non-zero, fails the step with `exit $exit_code`.

#### Dogfooding: Local Build vs npx

When the action is used via `uses: ./` (self-referencing in our CI), it still runs `npx crap4ts@latest` — which downloads from npm, not the local build. This is wrong for dogfooding.

Solution: add a `local` input (default `false`). When `true`, the action runs `node dist/cli.js` instead of `npx crap4ts@${{ inputs.version }}`. Our CI workflow sets `local: true` after its `npm run build` step.

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `local` | no | `false` | Use local `dist/cli.js` instead of npx. For dogfooding in the crap4ts repo itself. |

#### PR Comment Format

```markdown
<!-- crap4ts-report -->
## crap4ts Report

**Result: FAIL** | 2 of 24 functions above threshold (30)

| CRAP | CC | Cov% | Function | Location |
|-----:|---:|-----:|----------|----------|
| 42.0 | 12 | 45.0% | `parseConfig` | `src/cli/config.ts:34` |
| 31.5 | 8 | 60.0% | `resolveThreshold` | `src/domain/threshold.ts:12` |

<details><summary>Full results (24 functions)</summary>

| CRAP | CC | Cov% | Function | Location |
|-----:|---:|-----:|----------|----------|
...full table...

</details>

---
*Threshold: 30 · Changed functions only · [Workflow run](link)*
```

The marker comment (`<!-- crap4ts-report -->`) is invisible to readers but allows the action to find and update existing comments instead of creating duplicates on each push.

#### Permissions Required

The action needs `pull-requests: write` permission for PR comments. The consumer's workflow must grant this:

```yaml
permissions:
  contents: read
  pull-requests: write
```

The composite action uses the ambient `GITHUB_TOKEN` — `gh` reads it automatically in GitHub Actions. No additional token configuration needed.

#### Changed-Only Behavior

- **PR context** (`pull_request` event): Uses `--changed-since ${{ github.event.pull_request.base.sha }}` to analyze only functions whose source lines overlap with the PR diff.
- **Push context** (or `changed-only: false`): Runs full analysis on all source files.
- The action requires sufficient git history for diff comparison. Consumers should use `fetch-depth: 0` or at minimum fetch the merge base.

### 3. Updated CI Workflow (`ci.yml`)

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read
  pull-requests: write

jobs:
  check:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run test
      - run: npm run build

  crap-analysis:
    runs-on: ubuntu-latest
    needs: check
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run test:coverage
      - run: npm run build
      - name: CRAP Analysis (dogfooding)
        uses: ./
        with:
          local: true
          changed-only: ${{ github.event_name == 'pull_request' }}
          post-comment: ${{ github.event_name == 'pull_request' }}
          upload-artifact: true

  mutation:
    runs-on: ubuntu-latest
    needs: check
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run mutation
```

Key changes from current workflow:
- **`crap-analysis` job** replaces the old `coverage` job (which also runs coverage)
- Uses `./` with `local: true` to dogfood the locally-built CLI
- No explicit `threshold` — uses the CLI default (16) via `crap4ts.config.ts` or the new PRESETS.default
- `fetch-depth: 0` for full git history (needed for `--changed-since`)
- PR-aware: comments on PRs, full analysis on push to main
- `permissions: pull-requests: write` added at workflow level
- **`mutation` depends on `check`**, not `crap-analysis` — mutation testing is independent of CRAP analysis and should run in parallel with it

### 4. Workflow Improvements

- **`fetch-depth: 0`** on the crap-analysis job for reliable diff-based filtering
- **Artifact upload** with 30-day retention (JSON report, ~5-50KB per run)
- **PR comment upsert** prevents comment spam — one comment per PR, updated on each push
- **Parallel jobs** — `mutation` and `crap-analysis` both depend only on `check`, running concurrently

### 5. Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `action.yml` | Create | Reusable composite GitHub Action |
| `.github/workflows/ci.yml` | Modify | Add crap-analysis job, permissions, fetch-depth, parallel mutation |
| `src/domain/threshold.ts` | Modify | Default 12 → 16 |
| `src/cli/cli.ts` | Modify | Init template threshold 12 → 16 |
| Tests (various) | Modify | Update expected default threshold values |
| `.claude/rules/domain.md` | Modify | Fix stale threshold documentation (says 30, should say 16) |

### 6. What This Does NOT Include

- **HTML reporter** — not needed; markdown covers CI/PR use case
- **GitHub Marketplace listing** — the action works via `uses:` without listing; can be added later
- **Badge generation** — could be a follow-up (e.g., "CRAP: PASS" badge)
- **Monorepo support** — `working-directory` input handles basic cases; multi-project monorepo orchestration is out of scope
