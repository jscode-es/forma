import contextlib
import json
import math
from pathlib import Path
import struct
import sys
import zlib

import bmesh
import bpy
from mathutils.bvhtree import BVHTree


def send(message):
    sys.__stdout__.write(json.dumps(message) + "\n")
    sys.__stdout__.flush()


def read_glb(path):
    data = Path(path).read_bytes()
    if len(data) < 20 or data[:4] != b"glTF":
        raise ValueError("invalid-glb")
    length, chunk = struct.unpack_from("<II", data, 12)
    if chunk != 0x4E4F534A or length > len(data) - 20:
        raise ValueError("invalid-glb")
    return json.loads(data[20:20 + length])


def select(objects, active=None):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = active or objects[0]


def load_model(path, modifying):
    document = read_glb(path)
    if any(entry.get("uri") and not entry["uri"].startswith("data:") for key in ("buffers", "images") for entry in document.get(key, [])):
        raise ValueError("external-resources-unsupported")
    if modifying and (document.get("skins") or any(p.get("targets") for m in document.get("meshes", []) for p in m["primitives"])):
        raise ValueError("unsupported-rigged")
    if modifying and document.get("animations"):
        raise ValueError("unsupported-animated")
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported = [obj for obj in bpy.data.objects if obj not in before]
    meshes = [obj for obj in imported if obj.type == "MESH"]
    if not meshes or not any(obj.data.polygons for obj in meshes):
        raise ValueError("mesh-required")
    if modifying and any(obj.data.shape_keys or any(m.type == "ARMATURE" for m in obj.modifiers) for obj in meshes):
        raise ValueError("unsupported-rigged")
    return meshes, document


def inspect_meshes(objects):
    totals = dict.fromkeys(["vertices", "edges", "faces", "triangles", "degenerateFaces", "boundaryEdges", "nonManifoldEdges", "components"], 0)
    for obj in objects:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bm.transform(obj.matrix_world.to_3x3().to_4x4())
        scale = max((max(v.co[i] for v in bm.verts) - min(v.co[i] for v in bm.verts) for i in range(3)), default=1) if bm.verts else 1
        epsilon = max(scale * 1e-7, 1e-10)
        totals["faces"] += len(bm.faces)
        totals["triangles"] += sum(max(0, len(f.verts) - 2) for f in bm.faces)
        totals["degenerateFaces"] += sum(f.calc_area() <= epsilon * epsilon for f in bm.faces)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=epsilon)
        totals["vertices"] += len(bm.verts)
        totals["edges"] += len(bm.edges)
        totals["boundaryEdges"] += sum(e.is_boundary for e in bm.edges)
        totals["nonManifoldEdges"] += sum(not e.is_manifold for e in bm.edges)
        unseen = set(bm.verts)
        while unseen:
            totals["components"] += 1
            pending = [unseen.pop()]
            while pending:
                for edge in pending.pop().link_edges:
                    for vertex in edge.verts:
                        if vertex in unseen:
                            unseen.remove(vertex)
                            pending.append(vertex)
        bm.free()
    return totals


def require_safe_uv_materials(objects, retopology=False):
    materials = {slot.material for obj in objects for slot in obj.material_slots if slot.material}
    if retopology and len(materials) > 1:
        raise ValueError("unsupported-multiple-materials-retopology")
    if retopology and materials and any(not obj.material_slots or any(slot.material is None for slot in obj.material_slots) for obj in objects):
        raise ValueError("unsupported-multiple-materials-retopology")
    for obj in objects:
        if obj.data.color_attributes:
            raise ValueError("unsupported-material-uv-regeneration")
    for material in materials:
        if material.use_nodes and any(node.type in {"TEX_IMAGE", "TEX_COORD", "ATTRIBUTE", "VERTEX_COLOR"} for node in material.node_tree.nodes):
            raise ValueError("unsupported-material-uv-regeneration")


def unwrap(objects, resolution):
    select(objects)
    for obj in objects:
        while obj.data.uv_layers:
            obj.data.uv_layers.remove(obj.data.uv_layers[0])
        obj.data.uv_layers.new(name="UVMap")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=4 / resolution)
    bpy.ops.uv.pack_islands(rotate=True, shape_method="AABB", rotate_method="CARDINAL", margin_method="FRACTION", margin=4 / resolution)
    bpy.ops.object.mode_set(mode="OBJECT")
    for obj in objects:
        for uv in obj.data.uv_layers.active.data:
            if not all(math.isfinite(v) and -1e-5 <= v <= 1.00001 for v in uv.uv):
                raise ValueError("uv-verification-failed")


