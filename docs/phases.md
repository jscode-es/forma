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

## Phase 6 · Image to 3D (first engine)

- [ ] Reference image import with validation (PNG, JPG, WebP, size limits)
- [ ] Background removal step (BiRefNet) with preview
- [ ] First engine plugin: Hunyuan3D 2.0 geometry
- [ ] Quality profiles, seed and engine-specific settings saved with the project
- [ ] Generation with real progress, result shown in the viewport, GLB stored in the project
- [ ] Physical scale (height in meters)
- [ ] Generation trace: inputs, intermediates and parameters per job

## Phase 7 · Variants and export

- [ ] Preview, apply and save flow with a clear active version
- [ ] Variant history with source, parameters and checksums
- [ ] Compare original and variant in the same viewport
- [ ] Export GLB of the active version through a native save dialog
- [ ] Optimize mesh: triangle budget, up to 3 LODs, UV and material preserved, verified output

## Phase 8 · Stable 1.0

- [ ] End-to-end test suite of the Electron app (open, generate with a fake engine, save, export)
- [ ] Performance baseline and fixes for the viewer and jobs
- [ ] Accessibility pass: keyboard, focus, labels
- [ ] User manual and engine installation guides
- [ ] Signed installers and a reproducible release checklist

## Phase 9 · Text to 3D

- [ ] Prompt input with text-to-image step, then image-to-3D
- [ ] Image candidates to pick from before generating
- [ ] Prompt history and seeds saved with the project

## Phase 10 · Multi-view and reference review

- [ ] Front, back, left, right (and optional top) references
- [ ] Multi-view engine (Hunyuan 2 MV) and view assignment
- [ ] Reference review: scale and silhouette warnings, height matching without stretching
- [ ] Alignment and projection tools with explicit cameras

## Phase 11 · Texturing and PBR

- [ ] Texture generation for generated and imported meshes
- [ ] PBR maps: albedo, metallic, roughness, normal, AO
- [ ] Lighting neutralization option and atlas resolution control
- [ ] Texture upscale (2x, 4x) with explicit limits
- [ ] Materials panel: factors, maps, isolate and compare

## Phase 12 · Mesh tools

- [ ] Mesh inspection: degenerate faces, open borders, non-manifold edges, components
- [ ] Retopology with face budget and UV regeneration (headless Blender)
- [ ] UV unwrap and pack with template export
- [ ] Normals: recalculation and baking from a detailed source
- [ ] Every operation produces a variant before being applied

## Phase 13 · Paint 3D

- [ ] Brush, clone, eyedropper and restore on base color (UV0, up to 2048 px)
- [ ] Per-stroke undo and redo, protected unsaved strokes
- [ ] Save as variant

## Phase 14 · Rig

- [ ] Humanoid auto-rig with guides and automatic weights
- [ ] Rig editor: bones, weights visualization, pose test
- [ ] Rig variants versioned, with clips preserved or discarded explicitly

## Phase 15 · Animation

- [ ] Animation library independent of projects
- [ ] Presets: idle, walk, run
- [ ] Timeline editor: tracks per bone, keys, interpolation, FPS, undo and redo
- [ ] Retarget with bone mapping and validation
- [ ] Motion from video (local pose estimation)
- [ ] Text-to-motion through optional external providers

## Phase 16 · More engines and plugins

- [ ] Public plugin guide and template
- [ ] Additional engines as community plugins (TRELLIS family, Pixal3D, gaussian splats)
- [ ] WSL/Linux engine environments
- [ ] Engine comparison with common captures

## Phase 17 · Interchange and distribution

- [ ] Export packages for Blender, Unity and Godot with validation
- [ ] glTF validation and tangents
- [ ] Local CLI for automation
- [ ] Auto-update
- [ ] Bundled runtime for engines where licenses allow
