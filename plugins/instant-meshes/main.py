import copy
import io
import json
import math
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import time

from setup_runtime import verified_binary

MAX_BYTES = 100 * 1024 * 1024


def send(**message):
    print(json.dumps(message), flush=True)


def read_source(path):
    if not 20 <= Path(path).stat().st_size <= MAX_BYTES:
        raise ValueError("invalid-glb")
    data = Path(path).read_bytes()
    if not 20 <= len(data) <= MAX_BYTES:
        raise ValueError("invalid-glb")
    magic, version, size, json_size, kind = struct.unpack_from("<4sIIII", data)
    if magic != b"glTF" or version != 2 or size != len(data) or kind != 0x4E4F534A or not 0 < json_size <= min(len(data) - 20, 16 * 1024 * 1024):
        raise ValueError("invalid-glb")
    doc = json.loads(data[20:20 + json_size])
    def external(value):
        if isinstance(value, dict):
            return "uri" in value or any(external(child) for child in value.values())
        return isinstance(value, list) and any(external(child) for child in value)
    if external(doc) or doc.get("extensionsUsed") or doc.get("skins") or doc.get("animations"):
        raise ValueError("unsupported-model-retopology")
    meshes = doc.get("meshes", [])
    if len(meshes) != 1 or len(meshes[0].get("primitives", [])) != 1 or sum("mesh" in node for node in doc.get("nodes", [])) != 1:
        raise ValueError("single-mesh-required")
    primitive = meshes[0]["primitives"][0]
    if primitive.get("mode", 4) != 4 or primitive.get("targets") or set(primitive.get("attributes", {})) - {"POSITION", "NORMAL", "TANGENT", "TEXCOORD_0"}:
        raise ValueError("unsupported-model-retopology")
    if doc.get("images") or doc.get("textures") or len(doc.get("materials", [])) > 1:
        raise ValueError("unsupported-material-uv-regeneration")
    return data


def read_quads(path):
    path = Path(path)
    if not path.is_file() or not 0 < path.stat().st_size <= MAX_BYTES:
        raise ValueError("retopology-failed")
    vertices, faces = [], []
    for line in path.read_text(encoding="utf8").splitlines():
        fields = line.split()
        if not fields:
            continue
        if fields[0] == "v":
            point = [float(value) for value in fields[1:]]
            if len(point) != 3 or not all(math.isfinite(value) for value in point):
                raise ValueError("retopology-failed")
            vertices.append(point)
        elif fields[0] == "f":
            face = [int(value.split("/")[0]) - 1 for value in fields[1:]]
            if len(face) != 4 or len(set(face)) != 4:
                raise ValueError("retopology-not-quads")
            faces.append(face)
    if not vertices or not faces or any(index < 0 or index >= len(vertices) for face in faces for index in face):
        raise ValueError("retopology-failed")
    return vertices, faces


def topology(mesh, quads=None):
    import numpy as np
    import trimesh
    vertices, inverse = np.unique(mesh.vertices, axis=0, return_inverse=True)
    welded = trimesh.Trimesh(vertices=vertices, faces=inverse[mesh.faces], process=False)
    edges = welded.edges if quads is None else inverse[np.asarray(quads)[:, [[0, 1], [1, 2], [2, 3], [3, 0]]]].reshape(-1, 2)
    _, counts = np.unique(np.sort(edges, axis=1), axis=0, return_counts=True)
    return {
        "vertices": len(vertices), "edges": len(counts), "faces": len(quads) if quads is not None else len(mesh.faces),
        "triangles": len(mesh.faces), "degenerateFaces": int((welded.area_faces <= max(float(welded.scale) ** 2 * 1e-14, 1e-30)).sum()),
        "boundaryEdges": int((counts == 1).sum()), "nonManifoldEdges": int((counts != 2).sum()),
        "components": len(trimesh.graph.connected_components(welded.face_adjacency, nodes=np.arange(len(welded.faces)))),
    }


def remesh(binary, source, result, budget):
    target = budget
    for attempt in range(3):
        result.unlink(missing_ok=True)
        arguments = [str(binary), "--output", str(result), "--faces", str(target), "--rosy", "4", "--posy", "4", "--deterministic", "--threads", "1", "--boundaries", str(source)]
        run_binary(arguments)
        vertices, quads = read_quads(result)
        if len(quads) <= budget:
            return vertices, quads
        target = max(16, int(target * budget / len(quads) * 0.8))
        send(type="progress", value=0.3 + attempt * 0.1, stage="remeshing")
    raise ValueError("retopology-budget-exceeded")


def cpu_time(process):
    import ctypes
    from ctypes import wintypes
    times = [wintypes.FILETIME() for _ in range(4)]
    ctypes.windll.kernel32.GetProcessTimes(wintypes.HANDLE(int(process._handle)), *(ctypes.byref(value) for value in times))
    return sum((value.dwHighDateTime << 32) + value.dwLowDateTime for value in times[2:])


