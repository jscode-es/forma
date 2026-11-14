# Forma user manual

[Español](manual.es.md)

Forma turns images into 3D models on your own computer. Nothing is uploaded: generation, projects and files stay local.

## Install

Download the installer for your system from the [releases page](https://github.com/jscode-es/forma/releases): `.exe` for Windows, `.dmg` for macOS (Apple Silicon), `.AppImage` or `.deb` for Linux. Installers are not signed yet, so Windows SmartScreen and macOS Gatekeeper ask for confirmation the first time (on macOS: right click → Open).

## The studio

| Area | What it does |
| --- | --- |
| Top bar | Project name, unsaved indicator (purple dot), New, Save project (Ctrl+S) |
| Left menu | Create reference, Create 3D, Create animation, Export; the scene object; the reference image; Library, Models, Help and Settings |
| Viewport | The 3D view. Drag to orbit, wheel to zoom, right button to pan. Material, Solid and Wireframe views, camera presets, frame and grid |
| Bottom dock | Versions, Job queue, Process (inputs, parameters, files and log of each job) and Timeline |
| Inspector | Changes with the left menu section. Create 3D: Create, Model, Finish, Edit. Create animation: Capture, Skeleton, Clips, Character. Export: Files, Interchange. Search looks inside the current section; arrow keys move between tabs |
| Status bar | GPU and VRAM, available engines, version |

Every new project starts with a 1 m cube. Projects, settings and the panel layout are remembered; the last project opens on start.

## Activate an engine

Forma includes the engines it supports, but you activate them yourself because their licenses are between you and their authors.

1. Open **Models** (left menu) → **Engines**.
2. Click **Activate** on the engine (for example Hunyuan3D 2.0). Check the requirements: NVIDIA GPU with CUDA and enough VRAM, Python 3.11, Git when the plugin downloads code, free disk.
3. Read the licenses, tick **I have read and accept these licenses** and click **Accept and activate**.
4. Forma downloads the engine code at a fixed version, prepares its Python environment (several GB the first time), verifies it and downloads the model weights. Progress and the last lines of output are shown; you can cancel.

Advanced: if you already have a Python environment with the required packages, tick **Use an existing Python environment** and choose its `python` executable.

The **Weights** tab lists model files with their size, license, revision and status. Verify recalculates SHA-256 checksums, Repair downloads only the damaged files and Check for updates only reports newer upstream versions.

Hunyuan3D 2.0 is licensed by Tencent and the license does not apply in the European Union, the United Kingdom or South Korea.

## Create a model from an image

1. In **References**, click the drop zone and choose a PNG, JPG or WebP (up to 20 MB and 16 megapixels).
2. Optional: **Remove background** creates a version without background; the switch chooses which one is used.
3. In **Create 3D → Create → Generation engine**, choose the engine (the gear opens the model manager). Quality (Fast, Balanced, High) sets 15, 30 or 50 steps; its gear customizes the steps of each profile. Engine settings (seed, guidance, resolution) are saved with the project.
4. Optional: **Physical scale** resizes the result to a height in meters.
5. Click **Generate model**. The job appears in **Job queue**; **Process** shows its progress, prepared images and log.

On an RTX 5070 (12 GB), Hunyuan3D 2.0 needs about 2 minutes at 30 steps.

## Create a model from text

1. Activate an image engine, such as **SDXL-Lightning**, in **Models → Engines**.
2. In **Create reference → From text → Prompt**, describe one object and choose the image engine. *Images* sets how many candidates you get and *Seed* makes them reproducible; candidate *n* uses seed + *n*.
3. Click **Generate images** (or press Ctrl+Enter in the prompt). The candidates appear under the prompt.
4. Click the candidate you like: it becomes the reference, with its prompt and seed.
5. Click **Continue in Create 3D** and go on as in [Create a model from an image](#create-a-model-from-an-image), from step 3.

**Prompt history** keeps every prompt of the project with its engine settings and seed. **Reuse** puts the prompt and settings back so you can repeat or vary it.

## Versions

Every result is a new version. Generated and optimized results open in **Preview**:

- **Compare** shows the active version in the same view.
- **Apply** makes the preview the active version.
- **Discard** deletes an unsaved candidate.

The **Versions** tab lists all versions with origin, triangles, parameters and SHA-256 after saving. You can preview and apply any of them. Importing a GLB (scene block → **Import GLB**) creates an active version directly.

## Optimize and LOD

**Create 3D → Model → Optimize and LOD** reduces the active version to a triangle budget and can create up to three levels of detail. UVs, materials and textures are preserved and every file is verified. If a budget cannot be reached without damaging the mesh, nothing is published. Models with skeletons are not supported yet.

## Export

**Export** (left menu) **→ Files → Export GLB** always writes the active version (a version in preview is not exported until you apply it). The file is read back and its SHA-256 checked. LODs are exported as separate files.

## Projects

- **Save project** (Ctrl+S) asks for a name the first time. Files are copied into the project folder.
- **Library** opens, renames, duplicates and deletes projects.
- Closing the window, starting a new project or opening another one asks whether to save, discard or cancel if there are unsaved changes.

## Settings and data

**Settings** has language (English, Spanish or system), theme (light, dark or system), the data folder and a hardware report (GPU, VRAM, driver, CUDA, free disk, Python, engines). The data folder holds the database, projects, jobs, engines and model weights.

## Troubleshooting

| Problem | What to do |
| --- | --- |
| An engine shows "Python not found" or activation fails with Git or Python missing | Install Python 3.11 from python.org and Git from git-scm.com, then click Activate again |
| "Not enough VRAM" or "CUDA not available" | The engine needs an NVIDIA GPU with CUDA; check the hardware report in Settings |
| A job failed | Open **Process**: the log shows the engine output. **Retry** runs it again with the same inputs |
| The model could not be loaded | Forma keeps the previous version. GLB files compressed with Draco are not supported yet |
| Something else | [Report a problem](https://github.com/jscode-es/forma/issues/new/choose) with the log from Process |
