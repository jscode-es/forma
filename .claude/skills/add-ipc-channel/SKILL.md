---
name: add-ipc-channel
description: Add a new renderer-to-main IPC capability (database access, file access, inference jobs) safely.
---

1. Implement the logic in `electron/` (e.g. a function in `db.ts`). Use prepared statements.
2. Register `ipcMain.handle("<domain>:<action>", ...)` in `electron/main.ts` and validate every argument (type, length, range). Throw on invalid input.
3. Expose a narrow function in `electron/preload.ts` under `window.forma.<domain>`.
4. Add the types to `src/lib/forma.ts` (`FormaApi`).
5. Consume it from a feature in `src/feature/`, guarding for `window.forma` being undefined (plain browser dev).
6. Run the `electron-security-reviewer` agent, then `npm run typecheck && npm run lint && npm run build`.
