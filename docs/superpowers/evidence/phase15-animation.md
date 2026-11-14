# Phase 15 animation verification

Implemented local clip-library/edit/playback/retarget workflows and authorized CPU video pose estimation. External text-to-motion was explicitly declined and remains optional/unconfigured.

## Behavior

- Portable version-1 clips contain named rest-TRS skeletons, FPS, frame duration and per-bone TRS keys. Rotation uses normalized quaternions, shortest-path slerp or STEP; imported cubic GLB samplers are evaluated with Hermite tangents in seconds and sampled to editable LINEAR keys. Presets use world-aware humanoid motion, including lowering T-pose arms under Blender's nonidentity bone rest orientations.
- Raw GLB append/replace preserves mesh/skin/material data, the complete existing binary prefix and unrelated original animation JSON. The native library is stored in its own SQLite table, outside projects, with validated native JSON import/export and SHA-256 verification.
- Retarget requires complete unique bone mappings and compatible parent/rest coordinate frames and scales. Compatible translation differences use skeleton size; incompatible rigs are rejected. This is not arbitrary-rig automatic retargeting.
- Viewer playback affects actual Three.js skin transforms, restores rest on source changes and works alongside rig weight/skeleton views. Joint indices preserve track resolution when GLTFLoader sanitizes bone names. Frame feedback does not reset the fractional playback clock.
- Draft sources are pinned. Per-edit undo/redo uses at most 64 MiB of serialized history. Saving a project first commits pending paint and animation variants. Save/discard/cancel guards include animation-only edits; asynchronous library/model requests cannot overwrite a different source/session. Synchronous validation failure does not permanently block later corrected saves.

## Tests and review

- All Node `.test.mjs` contract/math/source/store/project-flow suites: 100 passed, zero skipped, using `FORMA_ANIMATION_FIXTURE` pointing to a real Blender-generated animated rig. Includes real GLTFLoader/AnimationMixer/SkinnedMesh deformation, Hermite comparison, presets, retarget, playback clock and source/session races.
- Native Node/Electron-boundary harnesses: 12 passed, one symlink test skipped because Windows did not allow creating that symlink. The always-run realpath traversal test passes. Library CRUD/reopen/project independence, SQL literal names, invalid-save atomicity, native import/export/cancellation, large clip roundtrip, video header/size/staging and queue cancellation/shutdown are covered. The existing 11-check Blender runtime/PNG export harness also passes.
- MediaPipe runtime: eight tests passed with real installed Python/model, actual video inference under offline proxy flags, and blank-video failure without a fabricated clip. See [motion evidence](phase15-motion-feasibility.md) for the official sample/model, hashes, installation, licenses and actual Blender skin-deformation measurements.
- Initial six Electron animation workflows passed: cubic source import and procedural preset; per-bone key/interpolation undo/redo; actual canvas motion/scrub/export; library across projects and native JSON export/import; explicit retarget mapping; real local video job producing changing tracks and a saved animated variant. Source SHA-256 remains unchanged. Open animation controls pass the existing axe serious/critical check.
- Independent reviews covered library/video IPC validation, SQL, filenames, model download origin/redirect restrictions, source/session identity, native roundtrip bounds, pipeline cancellation and renderer resource/pose handling. Regressions reproduce the asynchronous old-source/library-ID race and save recovery failure before fixes.

Final repository verification: `npm run typecheck`, `npm run lint` and `npm run build` passed. The full `npm run test:e2e` run passed all 46 cases in 3.0 minutes, including the six animation/video cases and all previous locale, projects, references, materials, paint and real Blender mesh/rig regressions. No external motion provider was contacted and no user video was uploaded.

A final native JSON roundtrip review also tightened the 4 MiB limit to encoded UTF-8 bytes in both renderer and main. The Unicode near-limit regression failed before this fix and then passed; all 14 schema/core cases passed afterward with the real Blender fixture enabled, and the final typecheck/lint/build passed again. The broader 100-test Node run had already passed without skips; this added regression brings the covered Node cases to 101. The independent library harness has one environment-dependent Windows symlink skip, with unconditional traversal/realpath coverage still passing.

## Limits

Presets are procedural cycles, not learned motion. Editing supports local joint TRS, LINEAR/STEP output, compatible single-skin embedded rigs and finite bounded clips; unsupported rigs/channels fail explicitly. Cubic editing uses resampled keys. Separate paint/animation drafts retain their own source versions; save one as a variant before starting another operation that should include it. Video capture estimates motion in place without reliable root travel, axial twist, fingers, facial animation or floor contact. Head/neck remain at rest. Model quality depends on visibility and camera conditions.