def export_template(objects, output, resolution):
    # Blender's native PNG UV exporter requires a GPU context in background jobs.
    pixels = bytearray(resolution * resolution * 4)
    for obj in objects:
        uv = obj.data.uv_layers.active.data
        for polygon in obj.data.polygons:
            points = [(round(uv[i].uv.x * (resolution - 1)), round((1 - uv[i].uv.y) * (resolution - 1))) for i in polygon.loop_indices]
            for start, end in zip(points, points[1:] + points[:1]):
                steps = max(abs(end[0] - start[0]), abs(end[1] - start[1]), 1)
                for step in range(steps + 1):
                    x = round(start[0] + (end[0] - start[0]) * step / steps)
                    y = round(start[1] + (end[1] - start[1]) * step / steps)
                    offset = (y * resolution + x) * 4
                    pixels[offset:offset + 4] = b"\x20\x20\x20\xff"
    def chunk(kind, payload):
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload))
    rows = b"".join(b"\0" + pixels[y * resolution * 4:(y + 1) * resolution * 4] for y in range(resolution))
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", resolution, resolution, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")
    (output / "uv-template.png").write_bytes(png)


def recalculate(objects):
    for obj in objects:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.update()


def retopologize(objects, budget):
    require_safe_uv_materials(objects, retopology=True)
    select(objects)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if len(objects) > 1:
        bpy.ops.object.join()
    obj = bpy.context.object
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    bm.free()
    original = obj.data.copy()
    material = obj.data.materials[0] if obj.data.materials else None
    for factor in (0.9, 0.7, 0.5):
        obj.data = original.copy()
        select([obj])
        status = bpy.ops.object.quadriflow_remesh(target_faces=max(32, int(budget * factor)), use_mesh_symmetry=False, use_preserve_sharp=False, use_preserve_boundary=True, preserve_attributes=False, seed=0)
        if "FINISHED" not in status or not obj.data.polygons:
            raise ValueError("retopology-failed")
        if any(len(face.vertices) != 4 for face in obj.data.polygons):
            raise ValueError("retopology-not-quads")
        if len(obj.data.polygons) <= budget:
            if material:
                obj.data.materials.clear()
                obj.data.materials.append(material)
            return [obj], len(obj.data.polygons)
    raise ValueError("budget-not-met")


