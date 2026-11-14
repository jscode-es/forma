# Phase 12 Blender mesh engine evidence

Date: 2026-11-14. Executable: `C:/Program Files/Blender Foundation/Blender 5.2/blender.exe`, Blender 5.2.1 LTS, hash `9e2066aef7ef` (2026-08-25).

## Reproduction

```powershell
$env:FORMA_BLENDER_EVIDENCE = Join-Path $env:TEMP 'forma-phase12-blender'
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --factory-startup --python-exit-code 1 --python engines/blender-mesh/test_engine.py *> $env:TEMP/forma-blender-tests.log
exit $LASTEXITCODE
```

`FORMA_BLENDER_EVIDENCE` is optional. It retains original fixture GLBs, output GLBs, reports, the baked PNG and UV template in a directory per test. Without it the suite removes its temporary files. JSONL protocol is exercised by launching separate real Blender processes for success and error cases, not by mocking `bpy`.

Measured suite: 15 tests passed, including the following actual geometry and output checks:

- Closed cube inspection: 8 geometric vertices, 18 edges, 12 triangulated faces, 12 triangles, 0 degenerates, 0 boundary/non-manifold edges, 1 component. Unrelated sphere and Blender startup objects do not affect the report. Original bytes remain unchanged.
- Deliberately open/disconnected/non-manifold fixture: 2 components, 1 collinear degenerate face, 9 boundary edges, 10 non-manifold edges (boundary edges included).
- A triangle with two coincident positions remains counted as one degenerate face; degeneracy and face counts are measured before diagnostic seam welding can remove collapsed faces.
- QuadriFlow sphere: source 960 triangles, target 256 quad faces; observed 198 quad faces / 396 exported triangles in one run. QuadriFlow counts vary slightly between runs. Every candidate must satisfy actual quad count <= budget and exported triangle count <= 2 * budget. Plain PBR roughness 0.27 survives the real GLB roundtrip. This operation uses QuadriFlow, not decimation.
- Cube UV regeneration: packed UVs remain within [0,1], GLB has TEXCOORD_0, PNG has the requested 512x512 dimensions and more than 500 visible line pixels when reopened through Blender's image decoder.
- CPU Cycles selected-to-active tangent normal bake: low sphere 224 triangles, high sphere 960 triangles with sinusoidal displacement. Observed RGB normal variation 0.40392157435417175. Exported GLB contains a normalTexture and embedded image bufferViews; that texture records `extras.formaMapSources.normal = "baked"`. A high source translated 100 units is rejected before baking.
- Recalculation starts from an inverted cube. Reimported candidate has positive volume and outward corner normals; unrelated objects are excluded.
- Real exported armature skin and shape-key target fixtures are rejected before modification. Textured UV regeneration, invalid parameter ranges and external image URIs are rejected.

## Contract

Manifest: `engines/blender-mesh/forma-engine.json`, id `forma-blender-mesh`, runtime `blender`, entry `main.py`. Tasks: `mesh-inspect`, `retopology`, `uv-unwrap`, `normals`.

Parameters: `faceBudget` integer 128..2000000 (default 10000; quad faces), `resolution` enum strings `512`, `1024`, `2048`, `4096` (default `1024`), `mode` enum `recalculate` / `bake` (default `recalculate`). Bake input order is low target then high source. Other operations require exactly one GLB. Input files are read, output files are written exclusively to the job output directory.

Inspection publishes only `report.json` (`mesh-report`). Modifications publish `model.glb` (`model`) plus the report; unwrap also publishes `uv-template.png` (`uv-template`). The baked PNG is embedded into GLB; it is not an additional published model.

Report shape:

```json
{
  "version": 1,
  "task": "retopology",
  "source": {
    "vertices": 482, "edges": 1440, "faces": 960, "triangles": 960,
    "degenerateFaces": 0, "boundaryEdges": 0, "nonManifoldEdges": 0, "components": 1
  },
  "result": {
    "vertices": 200, "edges": 396, "faces": 198, "triangles": 396,
    "degenerateFaces": 0, "boundaryEdges": 0, "nonManifoldEdges": 0, "components": 1
  },
  "warnings": ["uv-regenerated", "topology-rebuilt"],
  "details": {"method": "quadriflow", "faceBudget": 256, "quadFaces": 198, "resolution": 1024, "uvBoundsVerified": true}
}
```

