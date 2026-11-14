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

## Signing

The release workflow signs automatically when these repository secrets exist; without them it builds unsigned installers.

| Secret | Use |
| --- | --- |
| `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` | Windows code signing certificate (base64 `.pfx` or HTTPS link) and its password |
| `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD` | Apple Developer ID Application certificate (base64 `.p12`) and its password |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | macOS notarization |

macOS builds use the hardened runtime, required for notarization.

## Release checklist

1. All phase issues of the milestone are closed and `dev` is green (CI: check and e2e).
2. Run locally: `npm run fixtures && npm run build && npm run test:e2e`.
3. Package on your OS (`npm run dist`) and run the e2e suite against it: `FORMA_E2E_EXECUTABLE=<path to the packaged executable> npm run test:e2e`.
4. Smoke test an AI engine on a machine with a GPU: activate it, generate from an image, apply, export.
5. Update `docs/manual.md` and `docs/manual.es.md` if the UI changed.
6. Open the PR `dev` → `main` (merge commit). After merging, review the release-please PR: version and CHANGELOG.
7. Merge the release PR; the workflow builds and attaches the installers. Download each one and check it starts.
8. Merge `main` back into `dev`.

## Not configured yet

- Certificates: no signing secrets are configured, so current installers are unsigned.
- Auto-update.
