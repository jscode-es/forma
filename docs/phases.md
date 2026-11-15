# Development phases

Forma is built in phases. Each phase delivers something usable and reviewable, has a GitHub milestone (`Phase N`) and one tracking issue with its checklist. Phases are ordered by dependency; work inside a phase can be split across several PRs.

## Rules

- A phase is **done** when every item is checked and the definition of done holds.
- Definition of done: `npm run typecheck && npm run lint && npm run build` pass; UI strings exist in English and Spanish; the feature was exercised in the real Electron app; docs updated; no model weights, secrets or databases committed.
- Scope is explicit. Anything not listed is out of the phase; add it to a later one instead of growing the current one.
- PRs target `dev`, titled as Conventional Commits, and reference the phase issue (`Refs #N`). Releases follow [releasing.md](releasing.md).
- Model engines are **plugins installed by the user**. The repo never bundles weights or third-party engine code; every engine documents its license, VRAM needs and checksums.
- Design reference: dark anthracite UI with a purple accent, left menu, central 3D viewport with bottom tabs, right inspector with tabs. Kivora components only.

## Milestones

| Version | Reached after | Meaning |
| --- | --- | --- |
| 0.x | each phase | Preview releases |
| 1.0 | Phase 8 | Stable: image to 3D, viewer, projects, variants, export |

## Phase 0 · Foundation (done)

- [x] Electron + Next.js (static export) + `node:sqlite` shell
- [x] Kivora UI, i18n (es/en, auto-detect), light/dark theme, Zustand stores
- [x] Splash screen and base layout (menu, viewport, config aside)
- [x] CI, Conventional Commits, release-please, installers for Windows, macOS and Linux
- [x] App icon, community files, agent configuration

## Phase 1 · Studio layout (done)

Target: the interface structure of the design reference, without engines.

- [x] Top bar: logo, workspace and project name, unsaved indicator, new, save
- [x] Left menu: Create 3D, Create animation, Export; scene tree; references; library, help and settings entries
- [x] Viewport header: preview label, solid/wireframe toggle
- [x] Bottom dock tabs: Session, Job queue, Process, Timeline
- [x] Right inspector tabs: Create, Model, Finish, Edit, Animation, Export; tool search; collapsible sections with help popovers
- [x] Status bar: hardware, engines state, version
- [x] Persist panel sizes and active tabs; responsive behavior for narrow windows
- [x] Settings dialog (language, theme, paths)

## Phase 2 · Projects and persistence (done)

- [x] SQLite schema with migrations: projects, assets, variants, jobs, settings
- [x] Projects stored on disk (`projects/<id>/`) with files referenced from the database
- [x] Library: list, open, rename, duplicate, delete
- [x] Unsaved-changes tracking and guard when closing or switching
- [x] Protected drafts per tool when switching tools
- [x] Reopen last project on start
- [x] Typed IPC layer with input validation for every channel

## Phase 3 · 3D viewport (done)

- [x] three.js viewer: orbit, zoom, pan, grid, lighting, ACES tone mapping
- [x] Load and display GLB; import a GLB into a project
- [x] Solid, wireframe and material views; camera presets and reset
- [x] Model stats: vertices, triangles, size, textures
- [x] Viewer lifecycle without leaks when switching tools or projects
- [x] Failure state keeps the last good model visible

## Phase 4 · Engine runtime and jobs (done)

- [x] Engine plugin contract: manifest, inputs, parameters, progress, cancel, result files
- [x] Worker process manager: one process per job, GPU freed on exit, timeouts, crash recovery
- [x] Job queue (one GPU job at a time) persisted in SQLite
- [x] Process and Job queue tabs: progress, logs, intermediates, cancel, retry
- [x] Hardware detection: GPU, VRAM, CUDA, disk
- [x] Offline guarantee: engines run without network access
- [x] Python environment discovery and diagnostics

## Phase 5 · Model manager (done)

- [x] Model catalog with engine, size, license, VRAM and pinned revision
- [x] Download with resume, SHA-256 verification and receipts
- [x] Explicit license acknowledgement before the first download
- [x] Status, verify, repair and remove; disk usage view
- [x] Update check that only reports, never installs by itself

## Phase 6 · Image to 3D (first engine) (done)

- [x] Reference image import with validation (PNG, JPG, WebP, size limits)
- [x] Background removal step (BiRefNet) with preview
- [x] First engine plugin: Hunyuan3D 2.0 geometry, activated from the app (verified on an RTX 5070: 108 s, 714k triangles)
- [x] Quality profiles, seed and engine-specific settings saved with the project
- [x] Generation with real progress, result shown in the viewport, GLB stored in the project
- [x] Physical scale (height in meters)
- [x] Generation trace: inputs, intermediates and parameters per job

