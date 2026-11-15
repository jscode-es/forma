# SDXL-Lightning engine plugin

Text to image in 4 steps with [ByteDance SDXL-Lightning](https://huggingface.co/ByteDance/SDXL-Lightning) on [Stable Diffusion XL 1.0](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0) (fp16). Forma uses it for the first step of text to 3D: it produces up to four candidate images, you pick one and it becomes the reference for an image-to-3D engine.

The plugin code in this folder is MIT, like Forma. **The weights are not part of Forma**: SDXL weights use CreativeML Open RAIL++-M, and the local Qwen3-1.7B prompt model uses Apache-2.0.

## Requirements

- NVIDIA GPU with CUDA and at least 8 GB of VRAM
- Python 3.11
- About 3 GB for the Python environment and 12 GB for the weights
- About 10 GB of available RAM for the CPU prompt model, which is released before SDXL loads

## Activate

In Forma open **Models → Engines** and click **Activate** on SDXL-Lightning. Review the requirements and license, accept them and Forma creates the Python environment, verifies it and downloads the weights. You can choose an existing Python environment instead, for example the one of Hunyuan3D 2.0, as long as it has the packages of `requirements.txt`.

From the command line (contributors):

```bash
npm run plugin:install -- sdxl-lightning --accept-license
```

Then, in Create reference → From text → Prompt, select "SDXL-Lightning" as the image engine.

## Parameters

| Parameter | Default | Notes |
| --- | --- | --- |
| Images | 4 | Candidates per prompt; candidate *n* uses seed + *n* |
| Seed | 42 | Same prompt and seed reproduce the images |
| Isolated object on a plain background | on | Adds framing words that help image-to-3D engines |

The 4-step UNet runs without classifier-free guidance, so there is no negative prompt. Images are 1024×1024.

## Local prompt preparation

The gear beside SDXL's help button opens a shared visual-style prompt (up to 2000 characters) with a live character counter. The object request and style are processed separately: Qwen translates the object into English, then extracts a short list of appearance attributes from the style. Scenery, dioramas, props and extra subjects are not style attributes. The subject stays first and only the style is shortened when needed to fit both SDXL text encoders, preserving the requested object and framing.

Qwen3-1.7B runs on CPU through the existing Transformers runtime, with thinking disabled and bounded output. No llama.cpp or Ollama server is required. Its model files are pinned to `Qwen/Qwen3-1.7B@70d244cc86ccca08cf5af4e1e306ecf908b1ad5e` and verified by SHA-256. Original prompts and full shared styles remain in job history; the final effective image prompt is logged. Reusing a history entry restores its recorded style.

## Real transparent output

After generating RGB drafts, Forma releases SDXL and loads BiRefNet to remove the background locally. Only RGBA PNG candidates are published; the temporary RGB drafts are removed. BiRefNet weights and custom model code are pinned to `ZhengPeng7/BiRefNet@e2bf8e4460fc8fa32bba5ea4d94b3233d367b0e4` under MIT, sharing the existing background-removal files when installed. Jobs force offline Hugging Face/Transformers operation. No generation-time download occurs.

The worker rejects empty or opaque masks. Main also validates every text-to-image candidate before marking a job successful: PNG format, bounded dimensions and file size, decoded alpha, and at least 1% transparent plus 1% opaque pixels. An opaque checkerboard is rejected. The viewer's checkerboard is only UI decoration, not part of the PNG. Prompting alone cannot produce real transparency with this SDXL checkpoint.

Updating an existing engine requires the BiRefNet files if they are not already installed. The new dependency list includes torchvision, timm, einops and kornia; all versions are pinned. The original model weights are reused. Style and identity remain image-model predictions, so inspect the candidates before using them as references.

Pinned versions: `stabilityai/stable-diffusion-xl-base-1.0@4621659` (text encoders, tokenizers, VAE and UNet config) and `ByteDance/SDXL-Lightning@c9a24f4` (`sdxl_lightning_4step_unet.safetensors`).
