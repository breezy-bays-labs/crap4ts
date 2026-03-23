# Releasing crap4ts

This checklist is for shipping a public release of crap4ts to npm and GitHub.

## Before the Version Bump

- Confirm the branch is clean and all intended PRs are merged.
- Review [CHANGELOG.md](./CHANGELOG.md) and make sure the unreleased section is accurate.
- Confirm the README examples, `action.yml`, CLI help output, and public API docs still agree.

## Quality Gates

Run the release checks locally:

```bash
npm run typecheck
npm run lint
npm test
npm run mutation
npm pack --dry-run
```

Recommended smoke checks:

```bash
node dist/cli.js --help
node dist/cli.js --summary
```

## Publish Steps

1. Bump `package.json` from the current prerelease version to the release version.
2. Update the `CHANGELOG.md` heading from `Unreleased` to the release date.
3. Commit the release version and changelog.
4. Publish to npm.
5. Tag the release commit as `vX.Y.Z` and push the tag.
6. Move or create the floating major Action tag (`v1`) to the same release commit.
7. Create the GitHub release using the changelog entry as the release notes.

## Post-Release Verification

- Verify the npm package page shows the new version.
- Verify `npx crap4ts@<version> --help` works in a clean shell.
- Verify the GitHub Action resolves from `breezy-bays-labs/crap4ts@v1`.
- Verify the README examples still match the released surface.

## If Something Goes Wrong

- If the published package is broken, stop moving tags until the fix is ready.
- Prefer shipping a patch release over rewriting release history.
- Record the incident and the corrective action in the next changelog entry.