def bake_normals(low, high, resolution, output):
    if len(low) != 1:
        raise ValueError("bake-single-target-required")
    target = low[0]
    if not target.data.uv_layers:
        raise ValueError("bake-uv-required")
    extent = max(target.dimensions)
    positions = []
    polygons = []
    for obj in high:
        offset = len(positions)
        positions.extend(obj.matrix_world @ vertex.co for vertex in obj.data.vertices)
        polygons.extend(tuple(offset + i for i in face.vertices) for face in obj.data.polygons)
    surface = BVHTree.FromPolygons(positions, polygons)
    samples = list(target.data.vertices)[::max(1, len(target.data.vertices) // 512)]
    hits = sum(surface.find_nearest(target.matrix_world @ vertex.co, max(extent * 0.15, 0.003))[0] is not None for vertex in samples)
    if not hits:
        raise ValueError("bake-source-no-overlap")
    bpy.context.scene.render.engine = "CYCLES"
    bpy.context.scene.cycles.device = "CPU"
    bpy.context.scene.cycles.samples = 1
    image = bpy.data.images.new("Forma tangent normal", width=resolution, height=resolution, alpha=False)
    image.colorspace_settings.name = "Non-Color"
    if not target.data.materials:
        target.data.materials.append(bpy.data.materials.new("Forma material"))
    materials = set()
    for index, material in enumerate(target.data.materials):
        if material is None:
            material = bpy.data.materials.new(f"Forma material {index}")
            target.data.materials[index] = material
        material.use_nodes = True
        materials.add(material)
        node = material.node_tree.nodes.new("ShaderNodeTexImage")
        node.image = image
        material.node_tree.nodes.active = node
    select(high + low, target)
    status = bpy.ops.object.bake(type="NORMAL", normal_space="TANGENT", use_selected_to_active=True, cage_extrusion=max(extent * 0.05, 0.001), max_ray_distance=max(extent * 0.1, 0.002), margin=8, use_clear=True)
    if "FINISHED" not in status:
        raise ValueError("normal-bake-failed")
    pixels = list(image.pixels)
    covered = [pixels[i:i + 3] for i in range(0, len(pixels), 4) if pixels[i + 2] > 0.1]
    if not covered:
        raise ValueError("normal-bake-empty")
    variation = max(max(c[0], c[1]) for c in covered) - min(min(c[0], c[1]) for c in covered)
    image.filepath_raw = str(output / "normal.png")
    image.file_format = "PNG"
    image.save()
    image.pack()
    for material in materials:
        nodes = material.node_tree.nodes
        image_node = next(node for node in nodes if node.type == "TEX_IMAGE" and node.image == image)
        normal = nodes.new("ShaderNodeNormalMap")
        material.node_tree.links.new(image_node.outputs["Color"], normal.inputs["Color"])
        principled = next((node for node in nodes if node.type == "BSDF_PRINCIPLED"), None)
        if not principled:
            raise ValueError("unsupported-bake-material")
        material.node_tree.links.new(normal.outputs["Normal"], principled.inputs["Normal"])
    return {"bakeEngine": "CYCLES_CPU", "normalSpace": "TANGENT", "normalVariation": variation, "sampleSurfaceCoverage": hits / len(samples)}


def export_model(objects, output, budget=None, bake=False):
    select(objects)
    bpy.ops.export_scene.gltf(filepath=str(output / "model.glb"), export_format="GLB", use_selection=True, export_animations=False, export_skins=False, export_morph=False, export_tangents=True)
    document = read_glb(output / "model.glb")
    if bake:
        for material in document.get("materials", []):
            normal = material.get("normalTexture")
            if normal:
                texture = document["textures"][normal["index"]]
                texture.setdefault("extras", {}).setdefault("formaMapSources", {})["normal"] = "baked"
        path = output / "model.glb"
        data = path.read_bytes()
        old_length = struct.unpack_from("<I", data, 12)[0]
        payload = json.dumps(document, separators=(",", ":")).encode("utf-8")
        payload += b" " * (-len(payload) % 4)
        tail = data[20 + old_length:]
        path.write_bytes(struct.pack("<4sII", b"glTF", 2, 20 + len(payload) + len(tail)) + struct.pack("<II", len(payload), 0x4E4F534A) + payload + tail)
    triangles = sum(document["accessors"][p["indices"]]["count"] // 3 for m in document["meshes"] for p in m["primitives"])
    if budget is not None and triangles > budget * 2:
        raise ValueError("budget-not-met")
    if bake and (not any(m.get("normalTexture") for m in document.get("materials", [])) or not all("bufferView" in image for image in document.get("images", []))):
        raise ValueError("normal-export-verification-failed")
    return triangles


def run_job(job):
    task = job.get("task")
    if task not in {"mesh-inspect", "retopology", "uv-unwrap", "normals"}:
        raise ValueError("unsupported-task")
    models = job.get("inputs", {}).get("models", [])
    if not 1 <= len(models) <= 2:
        raise ValueError("model-required")
    params = job.get("parameters", {})
    mode = params.get("mode", "recalculate")
    if mode not in {"recalculate", "bake"}:
        raise ValueError("invalid-normal-mode")
    bake = task == "normals" and mode == "bake"
    if bake and len(models) != 2:
        raise ValueError("bake-source-required")
    if not bake and len(models) != 1:
        raise ValueError("single-model-required")
    resolution = params.get("resolution", "1024")
    if str(resolution) not in {"512", "1024", "2048", "4096"}:
        raise ValueError("invalid-resolution")
    resolution = int(resolution)
    budget = params.get("faceBudget", 10000)
    if type(budget) is not int or not 128 <= budget <= 2000000:
        raise ValueError("invalid-face-budget")
    output = Path(job["outputDir"])
    output.mkdir(parents=True, exist_ok=True)
    meshes, _ = load_model(models[0], task != "mesh-inspect")
    source = inspect_meshes(meshes)
    report = {"version": 1, "task": task, "source": source, "warnings": [], "details": {}}
    files = []
    send({"type": "progress", "value": 0.2, "stage": "inspecting"})
    if task == "retopology":
        meshes, quads = retopologize(meshes, budget)
        unwrap(meshes, resolution)
        report["details"] = {"method": "quadriflow", "faceBudget": budget, "quadFaces": quads, "resolution": resolution, "uvBoundsVerified": True}
        report["warnings"] = ["uv-regenerated", "topology-rebuilt"]
    elif task == "uv-unwrap":
        require_safe_uv_materials(meshes)
        unwrap(meshes, resolution)
        export_template(meshes, output, resolution)
        report["details"] = {"resolution": resolution, "uvBoundsVerified": True}
        report["warnings"] = ["uv-regenerated"]
        files.append({"path": "uv-template.png", "label": "UV template", "kind": "uv-template"})
    elif task == "normals":
        if bake:
            high, _ = load_model(models[1], True)
            report["details"] = bake_normals(meshes, high, resolution, output)
            report["details"]["resolution"] = resolution
            report["warnings"] = ["normal-map-replaced"]
        else:
            recalculate(meshes)
            report["details"] = {"method": "recalculate-outside"}
            report["warnings"] = ["custom-normals-recalculated"]
    if task != "mesh-inspect":
        send({"type": "progress", "value": 0.85, "stage": "exporting"})
        triangles = export_model(meshes, output, budget if task == "retopology" else None, bake)
        report["result"] = inspect_meshes(meshes)
        report["result"]["triangles"] = triangles
        files.insert(0, {"path": "model.glb", "label": task, "kind": "model"})
    (output / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    send({"type": "log", "level": "info", "message": json.dumps(report)})
    files.append({"path": "report.json", "label": "Mesh report", "kind": "mesh-report"})
    return files


def main():
    try:
        path = sys.argv[sys.argv.index("--job") + 1]
        job = json.loads(Path(path).read_text(encoding="utf-8"))
        with contextlib.redirect_stdout(sys.stderr):
            files = run_job(job)
        send({"type": "result", "files": files})
    except Exception as error:
        send({"type": "error", "message": str(error)})
        sys.exit(1)


if __name__ == "__main__":
    main()