def run_binary(arguments):
    if sys.platform != "win32":
        raise ValueError("platform-unsupported")
    for _ in range(3):
        with tempfile.TemporaryFile() as log:
            process = subprocess.Popen(arguments, shell=False, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NO_WINDOW)
            started = active = time.monotonic()
            last_cpu = last_size = -1
            try:
                while process.poll() is None:
                    now = time.monotonic()
                    current_cpu = cpu_time(process)
                    current_size = os.fstat(log.fileno()).st_size
                    if current_cpu != last_cpu or current_size != last_size:
                        active = now
                        last_cpu, last_size = current_cpu, current_size
                    if now - started > 480:
                        raise ValueError("retopology-timeout")
                    # The upstream optimizer can stop on a lost wake-up while consuming no CPU.
                    if now - active > 5:
                        break
                    time.sleep(0.1)
                else:
                    if process.returncode != 0:
                        raise ValueError("retopology-failed")
                    return
            finally:
                if process.poll() is None:
                    process.kill()
                    process.wait()
        send(type="log", level="info", message="Instant Meshes stopped making progress; retrying the same operation.")
    raise ValueError("instant-meshes-stalled")


def run_job(job):
    if job["task"] != "retopology" or len(job["inputs"]["models"]) != 1:
        raise ValueError("single-model-required")
    params = job["parameters"]
    budget = params.get("faceBudget", 10000)
    resolution = str(params.get("resolution", "1024"))
    if type(budget) is not int or not 128 <= budget <= 100000:
        raise ValueError("invalid-face-budget")
    if resolution not in {"512", "1024", "2048", "4096"}:
        raise ValueError("invalid-resolution")
    data = read_source(job["inputs"]["models"][0])
    binary = verified_binary()
    import numpy as np
    import trimesh
    import xatlas

    scene = trimesh.load(io.BytesIO(data), file_type="glb", resolver={}, process=False)
    mesh = scene.to_geometry()
    if not len(mesh.faces) or len(mesh.faces) > 2000000 or not np.isfinite(mesh.vertices).all():
        raise ValueError("unsupported-model-retopology")
    material = copy.deepcopy(mesh.visual.material) if hasattr(mesh.visual, "material") else trimesh.visual.material.PBRMaterial()
    before = topology(mesh)
    output = Path(job["outputDir"])
    output.mkdir(parents=True, exist_ok=True)
    send(type="progress", value=0.15, stage="remeshing")
    with tempfile.TemporaryDirectory(prefix="instant-", dir=output) as directory:
        temporary = Path(directory)
        positions, inverse = np.unique(mesh.vertices, axis=0, return_inverse=True)
        clean = trimesh.Trimesh(vertices=positions, faces=inverse[mesh.faces], process=False)
        clean.export(temporary / "input.obj", include_texture=False)
        vertices, quads = remesh(binary, temporary / "input.obj", temporary / "result.obj", budget)
        triangles = [triangle for a, b, c, d in quads for triangle in ((a, b, c), (a, c, d))]
        result = trimesh.Trimesh(vertices=vertices, faces=triangles, process=False)
        after = topology(result, quads)
        if after["degenerateFaces"]:
            raise ValueError("retopology-degenerate")
        send(type="progress", value=0.65, stage="unwrapping")
        atlas = xatlas.Atlas()
        atlas.add_mesh(np.asarray(vertices, dtype=np.float32), np.asarray(triangles, dtype=np.uint32))
        pack = xatlas.PackOptions()
        pack.resolution = int(resolution)
        pack.padding = 4
        atlas.generate(pack_options=pack)
        if atlas.atlas_count != 1:
            raise ValueError("uv-atlas-overflow")
        mapping, indices, uvs = atlas[0]
        if not np.isfinite(uvs).all() or np.any(uvs < 0) or np.any(uvs > 1):
            raise ValueError("uv-out-of-bounds")
        result = trimesh.Trimesh(vertices=np.asarray(vertices)[mapping], faces=indices, process=False)
        result.visual = trimesh.visual.TextureVisuals(uv=uvs, material=material)
        pending = temporary / "model.glb"
        result.export(pending)
        exported = trimesh.load(pending, process=False).to_geometry()
        if len(exported.faces) > 2 * budget or len(exported.faces) != len(triangles):
            raise ValueError("retopology-budget-exceeded")
        used = np.asarray(vertices)[np.unique(triangles)]
        if not np.allclose(exported.bounds, np.stack((used.min(axis=0), used.max(axis=0))), atol=max(result.scale * 1e-6, 1e-8)):
            raise ValueError("retopology-transform")
        report = {"version": 1, "task": "retopology", "source": before, "result": after,
                  "warnings": ["uv-regenerated", "topology-rebuilt"],
                  "details": {"method": "instant-meshes", "faceBudget": budget, "quadFaces": len(quads), "resolution": int(resolution), "uvBoundsVerified": True}}
        (temporary / "report.json").write_text(json.dumps(report), encoding="utf8")
        send(type="progress", value=0.9, stage="exporting")
        pending.replace(output / "model.glb")
        (temporary / "report.json").replace(output / "report.json")
    send(type="log", level="info", message=json.dumps(report))
    return [{"path": "model.glb", "kind": "model", "label": "Instant Meshes"}, {"path": "report.json", "kind": "mesh-report", "label": "Mesh report"}]


if __name__ == "__main__":
    try:
        job = json.loads(Path(sys.argv[sys.argv.index("--job") + 1]).read_text(encoding="utf8"))
        send(type="result", files=run_job(job))
    except Exception as error:
        send(type="error", message=str(error))
        sys.exit(1)
