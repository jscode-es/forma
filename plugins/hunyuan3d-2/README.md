# Hunyuan3D 2.0 engine plugin

Image to 3D geometry with [Tencent Hunyuan3D 2.0](https://github.com/Tencent-Hunyuan/Hunyuan3D-2) (DiT 2.0, fp16) and background removal with [BiRefNet](https://huggingface.co/ZhengPeng7/BiRefNet).

The plugin code in this folder is MIT, like Forma. **Hunyuan3D code and weights are not part of Forma**: the installer downloads them under the Tencent Hunyuan 3D 2.0 Community License, which does not apply in the European Union, the United Kingdom or South Korea. Install it only if you have the right to use it.

## Requirements

- NVIDIA GPU with CUDA and at least 8 GB of VRAM
- Python 3.11 and Git
- About 3 GB for the Python environment and 5.4 GB for the weights

## Install

```bash
npm run plugin:install -- hunyuan3d-2 --accept-license
```

Options:

- `--python <path>`: reuse an existing Python 3.11 environment that already has the packages of `requirements.txt` instead of creating `.venv`.
- `--data-dir <path>`: Forma data folder, if it is not the default one.

Then open Forma → Models and download **Hunyuan3D DiT 2.0** and **BiRefNet** (license acceptance is required). Select "Hunyuan3D 2.0" in Create → Generation engine.

## Parameters

| Parameter | Default | Notes |
| --- | --- | --- |
| Steps | 30 | Quality presets set 15 / 30 / 50 |
| Guidance (CFG) | 5 | |
| Surface resolution | 380 | Marching cubes grid; 512 needs more VRAM and time |
| Seed | 42 | Same inputs and seed reproduce the result |
| Remove background | on | Only when the image has no transparency |

Pinned versions: code `f8db630`, weights `tencent/Hunyuan3D-2@9cd649b`, BiRefNet `ZhengPeng7/BiRefNet@e2bf8e4`.
