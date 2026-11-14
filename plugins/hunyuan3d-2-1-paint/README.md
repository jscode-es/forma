# Hunyuan3D Paint 2.1 PBR engine plugin

Textures generated and imported meshes with [Tencent Hunyuan3D-Paint 2.1](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1): it renders the mesh from six views, generates **albedo** and **metallic/roughness** for each view from one reference image, and bakes them into a UV atlas embedded in the GLB. [Delight](https://huggingface.co/tencent/Hunyuan3D-2/tree/main/hunyuan3d-delight-v2-0) can neutralize the lighting and shadows of the reference first.

The plugin code in this folder is MIT, like Forma. **Hunyuan3D code and weights are not part of Forma**: the installer downloads them under the Tencent Hunyuan 3D 2.1 and 2.0 Community Licenses, which do not apply in the European Union, the United Kingdom or South Korea. DINOv2 is Apache 2.0. Install it only if you have the right to use it.

## Requirements

- NVIDIA GPU with CUDA and at least 10 GB of VRAM
- Python 3.11 and Git
- CUDA toolkit and a C++ compiler (MSVC Build Tools on Windows) to build the rasterizer, unless you reuse an environment that already has `custom_rasterizer`
- About 4 GB for the Python environment and 14.5 GB for the weights (Paint 5.6 GB, DINOv2 4.5 GB, Delight 4.3 GB; Delight is optional)

## Activate

In Forma open **Models → Engines** and click **Activate** on Hunyuan3D Paint 2.1 PBR. Forma downloads the pinned code of Hunyuan3D 2.0 (renderer) and 2.1 (Paint), creates the Python environment, builds the rasterizer, verifies it and downloads the weights. You can choose an existing Python environment instead, for example the one of Hunyuan3D 2.0 when it already has `custom_rasterizer` and the packages of `requirements.txt`.

From the command line (contributors):

```bash
npm run plugin:install -- hunyuan3d-2-1-paint --accept-license
```

Then, in **Create 3D → Finish → AI texture**, select the engine and the reference.

## Parameters

| Parameter | Default | Notes |
| --- | --- | --- |
| Steps | 15 | Diffusion steps of Paint |
| Guidance (CFG) | 3 | |
| Atlas resolution | 1024 | 512, 1024 or 2048 px; views render at up to 1024 px |
| Face limit before painting | 40,000 | Larger meshes are reduced first; 0 paints the mesh as is |
| Neutralize the reference lighting | on | Runs Delight on the reference; needs its optional weights |
| Seed | 42 | Same inputs and seed reproduce the textures |

Reference run on an RTX 5070 (12 GB): a Hunyuan3D 2.0 mesh of 700,966 faces reduced to 40,000, Delight on, 15 steps, 1024 px atlas, 173 s in total.

The UVs are regenerated with xatlas, so existing textures of the mesh are replaced. The result keeps the albedo in sRGB and packs metallic (B) and roughness (G) into the glTF `metallicRoughnessTexture`. Normal and ambient occlusion maps are not generated.

Pinned versions: code `Hunyuan3D-2@f8db630` and `Hunyuan3D-2.1@82920d6`, weights `tencent/Hunyuan3D-2.1@0b94677`, `facebook/dinov2-giant@611a9d4` and `tencent/Hunyuan3D-2@9cd649b` (Delight).