## Phase 7 · Variants and export (done)

- [x] Preview, apply and save flow with a clear active version
- [x] Variant history with source, parameters and checksums
- [x] Compare original and variant in the same viewport
- [x] Export GLB of the active version through a native save dialog
- [x] Optimize mesh: triangle budget, up to 3 LODs, UV and material preserved, verified output

## Phase 8 · Stable 1.0

- [x] End-to-end test suite of the Electron app (open, generate with a fake engine, save, export), also run against the packaged app and in CI
- [x] Performance baseline and fixes for the viewer and jobs (startup ~2 s, 109k-triangle model ~1 s, demo job ~1 s)
- [x] Accessibility pass: keyboard, focus, labels (axe: no serious issues; landmarks, headings, keyboard tabs)
- [x] User manual and engine installation guides (English and Spanish)
- [ ] Signed installers and a reproducible release checklist (checklist and signing pipeline ready; certificates pending)

## Phase 9 · Text to 3D (done)

- [x] Create reference section: prompt with text-to-image step (SDXL-Lightning plugin), then image-to-3D
- [x] Image candidates to pick from before generating
- [x] Prompt history and seeds saved with the project

Verified on an RTX 5070 (12 GB) in the app: SDXL-Lightning produced four 1024 px candidates of a ceramic penguin figurine in 54 s; the picked candidate became the reference and Hunyuan3D 2.0 turned it into a 660,656-triangle model in 154 s.

## Phase 10 · Multi-view and reference review (done)

- [x] Front, back, left, right (and optional top) references
- [x] Multi-view engine (Hunyuan 2 MV) and view assignment
- [x] Reference review: scale and silhouette warnings, height matching without stretching
- [x] Alignment and projection tools with explicit cameras

The Hunyuan3D 2 MV plugin and view assignment are implemented with pinned code and checksummed weights. Electron multi-view generation, persistence and alignment are exercised with the demo engine; the Python wrapper has isolated contract tests. A real run on an RTX 5070 (12 GB) generated the penguin reference with Hunyuan3D 2 MV in 150 s (702,090 triangles) through the app. Projection is a session-only orthographic reference overlay; it does not paint or alter the mesh.

## Phase 11 · Texturing and PBR (done)

- [x] Texture generation for generated and imported meshes (Hunyuan3D Paint 2.1 PBR plugin)
- [x] PBR maps: albedo, metallic, roughness, normal, AO (albedo, metallic and roughness generated by Paint 2.1; normal and AO baked from geometry with Blender)
- [x] Lighting neutralization option (Delight) and atlas resolution control
- [x] Texture upscale (2x, 4x) with explicit limits
- [x] Materials panel: factors, maps, isolate and compare

Material inspection, five-map import, provenance and preview variants are implemented. Upscale uses bilinear resampling with a 4096-pixel side limit, linear RGB for albedo and normal renormalization; transparent data maps are rejected explicitly. Texture job settings, explicit references and protected source parents are integrated and tested using a protocol fixture. The low-VRAM Paint 2.1 fork was discarded (torch 2.6 has no Blackwell support, see [feasibility evidence](superpowers/phase-11-texture-engine-feasibility.md)). The Hunyuan3D Paint 2.1 PBR plugin instead runs the official Paint 2.1 weights with the Hunyuan3D 2.0 renderer, CPU offload and torch 2.7.1 cu128. Verified on an RTX 5070 (12 GB): a Hunyuan3D 2.0 penguin (700,966 faces reduced to 40,000) textured with Delight, 15 steps and a 1024 px atlas in 173 s; roughness 40–101 and metallic 0–9 in the packed map. Ambient occlusion is baked with Cycles on CPU into the existing UVs and appended to the original GLB as its occlusion map, leaving the mesh, UVs and other maps byte for byte: the Paint 2.1 penguin baked in 12 s at 1024 px and 64 samples (mean occlusion 0.86).

## Phase 12 · Mesh tools (done)

- [x] Mesh inspection: degenerate faces, open borders, non-manifold edges, components
- [x] Retopology with face budget and UV regeneration (headless Blender)
- [x] UV unwrap and pack with template export
- [x] Normals: recalculation and baking from a detailed source
- [x] Every modifying operation produces a variant before being applied

Validated with Blender 5.2.1 LTS on Windows, including real QuadriFlow, packed UVs, PNG template export and CPU normal baking. Inspection produces a report without changing the model. Retopology budgets count quads (the exported GLB can contain twice as many triangles). Retopology and UV replacement reject textured/complex materials; modifying operations reject rigs, morph targets and animations. Baking requires a target with UVs and a spatially aligned detailed variant. See [engine evidence](superpowers/evidence/phase12-blender-mesh.md) and the manuals for limits.

