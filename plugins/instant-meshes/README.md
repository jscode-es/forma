# Instant Meshes retopology

Rebuilds one static mesh as quads on CPU using Instant Meshes and generates UVs with XAtlas, independently of Blender. Activate it in Models > Engines. Python 3.11 and Windows x64 are required; no GPU or account is needed.

Activation installs pinned Python dependencies and downloads the official Windows archive. Both archive and executable are verified against SHA-256 before use. The binary is downloaded only during activation; jobs verify the local executable and never download files.

- Archive: https://instant-meshes.s3.eu-central-1.amazonaws.com/Release/instant-meshes-windows.zip
- Archive SHA-256: `c9f6217e83ea90f98a8cd54cf82dac88420df20cf197e7a4ef2bef81c5ae068d`
- Executable SHA-256: `f1fe5b5f56d1002ae61dbd76a3fd646229fc1fe15322e7a3744f8ce442c76b2d`
- Reviewed source: `wjakob/instant-meshes@7b3160864a2e1025af498c84cfed91cbfb613698`. The upstream binary does not identify its source revision; the executable hash pins this integration.
- Instant Meshes: BSD-3-Clause, see LICENSE.txt. XAtlas and trimesh: MIT. NumPy: BSD-3-Clause.

## Use

Import or generate an untextured static GLB, then open Create 3D > Model > Automatic retopology. Set a quad-face budget between 128 and 100000 and preview the result. Apply it in Versions to make it active. Existing meshes, textures and rigs remain unchanged when an unsupported request fails.

The target is approximate in Instant Meshes. Forma retries lower targets and refuses to publish a result above the requested maximum; it does not fall back to Blender or decimation. GLB stores triangles, up to twice the verified quad count. Simple material factors and world placement are preserved; UVs are regenerated. Textures, vertex colors, morph targets, skins, animation, extensions and multiple meshes/materials are rejected before remeshing. Inspect silhouette and topology before applying the preview.

The upstream Windows optimizer can occasionally stop without consuming CPU. Forma monitors its own child process and retries the same operation when neither CPU time nor output changes for five seconds, with at most three starts per face target. CPU-active operations are not treated as stalled. A run is limited to 480 seconds and cancellation also kills the child through Forma's job queue.

Contributor validation, in a Python 3.11 environment:

```bash
python -m pip install -r plugins/instant-meshes/requirements.txt
python plugins/instant-meshes/setup_runtime.py
python plugins/instant-meshes/test_engine.py
```

Linux and macOS are marked incompatible in this integration until their own binaries are pinned and tested. Other Blender operations remain available through the separate Blender engine.

Reference run: a translated 1280-triangle sphere with a 256-quad budget produced 212 quads / 424 exported triangles, valid 512-pixel-atlas UVs and preserved simple material factors. The source SHA-256 was unchanged. This passed in a fresh CPU-only Python environment. See [validation evidence](../../docs/superpowers/evidence/instant-meshes-retopology.md).
