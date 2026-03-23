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

1. Bump the package version without creating a tag yet:

   ```bash
   npm version <version> --no-git-tag-version
   ```

2. Update the `CHANGELOG.md` heading from `Unreleased` to the release date, then commit the release metadata:

   ```bash
   git add package.json package-lock.json CHANGELOG.md
   git commit -m "chore: release v<version>"
   ```

3. Create and push the release tag from that commit:

   ```bash
   git tag v<version>
   git push origin main
   git push origin v<version>
   ```

4. Create the GitHub release for that tag. This repository's [`publish.yml`](./.github/workflows/publish.yml) runs on `release.published`, so publishing the GitHub release is what triggers `npm publish`:

   ```bash
   gh release create v<version> --title "v<version>" --notes-file <notes-file>
   ```

5. After the publish workflow succeeds, move or create the floating major Action tag (`v1`) to the same release commit:

   ```bash
   git tag -fa v1 -m "crap4ts v1"
   git push origin refs/tags/v1 --force
   ```

## Post-Release Verification

- Verify the npm package page shows the new version.
- Verify `npx crap4ts@<version> --help` works in a clean shell.
- Verify the GitHub Action resolves from `breezy-bays-labs/crap4ts@v1`.
- Verify the README examples still match the released surface.

## If Something Goes Wrong

- If the published package is broken, stop moving tags until the fix is ready.
- Prefer shipping a patch release over rewriting release history.
- Record the incident and the corrective action in the next changelog entry.
