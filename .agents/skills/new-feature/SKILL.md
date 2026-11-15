---
name: new-feature
description: Scaffold a new feature module in src/feature following Forma's conventions.
---

Create `src/feature/<name>/` containing only what is needed:

- `components/` UI built with Kivora
- `hooks/` feature-local hooks (shared hooks go in `src/hooks/`)
- `store.ts` if the feature needs client state (shared stores go in `src/stores/`)
- `types.ts` feature types
- `index.ts` public exports; other code imports from the index only

Routes stay thin in `src/app/` and only compose feature components. If the feature needs main-process capabilities, use the `add-ipc-channel` skill.
