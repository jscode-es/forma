# Contributing to Forma

## Setup

See [Run from source](README.md#run-from-source). Before opening a PR run:

```bash
npm run typecheck && npm run lint && npm run build
npm run fixtures && npm run test:e2e
```

The end-to-end suite (Playwright) launches the built app with an isolated data folder (`FORMA_USER_DATA`), drives it like a user with the demo engine, checks accessibility with axe and records a performance baseline in `test-results/performance.json`. Set `FORMA_E2E_EXECUTABLE` to run it against a packaged app.

## Test models

`npm run fixtures` downloads CC0 sample models (Avocado, ToyCar) into `fixtures/models/`, pinned and verified by SHA-256. See [fixtures/README.md](fixtures/README.md).

## Engines

To integrate an AI model, write an engine plugin: follow the [plugin guide](docs/plugin-guide.md) (`npm run plugin:new`, `npm run plugin:check`) and the [reference](docs/engine-plugins.md). Use the built-in `forma-demo` engine to test the job pipeline without a GPU.

## Workflow

1. Pick an item from the current phase in [docs/phases.md](docs/phases.md), or open an issue before starting large changes. See [docs/releasing.md](docs/releasing.md) for the branch model.
2. Fork, create a branch from `dev`: `feat/...`, `fix/...`, `docs/...`.
3. Keep PRs focused and small. Describe what changed and why.
4. Open the PR against `dev`. The PR title must be a Conventional Commit. CI must pass.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/): `feat(ui): add project list`, `fix(db): ...`. Subject under 72 characters.

## Code guidelines

- TypeScript strict. No `any` without a reason.
- UI uses [Kivora](https://www.kivora.pro/docs) components; avoid adding another UI library.
- The renderer never touches Node or the filesystem. All privileged work lives in `electron/` and is exposed through `preload.ts` with validated IPC arguments.
- Comment only when the reason is not obvious from the code.
- Never commit model weights, `.env` files or databases.

## Project layout

```
electron/   main process, preload, SQLite
src/app/       Next.js routes and layout
src/feature/   feature modules (UI, logic and types per feature)
src/hooks/     shared React hooks
src/providers/ React context providers (Kivora, etc.)
src/stores/    Zustand stores (settings: language and theme)
src/lib/       shared types, helpers and i18n (locales)
docs/       architecture and roadmap
```

## Licensing

By contributing you agree your work is released under the [MIT license](LICENSE). Only submit code and assets you have the right to share. Respect the licenses of any AI model you integrate and document them.

## Translations and settings

- Every user-facing string goes through `react-i18next`: `const { t } = useTranslation(); t("projects.create")`. Never hardcode UI text.
- Locale files live in `src/lib/i18n/locales/` (`en.json` is the source of truth and defines the key types; `es.json` must have the same keys).
- To add a language: create `<code>.json` with the same keys, then register it in `src/lib/i18n/index.ts` (`LOCALES`, `LOCALE_NAMES`, `resources`).
- The language is detected from the OS/browser (`navigator.languages`), falling back to English. The user can override it, and theme (system/light/dark), in the settings toggles; both persist in `localStorage` via the Zustand store in `src/stores/settings-store.ts`.
