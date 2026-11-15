import gc
import json
import os
import sys
import tempfile
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent
os.environ.setdefault("HF_HOME", str(ENGINE_DIR / "runtime" / "hf"))
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

STEPS = 4
FRAMING = ", single isolated object, centered, full view, empty white background, studio lighting"
PROMPT_INSTRUCTION = (
    "Translate the object request into English in at most 18 words. Correct missing Spanish accents. "
    "Name the requested object first. Preserve its explicit quantity and attributes. Never substitute its subject. "
    "Add no unrequested objects, people, scenery or background. Return only the English object description. "
    "Examples: jarrón -> vase; jarron chino -> Chinese-style vase; taza de madera -> wooden cup."
)
STYLE_INSTRUCTION = (
    "Extract only appearance attributes from the style text, in English, at most 20 words. "
    "Keep art medium and shape language first, then surface finish, palette, lighting and object viewing angle. "
    "Use pigment names for colors, not vegetation or landscape words such as lush. "
    "Apply nationality as surface design. Ignore all scene-building concepts, especially diorama: "
    "add no scenery, landscapes, mountains, trees, buildings, frames, bases or pedestals. "
    "Do not name objects or settings. Return only comma-separated appearance attributes. "
    "Example: hand-painted Japanese fantasy diorama with mountains, rounded shapes and pastel colors "
    "-> hand-painted, stylized Japanese design, rounded shapes, pastel colors."
)
MAX_PROMPT_TOKENS = 64


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


def refine_prompt(job, description, style=""):
    folder = weights_path(job, "prompt-qwen3")
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(folder, local_files_only=True, trust_remote_code=False)
    model = AutoModelForCausalLM.from_pretrained(folder, dtype=torch.float32, device_map="cpu", local_files_only=True, use_safetensors=True, trust_remote_code=False)
    parts = []
    try:
        for instruction, value in [(PROMPT_INSTRUCTION, description), (STYLE_INSTRUCTION, style)]:
            if not value.strip():
                parts.append("")
                continue
            inputs = tokenizer.apply_chat_template(
                [{"role": "system", "content": instruction}, {"role": "user", "content": value}],
                tokenize=True, add_generation_prompt=True, enable_thinking=False, return_dict=True, return_tensors="pt",
            )
            with torch.inference_mode(), torch.random.fork_rng(devices=[]):
                torch.random.default_generator.manual_seed(0)
                generated = model.generate(
                    **inputs, max_new_tokens=MAX_PROMPT_TOKENS, do_sample=True, temperature=0.3, top_p=0.8, top_k=20,
                    eos_token_id=tokenizer.eos_token_id, pad_token_id=tokenizer.pad_token_id,
                )
            continuation = generated[0, inputs["input_ids"].shape[-1]:]
            truncated = continuation.numel() >= MAX_PROMPT_TOKENS and continuation[-1].item() != tokenizer.eos_token_id
            text = tokenizer.decode(continuation, skip_special_tokens=True)
            parts.append(validate_prompt_output(text, truncated))
            del inputs, generated, continuation
    finally:
        del model, tokenizer
        gc.collect()
    return tuple(parts)


def image_prompt(subject, style, pipeline, object_framing):
    framing = FRAMING if object_framing else ""
    attributes = [value.strip() for value in style.split(",") if value.strip()]
    tokenizers = [pipeline.tokenizer, pipeline.tokenizer_2]
    while True:
        text = subject + (", " + ", ".join(attributes) if attributes else "") + framing
        if all(len(tokenizer.encode(text)) <= tokenizer.model_max_length for tokenizer in tokenizers):
            return text
        if not attributes:
            raise ValueError("prompt-too-long")
        attributes.pop()


def load_background_remover(job):
    import torch
    from transformers import AutoModelForImageSegmentation

    return AutoModelForImageSegmentation.from_pretrained(
        weights_path(job, "birefnet"), local_files_only=True, trust_remote_code=True, use_safetensors=True,
    ).eval().to(device="cuda", dtype=torch.float16)


