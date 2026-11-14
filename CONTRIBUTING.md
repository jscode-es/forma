# Contributing to Forma

## Setup

See [Getting started](README.md#getting-started). Before opening a PR run:

```bash
npm run typecheck && npm run lint && npm run build
```

## Workflow

1. Open an issue (or comment on one) before starting large changes.
2. Fork, create a branch from `main`: `feat/...`, `fix/...`, `docs/...`.
3. Keep PRs focused and small. Describe what changed and why.
4. CI must pass.

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
src/app/    Next.js renderer (Kivora UI)
src/lib/    shared types and helpers
docs/       architecture and roadmap
```

## Licensing

By contributing you agree your work is released under the [MIT license](LICENSE). Only submit code and assets you have the right to share. Respect the licenses of any AI model you integrate and document them.
