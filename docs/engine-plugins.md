# Engine plugins

Reference for manifests, weights and the process protocol. To write a new plugin, start with the [plugin guide](plugin-guide.md).

Forma runs every AI model as an **engine**: a folder with a manifest and an entry script. Forma never bundles third-party models or weights; users install engines themselves.

## Where engines live

- Built-in: `engines/` in the repository, including the demo, optimization and Blender mesh engines.
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

- `id`: lowercase letters, digits and dashes. `tasks`: `image-to-3d`, `text-to-3d`, `text-to-image`, `remove-background`, `optimize`, `texture`, `mesh-inspect`, `retopology`, `uv-unwrap`, `normals`, `ambient-occlusion`, `export-package`, `text-to-motion`, `rig`, `animation`, `video-to-motion`.
- `inputs.images` and `inputs.models`: `{ "min": 1, "max": 1 }` declare how many reference images or GLB models the engine needs. Forma rejects a job outside that range and copies the images into the job folder before it starts.
- `inputs.videos` uses the same min/max shape with a maximum of one. Videos originate from the native MP4/MOV/WebM picker, are staged under opaque UUIDs, checked for size and container signature, copied into the job input folder and preserved on retry. Workers receive absolute local paths in `inputs.videos`; no renderer-selected filesystem path is accepted. `video-to-motion` returns a bounded portable version-1 JSON clip as kind `animation-clip`, optionally a `motion-report`. The UI validates and adds it to the independent library before opening an editable draft on the exact source rig.
- `inputs.views`: optional array of supported names (`front`, `back`, `left`, `right`, `top`). With no names, the renderer passes a single primary reference. With names, the renderer selects references in manifest order and sends parallel `inputs.images` and `inputs.views` arrays. Main rejects mismatched counts, duplicates and unsupported names. Retries preserve assignments. The Hunyuan3D 2 MV plugin accepts the four side views, not Top.
- `runtime.type`: `python` uses `<engine>/.venv` if present, then the absolute path in `<engine>/python.json` (`{ "python": "..." }`, written by the installer with `--python`), otherwise the Python found on the system (`FORMA_PYTHON` overrides it). `node` runs with Electron's bundled Node.js and can `require` Forma's own dependencies (`NODE_PATH` points to the app's `node_modules`).
- Parameters are rendered automatically in the inspector and validated (type, range, options) before a job starts. Unknown values are dropped. An optional `tasks` array on a parameter limits the inspector controls where it appears (an engine with several tasks can keep `count` for `text-to-image` and `steps` for `image-to-3d`).
- `network: true` lets the engine reach the network (the offline guard is skipped) and is shown to the user; only the built-in text-to-motion engine uses it, to call the user's own CLI.
- An engine is marked unavailable when its entry file is missing, Python is missing, CUDA is required but not present, or the GPU has less VRAM than `requirements.vramGb`.

## Blender runtime

The `blender` runtime uses an installed Blender 4+ executable, discovered from saved configuration, `FORMA_BLENDER`, standard install directories or PATH. **Configure Blender** validates a native executable selection and saves it. Jobs run with `--background --factory-startup --disable-autoexec --python <entry> -- --job <spec>` without a shell or startup files. Missing Blender marks the engine unavailable. This runtime uses Blender's Python and needs no virtual environment.

The built-in `forma-blender-mesh` engine accepts one GLB, or target then detailed source for normal baking. `mesh-inspect` returns `report.json` with kind `mesh-report`; modifying tasks also return `model.glb`. Reports contain version 1, task, source/result topology counts, warnings and operation details. UV unwrap additionally returns `uv-template.png` with kind `uv-template`. Only that exact successful job result can be exported through the dedicated native PNG save dialog; containment, PNG dimensions and the copied checksum are verified. See [mesh engine evidence](superpowers/evidence/phase12-blender-mesh.md) for supported inputs and measured behavior.

The built-in `forma-blender-rig` engine implements task `rig` with one GLB. `mode` is `auto` or `edit`; `clipPolicy` is explicitly `preserve` or `discard`. Auto uses 19 bounded XYZ body landmarks and Blender heat weights. Edit selects `boneIndex` in the source `skins[0].joints` order and offsets its rest position by fractions of model height. Results are `model.glb` and a version-1 `rig-report.json` (`rig-report`) recording bone/weighted/unweighted counts, clip names, policy and warnings. Existing incompatible rigs require explicit discard to replace; editing preserves original mesh/weight/clip payloads and updates joint transforms and inverse bind matrices. Original weights are validated before Blender can repair them. Editing currently requires identity skinned-mesh/nonjoint ancestor world transforms and a matching rest/bind pose. See [rig engine evidence](superpowers/evidence/phase14-rig.md).

## Weights

Engines declare the files they need in `weights`. Forma downloads them on request into `<data folder>/models/<id>/<revision>/`, never during a job.

```json
"weights": [
  {
    "id": "my-engine-dit",
    "name": "Shape model",
    "optional": false,
    "license": {
      "id": "Apache-2.0",
      "name": "Apache License 2.0",
      "url": "https://www.apache.org/licenses/LICENSE-2.0",
      "summary": { "en": "Permissive license.", "es": "Licencia permisiva." }
    },
    "source": { "type": "huggingface", "repo": "org/model", "revision": "<40-character commit>" },
    "files": [{ "path": "dit/model.safetensors", "size": 123456, "sha256": "<64 hex characters>" }]
  }
]
```

- `source.type`: `huggingface` (`https://huggingface.co/<repo>/resolve/<revision>/<path>`) or `github` (raw files). The revision must be a full commit hash so downloads are reproducible.
- Every file is checked against its size and SHA-256. Downloads resume from `.part` files and only follow redirects to Hugging Face and GitHub hosts.
- The user must accept the license of each revision before the first download; the acceptance is stored locally.
- An engine with missing required (non-optional) weights is unavailable. Installed weights reach the engine in `job.json` as `"weights": { "<id>": "<folder>" }`.
- "Check for updates" only reports newer upstream revisions. Changing the pinned revision is a manifest change reviewed in a pull request.
- The fixed `mediapipe` source is restricted to `pose_landmarker/pose_landmarker_lite`, version `1`, under the official `storage.googleapis.com/mediapipe-models/` URL. Redirects are refused, file size and SHA-256 are pinned, and no automatic update revision is inferred. The normal license, receipt, download and verification flow is retained. See [local motion plugin](../plugins/mediapipe-motion/README.md).

## Process protocol

Forma starts one process per job: `<runtime> <entry> --job <job.json>`, with the engine folder as working directory.

`job.json`:

```json
{
  "jobId": "uuid",
  "task": "image-to-3d",
  "parameters": { "steps": 30 },
  "weights": { "my-engine-dit": "<data folder>/models/my-engine-dit/<revision>" },
  "inputs": { "images": ["<jobs>/<uuid>/in/image-0.png"], "models": ["<jobs>/<uuid>/in/model-0.glb"], "prompt": null, "views": [] },
  "outputDir": "<jobs>/<uuid>/out"
}
```

The engine writes **one JSON object per line** to stdout. Anything else on stdout or stderr goes to the job log.

| Message | Meaning |
| --- | --- |
| `{"type":"progress","value":0.4,"stage":"sampling"}` | Progress from 0 to 1, optional stage name |
| `{"type":"log","level":"info","message":"..."}` | Log line (`debug`, `info`, `warn`, `error`) |
| `{"type":"intermediate","path":"views.png","label":"Views","kind":"image"}` | File inside `outputDir` worth inspecting |
| `{"type":"result","files":[{"path":"model.glb","label":"Model","kind":"model"}]}` | Final files; a `model` file must be a GLB. Each file may carry `meta`, up to 8 numbers, booleans or short strings |
| `{"type":"error","message":"..."}` | Failure reason shown to the user |

A job succeeds only if the process exits with code 0 after sending `result`. Paths must stay inside `outputDir`.

A `remove-background` job returns an `image` result (PNG with alpha). Forma offers it as the prepared version of the reference.

A `text-to-image` job receives the user's prompt in `inputs.prompt` (1 to 1000 characters; Forma refuses the job without one) and returns one or more `image` results, the candidates. Give each candidate its seed in `meta` (`{"seed": 43}`) so the project can record it when the user picks that image as the reference. The [SDXL-Lightning plugin](../plugins/sdxl-lightning/README.md) is the reference implementation.

## Installable plugins

Engines whose code or weights cannot be distributed with Forma live in `plugins/<name>/` with an `install.json`:

```json
{
  "python": "3.11",
  "requirements": "requirements.txt",
  "files": ["forma-engine.json", "main.py", "requirements.txt", "README.md"],
  "vendor": [{ "repo": "https://github.com/org/code.git", "commit": "<40-character commit>", "dir": "vendor/code" }],
  "licenseNotice": { "en": "Shown before installing.", "es": "Se muestra antes de instalar." },
  "diskGb": 9,
  "check": "import torch; print(torch.cuda.is_available())"
}
```

Plugins under `plugins/` are bundled with Forma and listed in **Models → Engines**. **Activate** shows requirements and licenses (`licenseNotice` plus each weights license), records the acceptance, then copies the files to the user engines folder, clones each vendor repository at its pinned commit, creates `.venv` with the requirements (or uses an existing environment the user chooses), runs `check`, marks the plugin as installed and downloads its weights. Progress and the last lines of git/pip output are shown live; the installation can be cancelled.

`install.json` may declare `"base": "torch-cu128"` to share a runtime: Forma creates `<data folder>/runtimes/<base>/.venv` once from `runtimes/<base>/requirements.txt` (PyTorch 2.7.1 with CUDA 12.8 and the common diffusion libraries, all under permissive licenses), and each plugin gets a small `.venv` linked to it through a `forma-runtime.pth` file. pip then installs only what the plugin adds; a plugin that pins another version of a shared package installs it in its own environment, which takes precedence. The runtime is reinstalled only when its requirements change, and it stays when plugins are uninstalled. Choosing an existing Python skips it.

`install.json` may also list `build`: folders inside the plugin compiled with `pip install --no-build-isolation` after the requirements, for native extensions such as CUDA rasterizers.

For contributors, `npm run plugin:install -- <name> --accept-license` does the same from the command line: it copies the files to the user engines folder, clones each vendor repository at its pinned commit, creates `.venv` with the requirements (or reuses an environment with `--python <path>`) and runs the check. The user installs and accepts third-party licenses; Forma does not.

## Lifecycle and guarantees

- One job runs at a time (one GPU). The queue is stored in SQLite and survives restarts; a job that was running when the app closed is marked as interrupted.
- Cancel and timeout kill the whole process tree. Closing Forma kills the running job. Exiting the process frees the GPU.
- Network: the process receives `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1` and proxy variables pointing to a closed local port, so well-behaved libraries cannot download anything. This is a best-effort guard, not an OS sandbox: engines must not download at run time; prepare weights during installation.
- Logs are stored in `<data folder>/jobs/<id>/job.log` and shown in the Process tab.

See `engines/demo/` and [`templates/engine-plugin`](../templates/engine-plugin) for complete engines without dependencies, and the [plugin guide](plugin-guide.md) for the step-by-step workflow.
