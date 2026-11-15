# MV-Adapter multi-view engine plugin

Text to multi-view with [MV-Adapter](https://github.com/huanngzh/MV-Adapter) (ICCV 2025) on [Stable Diffusion XL 1.0](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0). One diffusion pass produces the **front, right, back and left** views of the same object at 768 × 768, so a multi-view image-to-3D engine such as Hunyuan3D 2 MV receives consistent references. The top view is not generated: MV-Adapter is trained at zero elevation.

The plugin code in this folder is MIT, like Forma. **The weights are not part of Forma**: MV-Adapter code and adapter weights use Apache-2.0, SDXL weights use CreativeML Open RAIL++-M, Qwen3-1.7B uses Apache-2.0, and BiRefNet and the SDXL VAE fp16 fix use MIT.

## Requirements

- NVIDIA GPU with CUDA and at least 8 GB of VRAM. With model CPU offload the measured peak is 6.8 GB on an RTX 5070 12 GB.
- Python 3.11 and the shared `torch-cu128` runtime
- About 20 GB for the weights. SDXL text encoders, Qwen3 and BiRefNet are shared with SDXL-Lightning and downloaded only once.
- About 10 GB of available RAM for the CPU prompt model, which is released before SDXL loads

## Activate

In Forma open **Models → Engines** and click **Activate** on MV-Adapter multi-view. From the command line (contributors):

```bash
npm run plugin:install -- mv-adapter --accept-license
```

Then, in **From text**, turn on **Multi-view**, write the prompt and generate. Pick a view set to fill the front, right, back and left slots of **Multi-view**.

## How it works

1. Qwen3-1.7B on CPU translates the object request and the shared visual style into a short English prompt.
2. MV-Adapter (`mvadapter_t2mv_sdxl`) on the SDXL 1.0 UNet renders four orthographic views at azimuths 0°, 90°, 180° and 270° in 30 steps with guidance 7. Azimuth 90° is the viewer's right when facing the front.
3. BiRefNet removes the background, so every view is a PNG with a real alpha channel.

Only `mvadapter/` from MV-Adapter is checked out, pinned to commit `4277e0018232bac82bb2c103caf0893cedb711be`. Its texturing utilities (nvdiffrast, CV-CUDA) are not imported.

## Parameters

| Parameter | Default | Notes |
| --- | --- | --- |
| View sets | 1 | Sets of four views; set *n* uses seed + *n* |
| Seed | 42 | Same seed and prompt give the same views |
| Visual style | shared | The style from the From text gear, shared with SDXL-Lightning |

## Measured

RTX 5070 12 GB, Windows: 28 s for one set of four views after loading, 6.8 GB VRAM peak.
