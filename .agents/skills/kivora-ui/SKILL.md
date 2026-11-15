---
name: kivora-ui
description: Build or modify Forma UI with Kivora components. Use for any change under src/ that renders interface.
---

1. Components come from `@kivora/nextjs`. List what is available in `node_modules/@kivora/nextjs/dist/index.d.ts`; check prop types there before using a component.
2. Docs: https://www.kivora.pro/docs (index for agents: https://www.kivora.pro/llms.txt, full: https://www.kivora.pro/llms-full.txt). Optional official skill: `npx skills add kivora-ui/docs --skill kivora-ui`.
3. Styles are imported once in `src/app/globals.css`; the provider lives in `src/providers/kivora-provider.tsx`. Do not import both `styles.css` and `tailwind.css`.
4. Use `"use client"` only in components with state, events or browser APIs.
5. Do not add another UI library.
