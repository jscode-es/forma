# Phase 13 painting evidence

Validated on Windows with the existing Electron/Three.js renderer on 2026-11-14. No packages, runtimes or weights were installed.

## Implemented behavior

- UV0 base-color brush, immutable-snapshot clone, map-color eyedropper and original RGBA restoration. Pointer cancellation restores the entire active stroke; misses and UV jumps stop interpolation.
- Live sRGB canvas textures use the original material factor and sampler. Only the selected material is cloned for display. Source materials, textures and orbit controls are restored when the draft stops displaying or the viewer closes. Closest visible geometry blocks painting through other materials.
- Per-stroke undo/redo uses at most 64 MiB across both history stacks. Dirty tracking remains exact after history pruning and during active strokes. Original pixels remain available to Restore. A 2048-square surface retains up to two complete before/after strokes; a 1024-square surface retains eight.
- Pending draft parents are pinned. Switching displayed versions retains strokes; returning to the source restores editing. Save creates a GLB preview with origin `paint` and the explicit parent, even when another source is active. Saving the project first commits its pending paint. Native close/navigation guard includes paint-only changes; cancel retains them and discard drops them.
- Saving blocks duplicate saves and project transitions. Sessions are checked before and after asynchronous paint work and database calls. Renames that finish during paint encoding use the current snapshot name.

## Verification

- `node --experimental-strip-types --test src/feature/paint/engine.test.mjs src/feature/materials/operations.paint.test.mjs src/feature/materials/operations.test.mjs tests/paint-viewer.test.mjs`: 20 passing tests covering real pixel algorithms, material validation, sampler/resource restoration, raycast occlusion/material slots/orthographic camera and pointer cancellation.
- `node --experimental-strip-types --test tests/project-paint-flow.test.mjs`: nine passing tests with the real project store and deferred paint work. Removing the post-paint session guard in memory fails two cases; removing the busy guard fails the concurrency case. The rename test failed before the current-snapshot-name fix.
- `src/feature/materials/operations.paint.browser.test.cjs`, run in real hidden Electron: PNG encode/decode roundtrip passes, including shared-map isolation, preserved material factors, original binary/geometry/skins/animations and rejection above 2048 px.
- The broader Node contract/reference/material suite passed alongside painting tests (44 tests before the additional rename regression; that regression and all eight other flow cases then passed).
- Full `npm run test:e2e`: 36 passed in 1.9 minutes, including real Blender, references, materials, locale, persistence, accessibility and performance. All six painting workflows were rerun after the final name-race fix and build: actual brush/undo/redo; project-save inclusion; GLB export containing measured red PNG pixels with unchanged geometry/source SHA-256; clone/sample/restore; paint-only close cancellation; and importing a different model while retaining the draft and saving with its original parent. The rerun also checks the open paint controls with axe (no serious/critical findings).
- Final `npm run typecheck`, `npm run lint` and `npm run build` passed. Independent reviews covered draft/session handling, renderer resource restoration, asynchronous saving and Electron schema changes. Reported session/name races were reproduced, fixed and covered by regression tests. No new IPC channels or renderer privileges were added.

## Limits

Painting edits UV-space pixels within 0–1; it is not a screen-space projection brush. A brush footprint can touch adjacent islands, and UV overlaps share painted pixels. Nonzero UV channels, nonidentity texture transforms, compressed image textures and extension-bearing materials are rejected explicitly. Embedded PNG/JPEG/WebP textures are supported up to 2048 pixels per side; missing maps become white at the chosen resolution. Existing PBR color factors continue to multiply the painted map. Geometry, animation and unrelated maps are retained by the GLB writer. Draft/history live in memory until saved as a variant; they are not crash-recovery files.
