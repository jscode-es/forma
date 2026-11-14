import gc
import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace

ENGINE_DIR = Path(__file__).resolve().parent
os.environ.setdefault("HF_HOME", str(ENGINE_DIR / "runtime" / "hf"))
sys.path[:0] = [str(ENGINE_DIR / "vendor" / "Hunyuan3D-2.1" / "hy3dpaint"), str(ENGINE_DIR / "vendor" / "Hunyuan3D-2")]

PAINT_FOLDER = "hunyuan3d-paintpbr-v2-1"
DELIGHT_FOLDER = "hunyuan3d-delight-v2-0"
VIEW_SIZE = 512
MAX_PIXELS = 16 * 1024 * 1024


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


def free_gpu():
    import torch

    gc.collect()
    torch.cuda.empty_cache()


def load_reference(path):
    from PIL import Image

    with Image.open(path) as source:
        if source.width * source.height > MAX_PIXELS:
            fail("The image exceeds 16 megapixels")
        image = source.convert("RGBA")
    if image.getchannel("A").getextrema()[0] == 255:
        send(type="log", level="warn", message="The reference has no transparency; remove its background for cleaner textures")
    return image


def neutralize(image, delight_dir):
    from PIL import Image
    from hy3dgen.texgen.utils.dehighlight_utils import Light_Shadow_Remover

    remover = Light_Shadow_Remover(SimpleNamespace(device="cuda", light_remover_ckpt_path=str(delight_dir)))
    alpha = image.getchannel("A")
    rgb = Image.new("RGB", image.size, "white")
    rgb.paste(image.convert("RGB"), mask=alpha.point(lambda value: 255 if value else 0))
    result = remover(rgb).convert("RGB").resize(image.size, Image.Resampling.LANCZOS)
    result.putalpha(alpha)
    del remover
    free_gpu()
    return result


def encode_reference(dino_dir, style):
    import torch
    from transformers import AutoImageProcessor, AutoModel

    processor = AutoImageProcessor.from_pretrained(dino_dir, local_files_only=True)
    model = AutoModel.from_pretrained(dino_dir, torch_dtype=torch.float16, local_files_only=True).eval().to("cuda")
    pixels = processor(images=style, return_tensors="pt").pixel_values.to(device="cuda", dtype=torch.float16)
    features = model(pixels).last_hidden_state
    del model, pixels
    free_gpu()
    return features


def load_diffusion(paint_dir, steps):
    import torch
    from diffusers import AutoencoderKL, UniPCMultistepScheduler
    from transformers import CLIPImageProcessor, CLIPTextModel, CLIPTokenizer
    from hunyuanpaintpbr.pipeline import HunyuanPaintPipeline
    from hunyuanpaintpbr.unet.modules import UNet2p5DConditionModel

    class Diffusion(HunyuanPaintPipeline):
        def encode_images(self, images):
            return super().encode_images(images.to(self._execution_device))

        def denoise(self, *args, **kwargs):
            def on_step(_pipeline, step, _timestep, tensors):
                send(type="progress", value=0.35 + 0.5 * (step + 1) / steps, stage="sampling")
                return tensors

            kwargs["prompt_embeds"] = kwargs["prompt_embeds"].to(self._execution_device)
            kwargs["negative_prompt_embeds"] = kwargs["negative_prompt_embeds"].to(self._execution_device)
            return super().denoise(*args, **kwargs, callback_on_step_end=on_step)

    pipeline = Diffusion(
        vae=AutoencoderKL.from_pretrained(paint_dir / "vae", torch_dtype=torch.float16, local_files_only=True),
        text_encoder=CLIPTextModel.from_pretrained(paint_dir / "text_encoder", torch_dtype=torch.float16, local_files_only=True),
        tokenizer=CLIPTokenizer.from_pretrained(paint_dir / "tokenizer", local_files_only=True),
        unet=UNet2p5DConditionModel.from_pretrained(paint_dir / "unet", torch_dtype=torch.float16),
        scheduler=UniPCMultistepScheduler.from_pretrained(paint_dir / "scheduler", timestep_spacing="trailing", local_files_only=True),
        feature_extractor=CLIPImageProcessor.from_pretrained(paint_dir / "feature_extractor", local_files_only=True),
    )
    pipeline.eval()
    pipeline.set_progress_bar_config(disable=True)
    pipeline.enable_model_cpu_offload()
    pipeline.enable_vae_slicing()
    pipeline.enable_vae_tiling()
    return pipeline


def pbr_material(mesh, albedo, metallic_roughness):
    import trimesh
    from PIL import Image

    red, green, _blue = metallic_roughness.convert("RGB").split()
    packed = Image.merge("RGB", (Image.new("L", metallic_roughness.size, 255), green, red))
    material = trimesh.visual.material.PBRMaterial(
        baseColorTexture=albedo.convert("RGB"),
        baseColorFactor=[255, 255, 255, 255],
        metallicRoughnessTexture=packed,
        metallicFactor=1.0,
        roughnessFactor=1.0,
    )
    mesh.visual = trimesh.visual.TextureVisuals(uv=mesh.visual.uv, material=material)
    return mesh, packed


