# Branches, commits and releases

## Branches

- `main`: production. Only receives merges from `dev` (and hotfixes). Every push runs the release workflow.
- `dev`: development. Feature and fix branches (`feat/...`, `fix/...`) open PRs against `dev`.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), validated locally by commitlint (husky `commit-msg` hook) and on PRs by checking the PR title.

| Type | Effect on version |
| --- | --- |
| `feat` | minor |
| `fix`, `perf` | patch |
| `feat!` / `BREAKING CHANGE:` footer | major (minor while < 1.0.0) |
| `docs`, `chore`, `ci`, `build`, `refactor`, `test`, `style` | no release |

Merge strategy: **squash** feature PRs into `dev` (PR title becomes the commit), **merge commit** for `dev` -> `main`, so every conventional commit reaches the changelog.

## Release flow

1. Merge `dev` into `main` via PR.
2. `release-please` opens (or updates) a "chore(main): release x.y.z" PR with the version bump in `package.json` and the generated `CHANGELOG.md`.
3. Merging that PR creates the `vX.Y.Z` tag and GitHub release.
4. The same workflow builds installers on Windows, macOS and Linux with electron-builder and attaches them to the release:
   - Windows: NSIS `.exe`
   - macOS: `.dmg`, `.zip`
   - Linux: `.AppImage`, `.deb`
5. Merge `main` back into `dev` so `dev` has the new version and changelog.

## Local packaging

```bash
npm run dist          # installers for the current OS in release/
```

## Not configured yet

- Code signing and notarization (macOS builds are unsigned; Windows builds are not signed). Add the certificates as repository secrets and remove `identity: null` from `electron-builder.yml`.
- App icons: place `icon.ico`, `icon.icns` and `icon.png` (512x512+) in `build/`.
- Auto-update.
