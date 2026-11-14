import json
import struct
import sys
from pathlib import Path


def send(**message):
    print(json.dumps(message), flush=True)


def fail(message):
    send(type="error", message=message)
    sys.exit(1)


def image_info(data):
    if data[:8] == b"\x89PNG\r\n\x1a\n" and data[12:16] == b"IHDR":
        width, height = struct.unpack(">II", data[16:24])
        return "image/png", width, height
    if data[:2] == b"\xff\xd8":
        offset = 2
        while offset + 9 < len(data):
            marker, length = data[offset + 1], struct.unpack(">H", data[offset + 2:offset + 4])[0]
            if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
                height, width = struct.unpack(">HH", data[offset + 5:offset + 9])
                return "image/jpeg", width, height
            offset += 2 + length
    fail("Use a PNG or JPEG reference")


def card_glb(image, mime, aspect, height, double_sided):
    half_width, top = aspect * height / 2, height
    positions = [-half_width, 0, 0, half_width, 0, 0, half_width, top, 0, -half_width, top, 0]
    normals = [0, 0, 1] * 4
    uvs = [0, 1, 1, 1, 1, 0, 0, 0]
    indices = [0, 1, 2, 0, 2, 3]
    chunks = [
        struct.pack("<12f", *positions),
        struct.pack("<12f", *normals),
        struct.pack("<8f", *uvs),
        struct.pack("<6H", *indices),
        image,
    ]
    views, offset, binary = [], 0, b""
    for chunk in chunks:
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(chunk)})
        padded = chunk + b"\0" * (-len(chunk) % 4)
        binary += padded
        offset += len(padded)
    document = {
        "asset": {"version": "2.0", "generator": "forma-engine-template"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "Card"}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2}, "indices": 3, "material": 0}]}],
        "materials": [{"pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "metallicFactor": 0, "roughnessFactor": 0.8}, "doubleSided": double_sided, "alphaMode": "MASK" if mime == "image/png" else "OPAQUE"}],
        "textures": [{"source": 0}],
        "images": [{"bufferView": 4, "mimeType": mime}],
        "buffers": [{"byteLength": len(binary)}],
        "bufferViews": views,
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": 4, "type": "VEC3", "min": [-half_width, 0, 0], "max": [half_width, top, 0]},
            {"bufferView": 1, "componentType": 5126, "count": 4, "type": "VEC3"},
            {"bufferView": 2, "componentType": 5126, "count": 4, "type": "VEC2"},
            {"bufferView": 3, "componentType": 5123, "count": 6, "type": "SCALAR"},
        ],
    }
    payload = json.dumps(document, separators=(",", ":")).encode()
    payload += b" " * (-len(payload) % 4)
    body = struct.pack("<II", len(payload), 0x4E4F534A) + payload + struct.pack("<II", len(binary), 0x004E4942) + binary
    return struct.pack("<4sII", b"glTF", 2, 12 + len(body)) + body


def run_image_to_3d(job, out):
    params = job["parameters"]
    send(type="progress", value=0.1, stage="preparing")
    data = Path(job["inputs"]["images"][0]).read_bytes()
    mime, width, height = image_info(data)
    send(type="log", level="info", message=f"Reference {width}x{height} {mime}")

    send(type="progress", value=0.5, stage="exporting")
    (out / "model.glb").write_bytes(card_glb(data, mime, width / height, float(params["height"]), bool(params["doubleSided"])))
    send(type="progress", value=1, stage="exporting")
    send(type="result", files=[{"path": "model.glb", "label": "Card", "kind": "model"}])


def main():
    job = json.loads(Path(sys.argv[sys.argv.index("--job") + 1]).read_text(encoding="utf8"))
    out = Path(job["outputDir"])
    if job["task"] == "image-to-3d":
        run_image_to_3d(job, out)
    else:
        fail(f"Unsupported task: {job['task']}")


if __name__ == "__main__":
    main()
