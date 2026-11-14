# Phase 14: Blender rig engine evidence

Verified on Windows with Blender 5.2.1 LTS, installed at `C:/Program Files/Blender Foundation/Blender 5.2/blender.exe`.

Command:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --factory-startup --python-exit-code 1 --python engines/blender-rig/test_engine.py
```

Result: 6 tests passed in 14.173 seconds. The real connected, closed voxel-remeshed T-pose humanoid receives Blender ARMATURE_AUTO heat weights: 19 bones, 5,828 weighted vertices, zero unweighted vertices. Reimported GLB has finite normalized weights with at most four bone influences; rotating LeftUpperArm deforms actual evaluated mesh vertices by more than 0.05 model units. Materials, UV presence and triangle counts are verified. Source bytes remain unchanged.

Rest-joint editing maps boneIndex through source skins[0].joints and a unique source node name. The edited head moves by the requested normalized height delta. Original weights survive unchanged. Blender recalculates inverse-bind matrices; its exported joint transforms and inverse-bind matrices are transplanted into the original GLB document/buffer, preserving original geometry, UVs, materials, skin weights and animation sampler payloads. Parent hierarchy and root transforms must remain compatible. This avoids Blender's ordinary reexport introducing UV/normal vertex splits or extra animation channels.

A real Wave clip (LeftUpperArm quaternion keys at frames 1 and 20) remains animated after edit/preserve. Tests compare exact clip target/path signatures and evaluate distinct bone matrices at both frames. Edit/discard removes animations explicitly. Replacing an existing or animated skeleton requires clipPolicy=discard. The subprocess protocol test exercises the main.py entry point, progress/results, rig-report output and nonzero errors using --python-exit-code 1.

Portable fixture helpers in test_engine.py: create_humanoid(path) and create_animated_rig(path). The latter resets Blender's scene and exports an actual animated skinned GLB. No binary fixture or installed package is required.

Contract: engine forma-blender-rig; task rig; one model, zero images. mode auto/edit; clipPolicy preserve/discard; boneIndex integer 0..255; offsetX/Y/Z in [-0.5,0.5] times model height. All 19 guide names expose X/Y/Z numeric parameters: X/Z [-0.75,0.75], Y [-0.1,1.1]. Coordinates are glTF Y-up, +Z front, converted to Blender (x,-z,y); guides use bbox width/height/depth, centered X/Z and bottom-relative Y. Output model.glb (model), rig-report.json (rig-report), report version 1.

Explicit guards/errors include invalid-parameter:<name>, invalid-guide-order, invalid-bone-length, invalid-model-bounds, auto-rig-requires-discard, existing-rig-required, bone-index-out-of-range, ambiguous-joint-names, multiple-rigs-unsupported, unsupported-joint-count, external-resources-unsupported, embedded-buffer-required, unsupported-gltf-extensions, morph-targets-unsupported, triangle-mesh-required, unsupported-animation-channel, ambiguous-clip-names, joint-mapping-failed, rig-hierarchy-preservation-failed, invalid-inverse-bind-matrices, invalid-skin-weights, unsupported-skin-weights, unweighted-vertices, heat-weighting-failed, clip-preservation-verification-failed, mesh-preservation-verification-failed and uv-preservation-verification-failed. Unsupported glTF extensions are rejected conservatively, including material extensions. There is no fabricated weighting fallback.

The Blender importer creates a mesh custom shape for bone display; the engine excludes all armature custom-shape references from imported target meshes and export selection. The engine never exports unrelated preexisting scene objects.

Final repository checks: `npm run typecheck`, `npm run lint` and `npm run build` pass. The coordinating agent independently reran the six final real Blender tests (13.659 seconds, all passed).


Independent review found a Blender importer repair hazard: zero-sum source weights are silently assigned to the first joint before Python vertex-group inspection. A regression first failed with `ValueError not raised` after setting the first source WEIGHTS_0 tuple to zero (6 tests, 1 failure, 13.227 seconds). After adding raw accessor validation before import, all 6 tests pass (14.173 seconds), including the previously failing case. Raw JOINTS_0/WEIGHTS_0 now require matching vertex counts, four influences, valid joint indices, finite nonnegative normalized weights, and no sparse/extra influence sets. This prevents importer repairs from concealing invalid source data.

Edit preservation intentionally rejects incompatible bind/rest representations: skinned mesh world transforms and nonjoint ancestor transforms must be identity; every source joint world matrix multiplied by its inverse-bind matrix must be identity within 0.0001. A fixture changing source root-joint translation while retaining the original inverse bind is rejected as unsupported-bind-pose; a fixture translating the skinned mesh node is rejected as unsupported-skinned-transform. Additional errors are unsupported-skin-accessor and invalid-skin-accessor. These conservative guards prevent Blender retargeting/baking geometry while the engine preserves the original vertex buffer. Generated auto rigs remain editable and the real animated clip preserve/discard tests still pass.

Renderer review (read-only): selected-joint poses modify real Bone quaternions, restore captured rest TRS on reset/source change, and never recompute inverse binds. Weight visualization clones and disposes temporary geometry/materials, then restores the source geometry and material mapping. Session/variant readiness checks prevent stale rig metadata; jobs retain and release the exact source parent, including async session guards. No blocking renderer findings.

## Application verification

- Node suites: 54 tests passed, including two rig contract checks and seven real Three.js rig checks alongside existing paint, project-flow, mesh, material and reference regressions. Rig checks cover GLB joint-order metadata, actual skin deformation/reset, correct skeleton-to-source-joint weight mapping, geometry/material restoration, rest bounds, bone-texture disposal and paint/weight priority.
- `npx playwright test tests/e2e/rig.spec.ts`: four real Blender/Electron workflows passed in 34.9 seconds after the final raw-weight/bind guards. Adjustable pelvis X is passed into the real job; all exported vertex weights sum to one, the preview has 19 joints and source SHA-256 remains unchanged. Canvas snapshots change for pose and weight visualization; reset clears the local pose. Rest editing preserves original POSITION arrays, exports a valid skin, and clip-preserve retains exact animation JSON while explicit discard removes it. Open rig controls pass the existing axe serious/critical accessibility check.
- The 36 preexisting Electron workflows also passed (1.9 minutes): materials, painting, actual Blender mesh jobs, reference views/drop/projection, text generation, project persistence/export, Spanish system-language preference, accessibility and performance. This covers 40 Electron cases across the regression and final rig runs.
- Independent review identified the raw zero-weight importer-repair hazard, reproduced a failing case and verified its fix. Review of the final preflight, source/session parent protection and existing validated IPC found no remaining blocking issue within the documented input limits. No new IPC channel or renderer privilege was introduced.
