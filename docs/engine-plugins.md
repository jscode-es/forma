# Engine plugins

Forma runs every AI model as an **engine**: a folder with a manifest and an entry script. Forma never bundles third-party models or weights; users install engines themselves.

## Where engines live

- Built-in: `engines/` in the repository (only the `forma-demo` test engine).
- User: `<data folder>/engines/<engine-folder>/` (Settings → Data folder). Each folder is read at startup and when the engine list refreshes.

## Manifest: `forma-engine.json`

```json
{
  "id": "my-engine",
  "name": "My engine",
  "version": "1.0.0",
  "license": "Apache-2.0",
  "description": { "en": "What it does", "es": "Qué hace" },
  "tasks": ["image-to-3d"],
  "runtime": { "type": "python", "entry": "main.py" },
  "timeoutSeconds": 1800,
  "requirements": { "vramGb": 8, "cuda": true },
  "parameters": [
    { "id": "steps", "type": "integer", "label": { "en": "Steps", "es": "Pasos" }, "min": 1, "max": 100, "default": 30 },
    { "id": "texture", "type": "boolean", "label": { "en": "Texture" }, "default": true },
    { "id": "mode", "type": "enum", "label": { "en": "Mode" }, "default": "fast",
      "options": [{ "value": "fast", "label": { "en": "Fast" } }, { "value": "best", "label": { "en": "Best" } }] }
  ]
}
```

- `id`: lowercase letters, digits and dashes. `tasks`: `image-to-3d`, `text-to-3d`, `texture`, `rig`, `animation`.
- `runtime.type`: `python` uses `<engine>/.venv` if present, otherwise the Python found on the system (`FORMA_PYTHON` overrides it). `node` runs with Electron's bundled Node.js.
- Parameters are rendered automatically in the inspector and validated (type, range, options) before a job starts. Unknown values are dropped.
- An engine is marked unavailable when its entry file is missing, Python is missing, CUDA is required but not present, or the GPU has less VRAM than `requirements.vramGb`.

## Process protocol

Forma starts one process per job: `<runtime> <entry> --job <job.json>`, with the engine folder as working directory.

`job.json`:

```json
{ "jobId": "uuid", "task": "image-to-3d", "parameters": { "steps": 30 }, "outputDir": "<jobs>/<uuid>/out" }
```

The engine writes **one JSON object per line** to stdout. Anything else on stdout or stderr goes to the job log.

| Message | Meaning |
| --- | --- |
| `{"type":"progress","value":0.4,"stage":"sampling"}` | Progress from 0 to 1, optional stage name |
| `{"type":"log","level":"info","message":"..."}` | Log line (`debug`, `info`, `warn`, `error`) |
| `{"type":"intermediate","path":"views.png","label":"Views","kind":"image"}` | File inside `outputDir` worth inspecting |
| `{"type":"result","files":[{"path":"model.glb","label":"Model","kind":"model"}]}` | Final files; a `model` file must be a GLB |
| `{"type":"error","message":"..."}` | Failure reason shown to the user |

A job succeeds only if the process exits with code 0 after sending `result`. Paths must stay inside `outputDir`.

## Lifecycle and guarantees

- One job runs at a time (one GPU). The queue is stored in SQLite and survives restarts; a job that was running when the app closed is marked as interrupted.
- Cancel and timeout kill the whole process tree. Closing Forma kills the running job. Exiting the process frees the GPU.
- Network: the process receives `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1` and proxy variables pointing to a closed local port, so well-behaved libraries cannot download anything. This is a best-effort guard, not an OS sandbox: engines must not download at run time; prepare weights during installation.
- Logs are stored in `<data folder>/jobs/<id>/job.log` and shown in the Process tab.

See `engines/demo/` for a complete engine without dependencies.
