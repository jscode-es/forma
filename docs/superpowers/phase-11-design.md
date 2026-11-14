# Phase 11: Texturing and PBR — proposed design

Status: approved by the user; target the current 12 GB GPU (Option A).

## Scope

Implement Phase 11 from `docs/phases.md`: texture generation on generated and imported meshes; albedo, metallic, roughness, normal and AO maps; lighting neutralization and atlas resolution; bounded 2x/4x upscale; material factors, maps, isolation and comparison.

## Existing architecture

The engine protocol already has a `texture` task and accepts mesh and image inputs. Jobs and their files are persisted. GLB variants already support preview, apply, compare and export. The viewer uses three.js standard materials. Finish currently contains placeholders for texture and materials tools.

## Hardware finding and decision

The current machine reports an NVIDIA RTX 5070 with 12,227 MiB VRAM. Official Hunyuan3D-Paint 2.1 documentation recommends at least 21 GB for its smallest documented configuration (six views, resolution 512):
https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1/blob/main/hy3dpaint/README.md

Option A (recommended): target this 12 GB machine. First validate a real texturing pipeline using sequential stages or CPU offload, checking memory, runtime, Windows installation and actual exported maps before committing to an engine. Slower execution is acceptable; compatibility is not assumed from upstream claims. If no viable pipeline is established, report the limitation rather than invent maps or silently substitute a different feature.

Option B: use the documented Hunyuan3D-Paint 2.1 configuration as an optional higher-VRAM plugin. Material editing and file operations can still work locally, but this machine cannot be promised compatible texture generation with that configuration.

## Implementation contract

- Add texture engine selection and parameters to project settings, with defaults for existing projects.
- A texture job receives the active mesh and an explicitly selected reference. Preserve its parent variant even if selection changes during the job.
- Every texture, material edit and upscale creates a preview variant before application. Exports contain embedded textures; originals are preserved.
- Show actual map availability and UV requirements. Distinguish generated maps, baked geometric maps and user imports. Never present constant placeholder maps as AI-generated PBR maps.
- Finish > Materials exposes material selection, factors, maps, isolate and compare. Isolation affects preview only.
- Upscale at 2x/4x with an explicit 4096-pixel output-side limit; process maps sequentially and handle normal vectors and data-map color spaces correctly. Name the actual resampling method used.
- Lighting neutralization is exposed only when the chosen pipeline implements it and is validated.
- Reuse the validated IPC boundary, plugin licensing and checksum workflow. No automatic weight download or license acceptance.
- Kivora controls, English/Spanish translations, Zustand state. Main validates all new inputs.

## Validation

Test imported and generated meshes, missing UVs/maps, project switches during jobs, parent variant attribution, normal/data-map handling, resize limits, persistence and textured GLB export. Run typecheck, lint, build and Electron regression tests. Validate real engine inference separately from demo tests before marking texture generation complete.