def transparent_image(image, model):
    import torch
    from PIL import Image
    from torchvision import transforms

    transform = transforms.Compose([
        transforms.Resize((1024, 1024)), transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])
    inputs = transform(image.convert("RGB")).unsqueeze(0).to(device="cuda", dtype=torch.float16)
    with torch.inference_mode():
        prediction = model(inputs)[-1].sigmoid().float().cpu()
    mask = transforms.ToPILImage()(prediction[0].squeeze()).resize(image.size, Image.Resampling.LANCZOS)
    mask = mask.point(lambda value: 0 if value <= 8 else 255 if value >= 247 else value)
    return apply_alpha(image, mask)


def apply_alpha(image, mask):
    histogram = mask.histogram()
    minimum = image.width * image.height * 0.01
    if histogram[0] < minimum or sum(histogram[250:]) < minimum:
        raise ValueError("image-background-not-transparent")
    rgb = image.convert("RGB")
    # RGB-only consumers must not recover discarded background objects.
    rgb.paste((0, 0, 0), mask=mask.point(lambda value: 255 if value == 0 else 0))
    result = rgb.convert("RGBA")
    result.putalpha(mask)
    return result


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
    from PIL import Image

    params = job["parameters"]
    prompt = (job["inputs"].get("prompt") or "").strip()
    if not prompt:
        fail("prompt-required")
    count = int(params["count"])
    seed = int(params["seed"])
    send(type="progress", value=0.01, stage="refining-prompt")
    send(type="log", level="info", message=f"Original prompt: {prompt}")
    style = params.get("stylePrompt", "").strip()
    if style:
        send(type="log", level="info", message=f"Visual style: {style}")
    try:
        subject, appearance = refine_prompt(job, prompt, style)
    except ValueError as error:
        fail(str(error))
    send(type="progress", value=0.02, stage="loading")
    files = []
    with tempfile.TemporaryDirectory(prefix="rgb-", dir=out) as directory:
        temporary = Path(directory)
        pipeline = load_pipeline(job)
        try:
            full_prompt = image_prompt(subject, appearance, pipeline, params["objectFraming"])
            send(type="log", level="info", message=f"Prompt: {full_prompt}")
            for index in range(count):
                def on_step(_pipe, step, _timestep, kwargs, index=index):
                    send(type="progress", value=0.1 + 0.65 * (index + (step + 1) / STEPS) / count, stage="sampling")
                    return kwargs
                with torch.inference_mode():
                    image = pipeline(
                        prompt=full_prompt, num_inference_steps=STEPS, guidance_scale=0.0, width=1024, height=1024,
                        generator=torch.Generator(device="cuda").manual_seed(seed + index), callback_on_step_end=on_step,
                    ).images[0]
                image.save(temporary / f"{index}.png")
        finally:
            del pipeline
            gc.collect()
            torch.cuda.empty_cache()
        send(type="progress", value=0.76, stage="removing-background")
        remover = load_background_remover(job)
        try:
            for index in range(count):
                send(type="progress", value=0.78 + 0.2 * index / count, stage="removing-background")
                with Image.open(temporary / f"{index}.png") as image:
                    prepared = transparent_image(image, remover)
                path = f"candidate-{index}.png"
                prepared.save(out / path)
                files.append({"path": path, "label": f"{prompt[:80]} · {seed + index}", "kind": "image", "meta": {"seed": seed + index}})
        finally:
            del remover
            gc.collect()
            torch.cuda.empty_cache()
    send(type="progress", value=1, stage="removing-background")
    send(type="result", files=files)


def main():
    job = json.loads(Path(sys.argv[sys.argv.index("--job") + 1]).read_text(encoding="utf8"))
    out = Path(job["outputDir"])
    import torch

    if not torch.cuda.is_available():
        fail("CUDA is not available in the engine environment")
    send(type="log", level="info", message=f"torch {torch.__version__}, CUDA {torch.version.cuda}, {torch.cuda.get_device_name(0)}")

    if job["task"] == "text-to-image":
        try:
            run_text_to_image(job, out)
        except ValueError as error:
            fail(str(error))
    else:
        fail(f"Unsupported task: {job['task']}")


if __name__ == "__main__":
    main()
