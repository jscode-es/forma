# Agent instructions

Forma: Electron + Next.js (static export) + `node:sqlite`. UI library: Kivora (https://www.kivora.pro/docs, agent index at https://www.kivora.pro/llms.txt; skill: `npx skills add kivora-ui/docs --skill kivora-ui`).

- Renderer code in `src/` (`app/` routes, `feature/` modules, `hooks/`, `providers/`, `stores/`, `lib/`), privileged code in `electron/`. The renderer talks to main only through `window.forma` (see `electron/preload.ts`, `src/lib/forma.ts`).
- Validate all IPC input in the main process.
- Use Kivora components for UI; check installed types in `node_modules/@kivora/nextjs/dist/index.d.ts`.
- Before finishing: `npm run typecheck && npm run lint && npm run build`.
- Conventional Commits, in English.

## Shared resources

- Procedures: `.claude/skills/*/SKILL.md` (`kivora-ui`, `add-ipc-channel`, `new-feature`). Read the matching one before starting.
- Reviewers: `.claude/agents/electron-security-reviewer.md` describes the checklist for any change in `electron/`.
- Background: `.claude/reference/` (`kivora.md`, `domain.md`).
