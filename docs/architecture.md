# Architecture

```
Renderer (Next.js static export, Kivora UI)
   |  window.forma
Preload (contextBridge -> ipcRenderer)
   |  IPC (namespaced channels, e.g. projects:list)
Main process (ipcMain, SQLite, inference runner - planned)
```

- **Renderer** is sandboxed (`contextIsolation`, no Node). Production loads `out/` through the `app://` protocol; development loads `http://localhost:3000`.
- **IPC** channels are namespaced and validate their input in the main process.
- **SQLite** uses Node's built-in `node:sqlite` (bundled with Electron), so there are no native modules to rebuild. The database lives in the user data directory.
- **Inference (planned)**: generation jobs run in separate worker processes managed by the main process, which stream progress back over IPC. Backends are pluggable per task: text/image-to-3D, rigging, animation, texture painting.

## Security rules

- Validate every IPC argument in `electron/`.
- Never expose `ipcRenderer` or Node APIs directly to the renderer.
- Only open `https://` URLs externally.

## Data and projects

- The database is `forma.db` in the user data directory. Migrations live in `electron/db.ts` and are applied in order, tracked with `PRAGMA user_version`; each runs in a transaction. Never edit a released migration: append a new one.
- Tables: `projects`, `assets` (files of a project, with SHA-256 and size), `variants` (versions of a model, with parent and applied flag), `jobs` and `settings` (key/value, e.g. the last opened project).
- Each project owns a folder `projects/<uuid>/` next to the database. Asset paths are relative to that folder. Deleting a project removes its rows (cascade) and its folder; duplicating copies both.
- IPC contract: `electron/contract.ts` (types only, shared by main, preload and renderer). Every channel is registered with `handle()` from `electron/ipc.ts`, which checks the sender origin and validates arguments with zod schemas from `electron/schemas.ts`.
- Unsaved changes: the renderer reports its dirty state to the main process; closing the window, starting a new project or opening another one asks to save, discard or cancel.
- Tool state lives in Zustand stores, not in components, so switching tools or tabs never discards it.

## 3D viewport

- `src/feature/viewport/engine/viewer.ts` owns one `WebGLRenderer` for the lifetime of the viewport: on-demand rendering (only when the camera moves or the scene changes), ACES tone mapping, studio environment, grid scaled to the model size, and full disposal of geometries, materials and textures when the model changes or the viewport unmounts.
- View modes: Material (original materials), Solid (neutral clay) and Wireframe (clay with edges, back lines hidden).
- Every new project starts with a 1 m default cube. Importing a GLB copies it to a staging folder; saving moves it into `projects/<id>/assets/` and records it in `assets` with its SHA-256. The renderer receives model bytes through `models:read`, never file paths.
- A model that fails to load keeps the previous one on screen and reverts the scene to it.

## Engines and jobs

- Engines are plugins described in [engine-plugins.md](engine-plugins.md): manifest, process protocol (JSON lines on stdout) and guarantees.
- `electron/jobs.ts` runs one job at a time, persists the queue in `jobs`, kills the process tree on cancel, timeout or quit, and marks interrupted jobs on start.
- `electron/hardware.ts` detects GPU, VRAM, driver and CUDA (`nvidia-smi`), free disk and Python.
- The renderer receives job updates through the `jobs:update` event. When a job started from the current session succeeds, its model is staged and placed in the scene.
