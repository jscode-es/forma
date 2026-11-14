# SDXL-Lightning engine plugin

Text to image in 4 steps with [ByteDance SDXL-Lightning](https://huggingface.co/ByteDance/SDXL-Lightning) on [Stable Diffusion XL 1.0](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0) (fp16). Forma uses it for the first step of text to 3D: it produces up to four candidate images, you pick one and it becomes the reference for an image-to-3D engine.

The plugin code in this folder is MIT, like Forma. **The weights are not part of Forma**: the app downloads them under the CreativeML Open RAIL++-M License, which allows commercial use but forbids the uses listed in its Attachment A.

## Requirements

- NVIDIA GPU with CUDA and at least 8 GB of VRAM
- Python 3.11
- About 3 GB for the Python environment and 7 GB for the weights

## Activate

In Forma open **Models → Engines** and click **Activate** on SDXL-Lightning. Review the requirements and license, accept them and Forma creates the Python environment, verifies it and downloads the weights. You can choose an existing Python environment instead, for example the one of Hunyuan3D 2.0, as long as it has the packages of `requirements.txt`.

From the command line (contributors):

```bash
npm run plugin:install -- sdxl-lightning --accept-license
```

Then, in Create 3D → Create → Prompt, select "SDXL-Lightning" as the image engine.

## Parameters

| Parameter | Default | Notes |
| --- | --- | --- |
| Images | 4 | Candidates per prompt; candidate *n* uses seed + *n* |
| Seed | 42 | Same prompt and seed reproduce the images |
| Isolated object on a plain background | on | Adds framing words that help image-to-3D engines |

The 4-step UNet runs without classifier-free guidance, so there is no negative prompt. Images are 1024×1024.

Pinned versions: `stabilityai/stable-diffusion-xl-base-1.0@4621659` (text encoders, tokenizers, VAE and UNet config) and `ByteDance/SDXL-Lightning@c9a24f4` (`sdxl_lightning_4step_unet.safetensors`).