## Phase 13 · Paint 3D (done)

- [x] Brush, clone, eyedropper and restore on base color (UV0, up to 2048 px)
- [x] Per-stroke undo and redo, protected unsaved strokes
- [x] Save as variant

Painting runs interactively in the existing viewer, with a 64 MiB history budget, pinned draft sources and automatic paint-variant creation before project save. Electron checks cover actual painted PNG pixels in an exported GLB, clone/restore sampling, close cancellation and changing the displayed source. UV-space painting can affect adjacent or overlapping islands; nonidentity texture transforms, nonzero UV channels and extension-bearing materials are rejected. See [painting evidence](superpowers/evidence/phase13-paint.md) and the manuals for details.

## Phase 14 · Rig (done)

- [x] Humanoid auto-rig with guides and automatic weights
- [x] Rig editor: bones, weights visualization, pose test
- [x] Rig variants versioned, with clips preserved or discarded explicitly

The built-in Blender rig engine creates a 19-bone standing humanoid skeleton from adjustable body landmarks and real automatic heat weights. Bone rest-position edits produce preview variants; bones, selected-joint weight colors and reversible local pose tests run in the viewer. Compatible edit clips retain their original animation payloads, while replacement requires explicit discard. Inputs are conservatively limited to embedded, extension-free GLB with one skin and valid normalized weights; edit preservation requires identity skinned-mesh/nonjoint ancestor world transforms and matching rest/bind poses. No fingers, IK controls or anatomy inference are included. Real Blender deformation, raw-weight guards and Electron rig/export/clip workflows are verified in [rig evidence](superpowers/evidence/phase14-rig.md).

## Phase 15 · Animation (done)

- [x] Animation library independent of projects
- [x] Presets: idle, walk, run
- [x] Timeline editor: tracks per bone, keys, interpolation, FPS, undo and redo
- [x] Retarget with bone mapping and validation
- [x] Motion from video (local pose estimation)
- [x] Text-to-motion through optional external providers (Codex, Claude or Copilot CLI with per-generation consent)

The independent SQLite library imports/exports validated portable clips. Local TRS key editing supports linear/step interpolation, quaternion playback, source-protected drafts and animated GLB variants; imported cubic clips are sampled to editable keys while unrelated source clips remain intact. Procedural humanoid presets and compatible-rig retargeting are verified against actual skins. The authorized MediaPipe Motion runtime/model is installed and real CPU video inference produces changing joint tracks that deform exported GLB meshes. Capture is in-place, without calibrated root travel, twist, fingers or face tracking. The user chose no external provider, so optional text-to-motion remains unconfigured. See [animation verification](superpowers/evidence/phase15-animation.md) and [local motion evidence](superpowers/evidence/phase15-motion-feasibility.md).

## Phase 16 · More engines and plugins

- [x] Public plugin guide and template (`plugin:new`, `plugin:check`, `plugin:weights`, CI validation)
- [ ] ~~Additional engines as community plugins (TRELLIS family, Pixal3D, gaussian splats)~~ deferred
- [ ] ~~WSL/Linux engine environments~~ deferred

Decision (2026-11-15): Forma only ships engines that run natively on the user's system and improve quality. On the reference RTX 5070 (12 GB), the prototype comparisons recommended Hunyuan3D 2.0 and 2 MV over TRELLIS (more irregular bands, edges and relief), while TRELLIS.2 and Pixal3D only ran in low-VRAM mode at reduced resolution (300–534 s) without a clear quality gain; gaussian splats do not produce editable meshes. Linux-only engines can still be contributed with the [plugin guide](plugin-guide.md) and will be reconsidered when they run natively or clearly beat the current engines.
- [x] Engine comparison with common captures

**Compare versions** renders up to six versions with the same four cameras, lighting and framing into a PNG sheet with engine, topology, size, materials, file size and parameters. Verified with real Hunyuan3D 2.0, Hunyuan3D 2 MV and Paint 2.1 results of the same SDXL-Lightning reference.

## Phase 17 · Interchange and distribution

- [x] Export packages for Blender, Unity and Godot with validation
- [x] glTF validation and tangents
- [x] Local CLI for automation ([command line](cli.md))
- [x] Auto-update (electron-updater from GitHub releases, opt-out, install on confirmation; macOS needs signing)
- [x] Bundled runtime for engines where licenses allow (shared PyTorch CUDA runtime downloaded once for every GPU plugin)