`source`/`result` counts use geometric vertices welded at a size-relative tolerance to avoid treating glTF UV/normal seams as open borders. Welding happens in a temporary BMesh used for inspection and does not modify the source mesh. Separate input mesh objects are counted as separate components even when their surfaces coincide. `result.faces` describes Blender polygons; `result.triangles` is checked against actual exported glTF indices. A GLB triangulates QuadriFlow quads.

Warnings: `uv-regenerated`, `topology-rebuilt`, `normal-map-replaced`, `custom-normals-recalculated`.

## Limits and guards

- Modifications reject skins, morph targets and animation tracks. Inspection remains read-only. External GLB image/buffer URIs are rejected before Blender import; embedded/data resources are supported.
- UV regeneration rejects textured/node-coordinate/vertex-color materials and color attributes. Retopology also rejects multiple materials or mixed assigned/unassigned materials. Plain PBR material is reapplied to the remesh. Color baking is not implemented; unsupported materials produce an explicit error, never a silently untextured published candidate.
- QuadriFlow can fail on difficult topology or fail to reach the budget. Up to three real remesh attempts use lower targets; exceeding the budget fails the job. No decimation fallback is used. It can change silhouette and component topology; preview review remains necessary.
- UVs use Blender Smart UV Project followed by a shared AABB/cardinal packing pass with a 4-pixel fractional margin. AABB packing avoids a reproduced Blender 5.2 headless stall in the default concave packer. The template rasterizes actual polygon UV edges on CPU to avoid the native PNG exporter's GPUOffScreen dependency. It is a line template with transparent background.
- Normal bake requires one mesh target with an existing UV layer. Multiple high-source mesh objects are supported. Existing low UV/material channels are retained; existing normal input is intentionally replaced and reported. CPU Cycles uses 5% cage extrusion, 10% ray distance and 8-pixel bake margin. Low/high retain their imported transforms and are never independently normalized.
- `sampleSurfaceCoverage` measures proximity of sampled target vertices to high geometry, not exact texture coverage. Distant sources are rejected, but partial intersections, cage artifacts, overlapping UVs and missed rays still require preview inspection. Normal variation is measured from real bake pixels; it is not a universal quality score. Recalculation cannot infer a unique outside for an open surface.
- Blender emits upstream deprecation warnings for `Material.use_nodes` (scheduled for Blender 6.0 removal); tests run against the requested installed Blender 5.2.
- Reproducible Electron checks: `node tests/electron/blender-runtime.test.cjs` passes 11 runtime/export checks, including real executable discovery, missing/invalid executable handling, PNG checksum, traversal, wrong status/kind, malformed PNG, dimensions and cancelled save dialogs.
- Queue regressions: `node --test tests/electron/job-queue.test.cjs` passes six checks for cancellation/shutdown during engine discovery and runtime resolution, concurrent enqueue startup reservation and child exit after shutdown. The first three tests failed before the synchronous startup reservation fix.
- Repository checks: `npm run typecheck`, `npm run lint` and `npm run build` pass. The Node contract/material/reference suites pass 23 tests.
- Full `npm run test:e2e`: 29 passed in 1.5 minutes, including four real Blender workflows: inspection without model mutation, QuadriFlow preview/apply, UV unwrap with PNG export before/after applying, outward normals and detailed-source normal bake. Source fixture SHA-256 remains unchanged; bake output contains an embedded normal map with recorded provenance. Existing material, reference, persistence, export, accessibility and performance workflows also pass.
- Security review: new main IPC channels validate argument types and bounds, preload exposes named calls, executable invocation uses argument arrays without a shell, and UV export requires a successful exact result with real-path containment, decoded PNG validation and post-write checksum. No new blocking findings remain in this scope.
