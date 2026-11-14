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
