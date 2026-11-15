# SDXL-Lightning engine plugin

Text to image in 4 steps with [ByteDance SDXL-Lightning](https://huggingface.co/ByteDance/SDXL-Lightning) on [Stable Diffusion XL 1.0](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0) (fp16). Forma uses it for the first step of text to 3D: it produces up to four candidate images, you pick one and it becomes the reference for an image-to-3D engine.

The plugin code in this folder is MIT, like Forma. **The weights are not part of Forma**: SDXL weights use CreativeML Open RAIL++-M, and the local Qwen3-1.7B prompt model uses Apache-2.0.

## Requirements

- NVIDIA GPU with CUDA and at least 8 GB of VRAM
- Python 3.11
- About 3 GB for the Python environment and 11 GB for the weights
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

The gear beside SDXL's help button opens a shared visual-style prompt (up to 256 characters). Forma persists it on this computer and snapshots it into each job's `stylePrompt` parameter. The worker combines the object and style before English prompt preparation; an empty style leaves the normal object workflow unchanged. Reusing a history entry restores its recorded style. This guides aesthetics; it does not guarantee identical rendering across seeds or subjects.

Before generating candidates, Qwen3-1.7B rewrites the description into a concise English visual prompt, preserving the main object and requested attributes. For example, an origin/style adjective in `Jarron chino` should describe the vase rather than introduce a person. The model runs on CPU through the existing Transformers runtime, with thinking disabled and bounded output. No llama.cpp or Ollama server is required. Its model files are pinned to `Qwen/Qwen3-1.7B@70d244cc86ccca08cf5af4e1e306ecf908b1ad5e` and verified by SHA-256.

The original request stays in project history; the effective image prompt is recorded in the job log. Invalid or truncated rewrites fail before loading SDXL. Preparation adds CPU work but no generation-time network access. It improves the supplied description, not a guarantee of image-model adherence. Updating an existing engine also requires the Qwen model weights; the existing SDXL weights are reused.

Pinned versions: `stabilityai/stable-diffusion-xl-base-1.0@4621659` (text encoders, tokenizers, VAE and UNet config) and `ByteDance/SDXL-Lightning@c9a24f4` (`sdxl_lightning_4step_unet.safetensors`).

Local evaluation on this workstation (CPU, FP32): the final instruction rewrote `Jarron chino` to `Chinese vase`, kept `LUNA` lettering and an explicitly requested person, and retained vase/chair/bottle subjects in seven examples. Preparation took roughly 7?14 seconds in preliminary runs and left about 6 GB of process working set. This is a small smoke evaluation, not a semantic guarantee: attributes can still be lost or altered.
