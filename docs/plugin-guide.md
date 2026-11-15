# Writing an engine plugin

This guide takes you from an idea ("Forma should run model X") to a pull request with a working, reviewable plugin. The full reference for manifests, the process protocol and weights is in [engine-plugins.md](engine-plugins.md).

## What a plugin is

An engine is a folder with a manifest (`forma-engine.json`) and an entry script. Forma starts one process per job, passes it a `job.json`, reads JSON lines from its stdout and imports the files it writes. Engines never talk to the UI, the database or the network.

A **plugin** is an engine whose code or weights Forma cannot bundle. It lives in `plugins/<id>/` with an `install.json`; users activate it from **Models → Engines**, accept its licenses, and Forma downloads the pinned code, builds the Python environment and downloads the verified weights.

Write a plugin when the model has a license that lets users run it locally and a pinned public source (a Git commit and a Hugging Face or GitHub revision).

## Quick start

```bash
npm run plugin:new -- my-engine --name "My engine"
npm run build
npm run plugin:check -- plugins/my-engine --run
```

`plugin:new` copies [`templates/engine-plugin`](../templates/engine-plugin) to `plugins/my-engine`. The template is a complete engine without dependencies: it turns the reference image into a textured 3D card. `plugin:check` validates the manifest and `install.json` with the same schemas the app uses and, with `--run`, runs a real job and checks every protocol message and output file.

To try it in the app, run `npm run plugin:install -- my-engine --accept-license` (or **Activate** it in **Models → Engines**), restart `npm run dev` and pick the engine in the inspector.

## Step by step

1. **Choose the task.** `image-to-3d`, `text-to-image`, `texture`, `remove-background`, `video-to-motion` and the mesh tasks are wired in the UI. Each task expects specific results:

   | Task | Inputs | Result |
   | --- | --- | --- |
   | `image-to-3d` | `images` (and `views` for multi-view engines) | one `model` GLB |
   | `text-to-image` | `prompt` | one or more `image` files, each with `meta.seed` |
   | `remove-background` | one image | one `image` PNG with alpha |
   | `texture` | one model and one image | one `model` GLB with embedded textures |
   | `video-to-motion` | one video | an `animation-clip` JSON |

2. **Describe the engine** in `forma-engine.json`: id, name, version, license, English and Spanish descriptions, task, runtime, timeout, VRAM and CUDA needs, inputs and parameters. Parameters appear in the inspector automatically; give every label an `es` translation. Use `tasks` on a parameter when the engine has several tasks.

3. **Share the runtime.** GPU engines built on PyTorch should add `"base": "torch-cu128"` to `install.json` and keep the same pins as [`runtimes/torch-cu128/requirements.txt`](../runtimes/torch-cu128/requirements.txt), so users download PyTorch once for every engine.

4. **Pin the code.** Add the upstream repository to `install.json` → `vendor` with a full 40-character commit. If it has native extensions, list their folders in `build`; they are compiled with `pip install --no-build-isolation` after the requirements. Pin every requirement to an exact version (`==`).

5. **Pin the weights.** Generate the `files` block of each weights entry instead of writing hashes by hand:

   ```bash
   npm run plugin:weights -- huggingface org/model <40-character commit> path/model.safetensors path/config.json
   ```

   Copy `source` and `files` into a `weights` entry and fill its `license` (id, name, https URL and a short English and Spanish summary, including territorial or usage limits). Mark weights the engine can run without as `optional`.

6. **Write the entry script.** Read `job.json`, use `weights[<id>]` for model folders and `inputs` for files, write results only inside `outputDir`, and report through stdout:

   - `progress` with a value from 0 to 1 and a short stage name,
   - `log` for anything worth keeping (send library chatter to stderr),
   - `intermediate` for files worth inspecting (prepared images, maps),
   - `result` once, at the end, then exit with code 0,
   - `error` with a clear message and a non-zero exit code on failure.

   Load models with local paths only (`local_files_only=True`): jobs run offline. Free the GPU by exiting; Forma starts a new process per job.

7. **Write the README** from the template: what it does, requirements, activation, parameters, licenses and a **reference run** (hardware, inputs, settings, time and result).

8. **Check it.**

   ```bash
   npm run plugin:check -- plugins/my-engine --run --python <env python> --weights my-weights=<folder> --image <reference.png>
   ```

   The check fails on schema errors, missing files, protocol violations, a missing `result`, files outside `outputDir`, invalid GLB or image outputs, and non-zero exits. It warns about missing Spanish text, unpinned requirements and stdout lines that are not JSON.

## Rules

- **No bundled third-party code or weights.** The repository contains only the plugin files; the installer fetches pinned upstream code and the weights manager downloads verified weights after the user accepts their licenses.
- **Licenses are explicit.** `licenseNotice` and each weights `license.summary` say who may use the model and where. Never accept a license on the user's behalf.
- **Offline at run time.** Engines must not download anything during a job. Forma sets `HF_HUB_OFFLINE`, `TRANSFORMERS_OFFLINE` and a closed proxy as a guard.
- **Reproducible.** Expose the seed when the model is stochastic and document the defaults of the reference run.
- **Respect the user's files.** Read inputs, write only to `outputDir`, never modify the input model or reference.
- **Cross-platform when possible.** State the supported systems in the README; Windows and Linux users run Forma.

## Opening the pull request

1. Open an [engine plugin proposal](../.github/ISSUE_TEMPLATE/engine_plugin.md) first if the model, its license or its hardware needs may raise questions.
2. Branch from `dev`, title the pull request as a Conventional Commit (`feat(plugins): add <name>`), and fill the template.
3. Include the output of `npm run plugin:check -- plugins/<id> --run` with real weights and a screenshot of the result in Forma.
4. Continuous integration validates every plugin manifest and runs the template engine; the real model run is the evidence you provide.

## Engines outside the repository

Any folder with a valid `forma-engine.json` in `<data folder>/engines/` is listed as an engine, so you can develop and share engines without a pull request. They do not appear in **Models → Engines** and are not installed or updated by Forma.
