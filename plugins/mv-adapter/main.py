import gc
import importlib.util
import json
import math
import os
import sys
import types
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent
VENDOR = ENGINE_DIR / "vendor" / "MV-Adapter"
os.environ.setdefault("HF_HOME", str(ENGINE_DIR / "runtime" / "hf"))
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

STEPS = 30
GUIDANCE = 7.0
SIZE = 768
# Azimuths follow MV-Adapter: 0 faces the camera, 90 is the viewer's right and 270 the viewer's left.
VIEWS = [("front", 0), ("right", 90), ("back", 180), ("left", 270)]
SUFFIX = ", single isolated object, centered, full view, plain background, studio lighting"
NEGATIVE = "watermark, ugly, deformed, noisy, blurry, low contrast, multiple objects, scenery"
PROMPT_INSTRUCTION = (
    "Translate the object request into English in at most 18 words. Correct missing Spanish accents. "
    "Name the requested object first. Preserve its explicit quantity and attributes. Never substitute its subject. "
    "Add no unrequested objects, people, scenery or background. Return only the English object description. "
    "Examples: jarrón -> vase; jarron chino -> Chinese-style vase; taza de madera -> wooden cup."
)
STYLE_INSTRUCTION = (
    "Extract only appearance attributes from the style text, in English, at most 20 words. "
    "Keep art medium and shape language first, then surface finish, palette and lighting. "
    "Use pigment names for colors, not vegetation or landscape words such as lush. "
    "Apply nationality as surface design. Ignore all scene-building concepts, especially diorama: "
    "add no scenery, landscapes, mountains, trees, buildings, frames, bases or pedestals. "
    "Do not name objects or settings. Return only comma-separated appearance attributes."
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
    return Path(path)


def validate_prompt_output(value, truncated=False):
    text = " ".join(value.split())
    if truncated or not 3 <= len(text) <= 800 or any(marker in text for marker in ("<think>", "</think>", "```", "\x00", "<|")):
        raise ValueError("prompt-refinement-invalid")
    return text


def refine_prompt(job, description, style=""):
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    folder = weights_path(job, "prompt-qwen3")
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
            parts.append(validate_prompt_output(tokenizer.decode(continuation, skip_special_tokens=True), truncated))
            del inputs, generated, continuation
    finally:
        del model, tokenizer
        gc.collect()
    return tuple(parts)


def import_mvadapter():
    # The package __init__ of mvadapter.utils pulls nvdiffrast and CV-CUDA for texturing; only geometry is needed here.
    sys.path.insert(0, str(VENDOR))
    utils = types.ModuleType("mvadapter.utils")
    utils.__path__ = [str(VENDOR / "mvadapter" / "utils")]
    sys.modules["mvadapter.utils"] = utils
    spec = importlib.util.spec_from_file_location("mvadapter.utils.geometry", VENDOR / "mvadapter" / "utils" / "geometry.py")
    geometry = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(geometry)
    from mvadapter.pipelines.pipeline_mvadapter_t2mv_sdxl import MVAdapterT2MVSDXLPipeline
    from mvadapter.schedulers.scheduling_shift_snr import ShiftSNRScheduler

    return geometry, MVAdapterT2MVSDXLPipeline, ShiftSNRScheduler


def camera_to_world(azimuths, distance=1.8):
    import torch
    import torch.nn.functional as F

    angles = torch.tensor([(azimuth - 90) * math.pi / 180 for azimuth in azimuths], dtype=torch.float32)
    positions = torch.stack([distance * torch.cos(angles), distance * torch.sin(angles), torch.zeros_like(angles)], dim=-1)
    up = torch.tensor([0, 0, 1.0]).repeat(len(azimuths), 1)
    lookat = F.normalize(-positions, dim=-1)
    right = F.normalize(torch.cross(lookat, up, dim=-1), dim=-1)
    up = F.normalize(torch.cross(right, lookat, dim=-1), dim=-1)
    matrix = torch.cat([torch.stack([right, up, -lookat], dim=-1), positions[:, :, None]], dim=-1)
    matrix = torch.cat([matrix, torch.zeros_like(matrix[:, :1])], dim=1)
    matrix[:, 3, 3] = 1
    return matrix


def load_pipeline(job):
    import torch
    from accelerate import init_empty_weights
    from diffusers import AutoencoderKL, UNet2DConditionModel
    from safetensors.torch import load_file

    geometry, Pipeline, ShiftSNRScheduler = import_mvadapter()
    base = weights_path(job, "sdxl-base")
    with init_empty_weights():
        unet = UNet2DConditionModel.from_config(UNet2DConditionModel.load_config(str(base), subfolder="unet"))
    unet_file = weights_path(job, "sdxl-base-unet") / "unet" / "diffusion_pytorch_model.fp16.safetensors"
    unet.load_state_dict(load_file(str(unet_file), device="cpu"), assign=True)
    vae = AutoencoderKL.from_pretrained(str(weights_path(job, "sdxl-vae-fp16-fix")), torch_dtype=torch.float16, local_files_only=True)
    pipeline = Pipeline.from_pretrained(str(base), unet=unet, vae=vae, torch_dtype=torch.float16, variant="fp16", local_files_only=True)
    pipeline.scheduler = ShiftSNRScheduler.from_scheduler(pipeline.scheduler, shift_mode="interpolated", shift_scale=8.0, scheduler_class=None)
    pipeline.init_custom_adapter(num_views=len(VIEWS))
    pipeline.load_custom_adapter(str(weights_path(job, "mv-adapter-t2mv-sdxl")), weight_name="mvadapter_t2mv_sdxl.safetensors")
    pipeline.to(dtype=torch.float16)
    pipeline.enable_model_cpu_offload()
    pipeline.cond_encoder.to(device="cuda", dtype=torch.float16)
    pipeline.enable_vae_slicing()
    pipeline.set_progress_bar_config(disable=True)
    plucker = geometry.get_plucker_embeds_from_cameras_ortho(camera_to_world([azimuth for _, azimuth in VIEWS]).to("cuda"), [1.1] * len(VIEWS), SIZE)
    return pipeline, ((plucker + 1.0) / 2.0).clamp(0, 1)


def load_background_remover(job):
    import torch
    from transformers import AutoModelForImageSegmentation

    return AutoModelForImageSegmentation.from_pretrained(
        str(weights_path(job, "birefnet")), local_files_only=True, trust_remote_code=True, use_safetensors=True,
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
    histogram = mask.histogram()
    minimum = image.width * image.height * 0.01
    if histogram[0] < minimum or sum(histogram[250:]) < minimum:
        raise ValueError("image-background-not-transparent")
    rgb = image.convert("RGB")
    rgb.paste((0, 0, 0), mask=mask.point(lambda value: 255 if value == 0 else 0))
    result = rgb.convert("RGBA")
    result.putalpha(mask)
    return result


def run_text_to_multiview(job, out):
    import torch

    params = job["parameters"]
    prompt = (job["inputs"].get("prompt") or "").strip()
    if not prompt:
        fail("prompt-required")
    count = int(params["count"])
    seed = int(params["seed"])
    style = params.get("stylePrompt", "").strip()
    send(type="progress", value=0.01, stage="refining-prompt")
    send(type="log", level="info", message=f"Original prompt: {prompt}")
    subject, appearance = refine_prompt(job, prompt, style)
    text = subject + (f", {appearance}" if appearance else "") + SUFFIX
    send(type="log", level="info", message=f"Prompt: {text}")
    send(type="progress", value=0.03, stage="loading")
    raw = []
    pipeline, control = load_pipeline(job)
    try:
        for index in range(count):
            def on_step(_pipe, step, _timestep, kwargs, index=index):
                send(type="progress", value=0.08 + 0.72 * (index + (step + 1) / STEPS) / count, stage="sampling")
                return kwargs
            with torch.inference_mode():
                images = pipeline(
                    text, height=SIZE, width=SIZE, num_inference_steps=STEPS, guidance_scale=GUIDANCE,
                    num_images_per_prompt=len(VIEWS), control_image=control, control_conditioning_scale=1.0,
                    negative_prompt=NEGATIVE, max_sequence_length=214,
                    generator=torch.Generator(device="cuda").manual_seed(seed + index), callback_on_step_end=on_step,
                ).images
            raw.append(images)
    finally:
        del pipeline, control
        gc.collect()
        torch.cuda.empty_cache()
    send(type="progress", value=0.82, stage="removing-background")
    remover = load_background_remover(job)
    files = []
    try:
        for index, images in enumerate(raw):
            for (view, _), image in zip(VIEWS, images):
                path = f"set-{index}-{view}.png"
                transparent_image(image, remover).save(out / path)
                files.append({"path": path, "label": f"{prompt[:60]} · {seed + index} · {view}", "kind": "image", "meta": {"seed": seed + index, "set": index, "view": view}})
            send(type="progress", value=0.82 + 0.17 * (index + 1) / count, stage="removing-background")
    finally:
        del remover
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
    if job["task"] != "text-to-multiview":
        fail(f"Unsupported task: {job['task']}")
    try:
        run_text_to_multiview(job, out)
    except ValueError as error:
        fail(str(error))


if __name__ == "__main__":
    main()
