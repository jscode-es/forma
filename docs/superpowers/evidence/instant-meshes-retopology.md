# Instant Meshes retopology validation

Retopology now runs through `plugins/instant-meshes`, not the Blender mesh engine. The Windows x64 executable is downloaded only during activation and verified by archive size/hash and executable size/hash, then verified again before each offline job. The original upstream license is included. The source revision reviewed is recorded separately from the binary hash because upstream does not identify the executable's source revision.

## Real worker

A fresh CPU-only Python 3.11 environment with just the five pinned dependencies passed ten consecutive real worker tests. Two runs recovered from the upstream optimizer stopping without CPU activity. A bounded watchdog terminates and retries that same executable after five seconds without CPU or new output, up to three starts per face target; active computation is allowed up to 480 seconds per run. No Torch, Blender, GPU or alternate remesher is used.

Fixture: icosphere, 642 vertices and 1280 triangles, translated to world center `(2, 3, 4)`, with base color `[51, 102, 153, 255]`, roughness `0.27` and metallic `0.1`. Budget: 256 quads. Atlas: 512.

Observed: **212 quads / 424 exported triangles**, 214 geometric vertices, 424 quad edges, one component, no degenerate faces, open borders or non-manifold edges. All UVs were finite within 0–1. The exported center was within 0.03 units of the source center; simple material factors were preserved. The source SHA-256 was unchanged. This verifies plumbing and basic geometry behavior, not artistic quality on every model.

When Instant Meshes exceeds the face budget, Forma lowers the requested target and tries again, at most three attempts. An over-budget result, non-quad output, degenerate faces or an atlas needing multiple pages is rejected before publishing a model. Textured meshes, vertex colors, multiple meshes/materials, skins, morphs, animations, external resources and glTF extensions are rejected before remeshing. No alternate remesher or decimation fallback runs.

## Checks

- 15 CI-safe Python tests, including malformed OBJ, bounded parameters, checksum failures, offline verification, unsupported GLB rejection and watchdog behavior for idle versus active processes.
- Real Instant Meshes test: `plugins/instant-meshes/test_engine.py`, using the installed CPU runtime.
- Blender mesh tests: 17 passed after removing its retopology code; UV, normals and AO remain functional.
- 11 relevant Playwright tests passed, including real retopology preview/apply, source preservation, later Blender UV/normal/AO jobs, onboarding, settings and focus/menu bounds.
- A further 6-test engine/accessibility/settings run and a 14-test mesh/reference run passed with the independent runtime and latest controls.
- Node suite: 99 passed, one skipped. Typecheck, lint, build, i18n and plugin catalog checks passed.
- Electron security review found no issue with platform validation, installation-only download, checksum verification, subprocess invocation or IPC.

Linux and macOS are explicitly incompatible for this plugin until their own binary artifacts are pinned and tested. The other desktop workflows and Blender tools are unchanged.
