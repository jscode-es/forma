# Phase 11: 12 GB texture engine feasibility

Inspected on 2026-11-14. Target: Windows, NVIDIA GeForce RTX 5070, 12,227 MiB VRAM, compute capability 12.0, driver 616.92.

## Decision

The inspected low-VRAM fork has a real CPU-offload implementation and its author reports a successful 12 GB RTX 3060 run. That establishes a useful candidate, but does not establish compatibility with this Windows/Blackwell machine. Do not expose an installable Forma texture plugin or mark real texture inference complete from this investigation. No models were downloaded, no licenses accepted, no environment installed, and no inference executed.

Primary candidate: [christophkogler/Hunyuan3D-2.1-low-vram-cli](https://github.com/christophkogler/Hunyuan3D-2.1-low-vram-cli), inspected at commit [`89827e5596bc534c98ae51e7abfc9fb78150064d`](https://github.com/christophkogler/Hunyuan3D-2.1-low-vram-cli/tree/89827e5596bc534c98ae51e7abfc9fb78150064d).

## Offload and outputs

The pinned [CLI](https://github.com/christophkogler/Hunyuan3D-2.1-low-vram-cli/blob/89827e5596bc534c98ae51e7abfc9fb78150064d/src/hunyuan3d/cli.py) constructs paint with six views, resolution 512 and `cpu_offload=True`. The pinned [multiview implementation](https://github.com/christophkogler/Hunyuan3D-2.1-low-vram-cli/blob/89827e5596bc534c98ae51e7abfc9fb78150064d/hy3dpaint/utils/multiview_utils.py) calls Diffusers `enable_model_cpu_offload()`, keeps DINO on CPU between calls, temporarily moves DINO to the execution device and releases its GPU cache afterward. This is component offload; it does not prove every activation fits in 12 GB.

The [paint pipeline](https://github.com/christophkogler/Hunyuan3D-2.1-low-vram-cli/blob/89827e5596bc534c98ae51e7abfc9fb78150064d/hy3dpaint/textureGenPipeline.py) generates albedo and packed metallic/roughness views, enhances and bakes them into an atlas. [MeshRender.save_mesh](https://github.com/christophkogler/Hunyuan3D-2.1-low-vram-cli/blob/89827e5596bc534c98ae51e7abfc9fb78150064d/hy3dpaint/DifferentiableRenderer/MeshRender.py) exports albedo, metallic and roughness. The normal renders are conditioning inputs. Although the generic OBJ writer accepts an optional normal texture, this call does not provide one. There is no generated normal or AO output in this path. Those maps would require separately validated geometric baking or user import and must retain that provenance.

OBJ output includes an OBJ, MTL, albedo JPG, metallic JPG and roughness JPG. GLB conversion uses `bpy`. The standalone `texture` CLI dispatch always selects OBJ; its internal function and the composite `generate` command support GLB. A future adapter must explicitly convert and verify embedded images rather than assume `texture` returns GLB. The pipeline also creates `white_mesh_remesh.obj` beside its input mesh: run against a copied mesh in the job directory to preserve originals.

No standalone, validated lighting-neutralization control was found. Do not advertise one based only on the model's material-generation description.

## Windows and Blackwell blockers

The pinned [README](https://github.com/christophkogler/Hunyuan3D-2.1-low-vram-cli/blob/89827e5596bc534c98ae51e7abfc9fb78150064d/README.md) defines Linux/NVIDIA support. Its RTX 3060 statement is upstream self-report, not a test performed here. The [bootstrap](https://github.com/christophkogler/Hunyuan3D-2.1-low-vram-cli/blob/89827e5596bc534c98ae51e7abfc9fb78150064d/bootstrap.sh) invokes Bash, `c++ -fPIC` and `.venv/bin`, and builds a CUDA rasterizer plus mesh-inpaint native extension. A Windows/MSVC build and runtime path require validation; this installer cannot be reused as a Windows installation recipe.

The pinned [dependency definition](https://github.com/christophkogler/Hunyuan3D-2.1-low-vram-cli/blob/89827e5596bc534c98ae51e7abfc9fb78150064d/pyproject.toml) requires Python 3.11, `torch>=2.5,<2.7` and the cu124 wheel index. Its [lock](https://github.com/christophkogler/Hunyuan3D-2.1-low-vram-cli/blob/89827e5596bc534c98ae51e7abfc9fb78150064d/uv.lock) resolves torch 2.6.0+cu124, diffusers 0.39.0, accelerate 1.14.0, cupy-cuda12x 13.6.0 and bpy 5.0.1. [PyTorch's 2.7 release announcement](https://pytorch.org/blog/pytorch-2-7/) introduces Blackwell support with CUDA 12.8. Consequently, the fork's locked runtime is unsuitable as a validated RTX 5070 runtime; changing it creates a new dependency combination requiring testing. The local CUDA 13 compiler does not repair older PyTorch wheels.

Read-only local checks found CUDA toolkit `nvcc.exe` at version-directory `v13.0`; default Python 3.13.7 has torch 2.8.0+cpu (`torch.version.cuda=None`, `torch.cuda.is_available()=False`, no compiled CUDA architectures) and lacks diffusers, accelerate, bpy, cupy-cuda12x and huggingface-hub. `uv python list --only-installed --offline` also found Python 3.11.9/3.11.15 interpreters. This checks the default interpreter only, not every existing plugin environment. No paint-ready environment was established. [PyPI's bpy 5.0.0 metadata](https://pypi.org/pypi/bpy/5.0.0/json) does include Python 3.11 Windows wheels; bpy/Python compatibility alone is not a demonstrated blocker.

## Pins, licensing and offline boundary

The CLI pins Hunyuan weights to [`0b94677654c57bb9a6b6845cd7b704ccf551d327`](https://huggingface.co/tencent/Hunyuan3D-2.1/tree/0b94677654c57bb9a6b6845cd7b704ccf551d327) and DINO to [`611a9d42f2335e0f921f1e313ad3c1b7178d206d`](https://huggingface.co/facebook/dinov2-giant/tree/611a9d42f2335e0f921f1e313ad3c1b7178d206d). Hugging Face blob metadata supplies these advertised LFS SHA-256 values; the binaries were not downloaded or independently hashed:

| Asset | Bytes | Advertised SHA-256 |
| --- | ---: | --- |
| Paint image_encoder/model.safetensors | 1264217240 | ae616c24393dd1854372b0639e5541666f7521cbe219669255e865cb7f89466a |
| Paint text_encoder/pytorch_model.bin | 1361671895 | c3e254d7b61353497ea0be2c4013df4ea8f739ee88cffa0ba58cd085459ed565 |
| Paint unet/diffusion_pytorch_model.bin | 3925293863 | 675a1b5cd0098b2002637c443946529c03c5cd54427f40245263350feb3dd5b8 |
| Paint vae/diffusion_pytorch_model.bin | 334707217 | 1b4889b6b1d4ce7ae320a02dedaeff1780ad77d415ea0d744b476155c6377ddc |
| DINO model.safetensors | 4546005432 | 917d3c470db999d32a312f8542149be91c7cbac61ee8fb4b67ae3d82b79ce21f |

Metadata endpoints: [Hunyuan](https://huggingface.co/api/models/tencent/Hunyuan3D-2.1/revision/0b94677654c57bb9a6b6845cd7b704ccf551d327?blobs=true), [DINO](https://huggingface.co/api/models/facebook/dinov2-giant/revision/611a9d42f2335e0f921f1e313ad3c1b7178d206d?blobs=true). A complete manifest would additionally need config/tokenizer files and the chosen DINO format; this table is not an installation manifest.

The third required checkpoint is [RealESRGAN_x4plus.pth, release v0.1.0](https://github.com/xinntao/Real-ESRGAN/releases/tag/v0.1.0). Its GitHub asset metadata reports 67,040,989 bytes and no digest. A release URL is not a verified checksum. No weight download was permitted for this investigation, so that integrity requirement remains open.

The pinned [Tencent 2.1 license](https://github.com/christophkogler/Hunyuan3D-2.1-low-vram-cli/blob/89827e5596bc534c98ae51e7abfc9fb78150064d/LICENSE) excludes the EU, UK and South Korea from its grant. Existing acceptance for Hunyuan 2.0 cannot represent acceptance or authorization for 2.1. [DINO's model card](https://huggingface.co/facebook/dinov2-giant/blob/611a9d42f2335e0f921f1e313ad3c1b7178d206d/README.md) identifies Apache-2.0; [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN/blob/master/LICENSE) uses BSD-3-Clause. Licensing must be resolved explicitly before inference in the user's territory.

The fork's local paths and separate `models pull` command help, but its multiview loader still contains a `snapshot_download` fallback and does not pass `local_files_only=True`. A Forma adapter must enforce offline environment flags, require complete local assets, pin all executable model code, fail before imports when assets are missing, and test with network denied. Do not invoke `models pull` from a job.

## Next validation gate

1. Resolve the 2.1 license and authorize any model download separately.
2. Produce an isolated Python 3.11 Windows dependency lock with a Blackwell-capable torch/CUDA combination, then build and import both native extensions using the corresponding toolchain. Retain all exact package versions and hashes.
3. Complete the explicit model manifest and obtain a trustworthy Real-ESRGAN checksum. Require local assets and test the missing-asset failure with networking denied.
4. Execute paint against copied imported and generated meshes, including a mesh without UVs. Measure peak VRAM, peak RAM, elapsed time and failure behavior on the actual RTX 5070 at six views/512 before increasing settings.
5. Inspect actual albedo/metallic/roughness image data and UVs, convert to GLB, reload it in Forma and verify embedded textures. Preserve the parent mesh and report absent normal/AO maps accurately.

No wrapper contract tests were added because no engine wrapper or installable manifest is being shipped. Mocked wrapper tests, if added during a later adapter implementation, will not satisfy the real-inference gate.