def run_texture(job, out):
    import numpy as np
    import torch
    import trimesh
    from PIL import Image
    from hy3dgen.texgen.pipelines import Hunyuan3DPaintPipeline, Hunyuan3DTexGenConfig
    from hy3dgen.texgen.utils.uv_warp_utils import mesh_uv_wrap

    params = job["parameters"]
    steps = int(params["steps"])
    atlas = int(params["atlasResolution"])
    seed = int(params["seed"])
    face_limit = int(params["faceLimit"])
    paint_dir = weights_path(job, "hunyuan3d-paintpbr-2-1") / PAINT_FOLDER
    dino_dir = weights_path(job, "dinov2-giant")
    torch.manual_seed(seed)

    send(type="progress", value=0.02, stage="preparing")
    reference = load_reference(job["inputs"]["images"][0])
    if params["removeLighting"]:
        send(type="progress", value=0.04, stage="neutralizing-lighting")
        reference = neutralize(reference, weights_path(job, "hunyuan3d-delight-2-0") / DELIGHT_FOLDER)
    reference.save(out / "reference.png")
    send(type="intermediate", path="reference.png", label="Reference used for painting", kind="image")

    mesh = trimesh.load(job["inputs"]["models"][0], force="mesh", process=False)
    if len(mesh.faces) == 0:
        fail("The model has no faces")
    input_faces = len(mesh.faces)
    if face_limit and input_faces > face_limit:
        send(type="progress", value=0.08, stage="reducing")
        from hy3dgen.shapegen import FaceReducer

        mesh = FaceReducer()(mesh, max_facenum=face_limit)
    send(type="log", level="info", message=f"Faces: {input_faces} in, {len(mesh.faces)} painted")

    send(type="progress", value=0.12, stage="unwrapping")
    mesh = mesh_uv_wrap(mesh)

    class Painter(Hunyuan3DPaintPipeline):
        def load_models(self):
            pass

    config = Hunyuan3DTexGenConfig("", "", "hunyuan3d-paint-v2-0")
    config.render_size = min(atlas, 1024)
    config.texture_size = atlas
    painter = Painter(config)
    styled = painter.recenter_image(reference).convert("RGBA")
    style = Image.new("RGB", styled.size, "white")
    style.paste(styled.convert("RGB"), mask=styled.getchannel("A"))
    style = style.resize((VIEW_SIZE, VIEW_SIZE), Image.Resampling.LANCZOS)

    send(type="progress", value=0.18, stage="rendering-geometry")
    elevs, azims, weights = config.candidate_camera_elevs, config.candidate_camera_azims, config.candidate_view_weights
    painter.render.load_mesh(mesh)
    normals = [image.resize((VIEW_SIZE, VIEW_SIZE)) for image in painter.render_normal_multiview(elevs, azims, use_abs_coor=True)]
    positions = [image.resize((VIEW_SIZE, VIEW_SIZE)) for image in painter.render_position_multiview(elevs, azims)]

    send(type="progress", value=0.25, stage="encoding-reference")
    with torch.inference_mode():
        dino = encode_reference(dino_dir, style)
        send(type="progress", value=0.3, stage="loading")
        pipeline = load_diffusion(paint_dir, steps)
        views = pipeline(
            [style],
            num_inference_steps=steps,
            generator=torch.Generator(device="cuda").manual_seed(seed),
            guidance_scale=float(params["guidanceScale"]),
            width=VIEW_SIZE,
            height=VIEW_SIZE,
            num_in_batch=len(normals),
            images_normal=[normals],
            images_position=[positions],
            dino_hidden_states=dino,
        ).images
        pipeline.maybe_free_model_hooks()
    del pipeline, dino
    free_gpu()

    count = len(normals)
    if len(views) != 2 * count:
        fail("Paint 2.1 did not produce both PBR branches")

    send(type="progress", value=0.88, stage="baking")
    atlases = []
    for branch in (views[:count], views[count:]):
        branch = [image.resize((config.render_size, config.render_size), Image.Resampling.LANCZOS) for image in branch]
        texture, mask = painter.bake_from_multiview(branch, elevs, azims, weights, method="fast")
        mask = (mask.squeeze(-1).cpu().numpy() * 255).astype(np.uint8)
        texture = painter.texture_inpaint(texture, mask)
        atlases.append(Image.fromarray((texture.cpu().numpy().clip(0, 1) * 255).round().astype(np.uint8)))

    mesh, packed = pbr_material(mesh, atlases[0], atlases[1])
    atlases[0].save(out / "albedo.png")
    packed.save(out / "metallic-roughness.png")
    send(type="intermediate", path="albedo.png", label="Albedo", kind="image")
    send(type="intermediate", path="metallic-roughness.png", label="Metallic (B) and roughness (G)", kind="image")

    send(type="progress", value=0.97, stage="exporting")
    mesh.export(out / "model.glb", include_normals=True)
    send(type="log", level="info", message=f"Atlas {atlas} px, {steps} steps, seed {seed}, maps: albedo, metallic, roughness")
    send(type="result", files=[{"path": "model.glb", "label": "Paint 2.1 PBR", "kind": "model"}])


def main():
    job = json.loads(Path(sys.argv[sys.argv.index("--job") + 1]).read_text(encoding="utf8"))
    out = Path(job["outputDir"])
    import torch

    if not torch.cuda.is_available():
        fail("CUDA is not available in the engine environment")
    send(type="log", level="info", message=f"torch {torch.__version__}, CUDA {torch.version.cuda}, {torch.cuda.get_device_name(0)}")

    if job["task"] == "texture":
        run_texture(job, out)
    else:
        fail(f"Unsupported task: {job['task']}")


if __name__ == "__main__":
    main()
