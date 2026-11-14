import gc
import json
import os
import sys
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent
os.environ.setdefault("HF_HOME", str(ENGINE_DIR / "runtime" / "hf"))

STEPS = 4
FRAMING = ", single object, centered, full view, plain white background, soft studio lighting, 3d render"


def send(**message):
    print(json.dumps(message), flush=True)


def fail(message):
    send(type="error", message=message)
    sys.exit(1)


def weights_path(job, weights_id):
    path = job.get("weights", {}).get(weights_id)
    if not path:
        fail(f'Download the "{weights_id}" weights in the model manager first')
    return path


def load_pipeline(job):
    import torch
    from accelerate import init_empty_weights
    from diffusers import EulerDiscreteScheduler, StableDiffusionXLPipeline, UNet2DConditionModel
    from safetensors.torch import load_file

    base = weights_path(job, "sdxl-base")
    unet_file = Path(weights_path(job, "sdxl-lightning-4step")) / "sdxl_lightning_4step_unet.safetensors"
    with init_empty_weights():
        unet = UNet2DConditionModel.from_config(UNet2DConditionModel.load_config(base, subfolder="unet"))
    unet.load_state_dict(load_file(str(unet_file), device="cuda"), assign=True)
    unet = unet.to(device="cuda", dtype=torch.float16)

    pipeline = StableDiffusionXLPipeline.from_pretrained(
        base, unet=unet, torch_dtype=torch.float16, variant="fp16", local_files_only=True
    ).to("cuda")
    pipeline.scheduler = EulerDiscreteScheduler.from_config(pipeline.scheduler.config, timestep_spacing="trailing")
    pipeline.set_progress_bar_config(disable=True)
    return pipeline


def run_text_to_image(job, out):
    import torch

    params = job["parameters"]
    prompt = (job["inputs"].get("prompt") or "").strip()
    if not prompt:
        fail("prompt-required")
    count = int(params["count"])
    seed = int(params["seed"])
    full_prompt = prompt + FRAMING if params["objectFraming"] else prompt

    send(type="progress", value=0.02, stage="loading")
    pipeline = load_pipeline(job)
    send(type="log", level="info", message=f"Prompt: {full_prompt}")

    files = []
    for index in range(count):
        def on_step(_pipe, step, _timestep, kwargs, index=index):
            send(type="progress", value=0.1 + 0.85 * (index + (step + 1) / STEPS) / count, stage="sampling")
            return kwargs

        with torch.inference_mode():
            image = pipeline(
                prompt=full_prompt,
                num_inference_steps=STEPS,
                guidance_scale=0.0,
                width=1024,
                height=1024,
                generator=torch.Generator(device="cuda").manual_seed(seed + index),
                callback_on_step_end=on_step,
            ).images[0]
        path = f"candidate-{index}.png"
        image.save(out / path)
        files.append({"path": path, "label": f"{prompt[:80]} · {seed + index}", "kind": "image", "meta": {"seed": seed + index}})

    del pipeline
    gc.collect()
    torch.cuda.empty_cache()
    send(type="result", files=files)


def main():
    job = json.loads(Path(sys.argv[sys.argv.index("--job") + 1]).read_text(encoding="utf8"))
    out = Path(job["outputDir"])
    import torch

    if not torch.cuda.is_available():
        fail("CUDA is not available in the engine environment")
    send(type="log", level="info", message=f"torch {torch.__version__}, CUDA {torch.version.cuda}, {torch.cuda.get_device_name(0)}")

    if job["task"] == "text-to-image":
        run_text_to_image(job, out)
    else:
        fail(f"Unsupported task: {job['task']}")


if __name__ == "__main__":
    main()
