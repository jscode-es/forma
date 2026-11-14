import gc
import json
import os
import sys
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent
os.environ.setdefault("HF_HOME", str(ENGINE_DIR / "runtime" / "hf"))
os.environ.setdefault("TORCH_HOME", str(ENGINE_DIR / "runtime" / "torch"))
sys.path.insert(0, str(ENGINE_DIR / "vendor" / "Hunyuan3D-2"))

MAX_PIXELS = 16 * 1024 * 1024


def send(**message):
    print(json.dumps(message), flush=True)


def fail(message):
    send(type="error", message=message)
    sys.exit(1)


def load_image(path):
    from PIL import Image

    with Image.open(path) as source:
        if source.width * source.height > MAX_PIXELS:
            fail("The image exceeds 16 megapixels")
        return source.convert("RGBA")


def has_transparency(image):
    return image.getchannel("A").getextrema()[0] < 255


def remove_background(image, weights_dir):
    import torch
    from PIL import Image
    from torchvision import transforms
    from transformers import AutoModelForImageSegmentation

    model = AutoModelForImageSegmentation.from_pretrained(weights_dir, trust_remote_code=True, local_files_only=True)
    model = model.eval().to(device="cuda", dtype=torch.float16)
    transform = transforms.Compose(
        [
            transforms.Resize((1024, 1024)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]
    )
    inputs = transform(image.convert("RGB")).unsqueeze(0).to(device="cuda", dtype=torch.float16)
    with torch.inference_mode():
        prediction = model(inputs)[-1].sigmoid().float().cpu()
    mask = transforms.ToPILImage()(prediction[0].squeeze()).resize(image.size, Image.Resampling.LANCZOS)
    output = image.convert("RGB").convert("RGBA")
    output.putalpha(mask)
    del model, inputs, prediction
    gc.collect()
    torch.cuda.empty_cache()
    return output


def weights_path(job, weights_id):
    path = job.get("weights", {}).get(weights_id)
    if not path:
        fail(f'Download the "{weights_id}" weights in the model manager first')
    return path


def run_remove_background(job, out):
    image = load_image(job["inputs"]["images"][0])
    send(type="progress", value=0.1, stage="removing-background")
    prepared = remove_background(image, weights_path(job, "birefnet"))
    prepared.save(out / "prepared.png")
    send(type="result", files=[{"path": "prepared.png", "label": "Prepared image", "kind": "image"}])


def run_image_to_3d(job, out):
    import torch

    params = job["parameters"]
    steps = int(params["steps"])
    image = load_image(job["inputs"]["images"][0])

    send(type="progress", value=0.02, stage="preparing")
    if params["removeBackground"] and not has_transparency(image):
        send(type="log", level="info", message="Removing background with BiRefNet")
        image = remove_background(image, weights_path(job, "birefnet"))
    image.save(out / "prepared.png")
    send(type="intermediate", path="prepared.png", label="Prepared image", kind="image")

    dit = Path(weights_path(job, "hunyuan3d-2-dit")) / "hunyuan3d-dit-v2-0"
    send(type="progress", value=0.05, stage="loading")
    from hy3dgen.shapegen import DegenerateFaceRemover, FloaterRemover, Hunyuan3DDiTFlowMatchingPipeline

    pipeline = Hunyuan3DDiTFlowMatchingPipeline.from_single_file(
        str(dit / "model.fp16.safetensors"),
        str(dit / "config.yaml"),
        use_safetensors=True,
        device="cuda",
        dtype=torch.float16,
    )

    def callback(step, _timestep, _outputs):
        send(type="progress", value=0.1 + 0.75 * (step + 1) / steps, stage="sampling")

    with torch.inference_mode():
        mesh = pipeline(
            image=image,
            num_inference_steps=steps,
            guidance_scale=float(params["guidanceScale"]),
            octree_resolution=int(params["octreeResolution"]),
            num_chunks=8000,
            generator=torch.Generator(device="cuda").manual_seed(int(params["seed"])),
            callback=callback,
            callback_steps=1,
            enable_pbar=False,
        )[0]

    send(type="progress", value=0.9, stage="cleaning")
    mesh = FloaterRemover()(mesh)
    mesh = DegenerateFaceRemover()(mesh)
    send(type="log", level="info", message=f"Mesh: {len(mesh.vertices)} vertices, {len(mesh.faces)} faces")

    send(type="progress", value=0.95, stage="exporting")
    mesh.export(out / "model.glb")
    send(type="result", files=[{"path": "model.glb", "label": "Hunyuan3D", "kind": "model"}])


def main():
    job = json.loads(Path(sys.argv[sys.argv.index("--job") + 1]).read_text(encoding="utf8"))
    out = Path(job["outputDir"])
    import torch

    if not torch.cuda.is_available():
        fail("CUDA is not available in the engine environment")
    send(type="log", level="info", message=f"torch {torch.__version__}, CUDA {torch.version.cuda}, {torch.cuda.get_device_name(0)}")

    if job["task"] == "remove-background":
        run_remove_background(job, out)
    elif job["task"] == "image-to-3d":
        run_image_to_3d(job, out)
    else:
        fail(f"Unsupported task: {job['task']}")


if __name__ == "__main__":
    main()
