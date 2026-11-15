import gc
import json
import os
import sys
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent
os.environ.setdefault("HF_HOME", str(ENGINE_DIR / "runtime" / "hf"))

STEPS = 4
FRAMING = ", single object, centered, full view, plain white background, soft studio lighting, 3d render"
PROMPT_INSTRUCTION = (
    "Translate the user description into English for an image model. Preserve the exact subject and every attribute. "
    "Do not embellish or add attributes. Correct missing Spanish accents. "
    "Nationality describes object style unless a person is requested. Return only the translated description. "
    "When visual style is provided, apply its aesthetic to the object without replacing the subject. "
    'Examples: "Lampara japonesa" -> "Japanese-style lamp"; '
    '"Una silla con flores azules" -> "A chair with blue flowers"; "Jarron" -> "Vase".'
)
MAX_PROMPT_TOKENS = 128


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


def validate_prompt_output(value, truncated=False):
    text = " ".join(value.split())
    if truncated or not 3 <= len(text) <= 800 or any(marker in text for marker in ("<think>", "</think>", "```", "\x00", "<|")):
        raise ValueError("prompt-refinement-invalid")
    return text


def refine_prompt(job, description):
    folder = weights_path(job, "prompt-qwen3")
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(folder, local_files_only=True, trust_remote_code=False)
    model = AutoModelForCausalLM.from_pretrained(folder, dtype=torch.float32, device_map="cpu", local_files_only=True, use_safetensors=True, trust_remote_code=False)
    inputs = tokenizer.apply_chat_template(
        [{"role": "system", "content": PROMPT_INSTRUCTION}, {"role": "user", "content": description}],
        tokenize=True, add_generation_prompt=True, enable_thinking=False, return_dict=True, return_tensors="pt",
    )
    with torch.inference_mode(), torch.random.fork_rng(devices=[]):
        torch.random.default_generator.manual_seed(0)
        generated = model.generate(
            **inputs, max_new_tokens=MAX_PROMPT_TOKENS, do_sample=True, temperature=0.7, top_p=0.8, top_k=20,
            eos_token_id=tokenizer.eos_token_id, pad_token_id=tokenizer.pad_token_id,
        )
    continuation = generated[0, inputs["input_ids"].shape[-1]:]
    truncated = continuation.numel() >= MAX_PROMPT_TOKENS and continuation[-1].item() != tokenizer.eos_token_id
    text = tokenizer.decode(continuation, skip_special_tokens=True)
    del model, tokenizer, inputs, generated, continuation
    gc.collect()
    return validate_prompt_output(text, truncated)


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
    send(type="progress", value=0.01, stage="refining-prompt")
    send(type="log", level="info", message=f"Original prompt: {prompt}")
    style = params.get("stylePrompt", "").strip()
    description = f"{prompt}, {style}" if style else prompt
    if style:
        send(type="log", level="info", message=f"Visual style: {style}")
    try:
        refined = refine_prompt(job, description)
    except ValueError as error:
        fail(str(error))
    full_prompt = refined + FRAMING if params["objectFraming"] else refined

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
