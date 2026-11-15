import importlib.util
import json
import math
import os
import shutil
import sys
import subprocess
from pathlib import Path
import tempfile
import unittest

import bpy
import bmesh

sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parent


class MeshEngineTests(unittest.TestCase):
    def setUp(self):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        self.temp = tempfile.TemporaryDirectory(prefix="forma-blender-test-")
        self.folder = Path(self.temp.name)
        spec = importlib.util.spec_from_file_location("mesh_engine", ROOT / "main.py")
        self.assertTrue(Path(spec.origin).exists(), "Blender mesh engine must exist")
        self.engine = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.engine)

    def tearDown(self):
        if os.environ.get("FORMA_BLENDER_EVIDENCE"):
            shutil.copytree(self.folder, Path(os.environ["FORMA_BLENDER_EVIDENCE"]) / self._testMethodName, dirs_exist_ok=True)
        self.temp.cleanup()

    def save(self, name="input.glb"):
        path = self.folder / name
        bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=False)
        return str(path)

    def job(self, task, models, parameters=None):
        output = self.folder / f"out-{task}"
        output.mkdir(exist_ok=True)
        files = self.engine.run_job({"task": task, "inputs": {"models": models}, "parameters": parameters or {}, "outputDir": str(output)})
        report = json.loads((output / "report.json").read_text())
        return output, report, files

    def test_open_disconnected_degenerate_and_non_manifold_counts(self):
        mesh = bpy.data.meshes.new("fixture")
        mesh.from_pydata([(0,0,0),(1,0,0),(0,1,0),(0,-1,0),(0,0,1),(3,0,0),(4,0,0),(5,0,0)], [], [(0,1,2),(1,0,3),(0,1,4),(5,6,7)])
        obj = bpy.data.objects.new("fixture", mesh)
        bpy.context.collection.objects.link(obj)
        report = self.engine.inspect_meshes([obj])
        self.assertEqual(report["components"], 2)
        self.assertEqual(report["degenerateFaces"], 1)
        self.assertEqual(report["boundaryEdges"], 9)
        self.assertEqual(report["nonManifoldEdges"], 10)

    def test_coincident_degenerate_face_is_counted_before_seam_welding(self):
        mesh = bpy.data.meshes.new("coincident")
        mesh.from_pydata([(0,0,0),(0,0,0),(1,0,0)], [], [(0,1,2)])
        obj = bpy.data.objects.new("coincident", mesh)
        bpy.context.collection.objects.link(obj)
        report = self.engine.inspect_meshes([obj])
        self.assertEqual(report["degenerateFaces"], 1)
        self.assertEqual(report["faces"], 1)

    def test_uv_atlas_and_template_export(self):
        bpy.ops.mesh.primitive_cube_add()
        source = self.save()
        output, report, files = self.job("uv-unwrap", [source], {"resolution": "512"})
        self.assertEqual({f["kind"] for f in files}, {"model", "uv-template", "mesh-report"})
        self.assertEqual((output / "uv-template.png").read_bytes()[:8], b"\x89PNG\r\n\x1a\n")
        template = bpy.data.images.load(str(output / "uv-template.png"))
        self.assertEqual(tuple(template.size), (512, 512))
        self.assertGreater(sum(template.pixels[3::4]), 500)
        self.assertEqual(report["details"]["resolution"], 512)
        self.assertTrue(report["details"]["uvBoundsVerified"])
        doc = self.engine.read_glb(output / "model.glb")
        self.assertTrue(all("TEXCOORD_0" in p["attributes"] for m in doc["meshes"] for p in m["primitives"]))

    def test_uv_regeneration_rejects_textured_material_without_publishing(self):
        bpy.ops.mesh.primitive_cube_add()
        material = bpy.data.materials.new("textured")
        material.use_nodes = True
        image = material.node_tree.nodes.new("ShaderNodeTexImage")
        image.image = bpy.data.images.new("color", width=4, height=4)
        material.node_tree.links.new(image.outputs["Color"], material.node_tree.nodes.get("Principled BSDF").inputs["Base Color"])
        bpy.context.object.data.materials.append(material)
        source = self.save()
        with self.assertRaisesRegex(ValueError, "unsupported-material-uv-regeneration"):
            self.job("uv-unwrap", [source])
        self.assertFalse((self.folder / "out-uv-unwrap" / "model.glb").exists())

    def test_morphs_rejected_before_modification(self):
        bpy.ops.mesh.primitive_cube_add()
        bpy.context.object.shape_key_add(name="Basis")
        bpy.context.object.shape_key_add(name="morph")
        source = self.save()
        with self.assertRaisesRegex(ValueError, "unsupported-rigged"):
            self.job("normals", [source], {"mode": "recalculate"})

    def test_real_skin_is_rejected_before_modification(self):
        bpy.ops.mesh.primitive_cube_add()
        mesh = bpy.context.object
        armature = bpy.data.armatures.new("skeleton")
        rig = bpy.data.objects.new("rig", armature)
        bpy.context.collection.objects.link(rig)
        self.engine.select([rig])
        bpy.ops.object.mode_set(mode="EDIT")
        bone = armature.edit_bones.new("root")
        bone.head = (0, 0, 0)
        bone.tail = (0, 0, 1)
        bpy.ops.object.mode_set(mode="OBJECT")
        group = mesh.vertex_groups.new(name="root")
        group.add(list(range(len(mesh.data.vertices))), 1, "REPLACE")
        modifier = mesh.modifiers.new("skin", "ARMATURE")
        modifier.object = rig
        mesh.parent = rig
        source = self.save()
        self.assertTrue(self.engine.read_glb(source).get("skins"))
        with self.assertRaisesRegex(ValueError, "unsupported-rigged"):
            self.job("uv-unwrap", [source])

    def test_parameter_bounds_rejected(self):
        bpy.ops.mesh.primitive_cube_add()
        source = self.save()
        with self.assertRaisesRegex(ValueError, "invalid-resolution"):
            self.job("uv-unwrap", [source], {"resolution": "128"})
        with self.assertRaisesRegex(ValueError, "invalid-normal-mode"):
            self.job("normals", [source], {"mode": "wrong"})

    def test_normal_bake_requires_second_model(self):
        bpy.ops.mesh.primitive_cube_add()
        source = self.save()
        with self.assertRaisesRegex(ValueError, "bake-source-required"):
            self.job("normals", [source], {"mode": "bake"})

    def test_normal_bake_rejects_distant_source(self):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8)
        low = self.save("low.glb")
        bpy.context.object.location.x = 100
        high = self.save("distant.glb")
        with self.assertRaisesRegex(ValueError, "bake-source-no-overlap"):
            self.job("normals", [low, high], {"mode": "bake", "resolution": "512"})

    def test_normal_recalculation_exports_only_target_mesh(self):
        bpy.ops.mesh.primitive_cube_add()
        bm = bmesh.new()
        bm.from_mesh(bpy.context.object.data)
        bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
        bm.to_mesh(bpy.context.object.data)
        bm.free()
        source = self.save()
        bpy.ops.mesh.primitive_uv_sphere_add()
        output, report, _ = self.job("normals", [source], {"mode": "recalculate"})
        document = self.engine.read_glb(output / "model.glb")
        self.assertEqual(len(document["meshes"]), 1)
        self.assertEqual(report["result"]["triangles"], 12)
        meshes, _ = self.engine.load_model(output / "model.glb", True)
        bm = bmesh.new()
        bm.from_mesh(meshes[0].data)
        self.assertGreater(bm.calc_volume(signed=True), 0)
        bm.free()
        mesh = meshes[0].data
        self.assertTrue(all(mesh.vertices[loop.vertex_index].co.dot(normal.vector) > 0 for loop, normal in zip(mesh.loops, mesh.corner_normals)))

    def test_jsonlines_process_protocol_emits_report_and_errors(self):
        bpy.ops.mesh.primitive_cube_add()
        source = self.save()
        output = self.folder / "protocol"
        job = self.folder / "job.json"
        job.write_text(json.dumps({"task": "normals", "inputs": {"models": [source]}, "parameters": {}, "outputDir": str(output)}))
        command = [bpy.app.binary_path, "--background", "--factory-startup", "--python-exit-code", "1", "--python", str(ROOT / "main.py"), "--", "--job", str(job)]
        result = subprocess.run(command, capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        messages = [json.loads(line) for line in result.stdout.splitlines() if line.startswith('{"type":')]
        self.assertTrue(any(message["type"] == "progress" for message in messages))
        self.assertIn("mesh-report", [f["kind"] for f in next(message for message in messages if message["type"] == "result")["files"]])
        self.assertTrue((output / "report.json").exists())
        job.write_text(json.dumps({"task": "wrong"}))
        result = subprocess.run(command, capture_output=True, text=True, timeout=30)
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(any(json.loads(line).get("type") == "error" for line in result.stdout.splitlines() if line.startswith('{"type":')))

    def test_external_images_are_rejected_before_import(self):
        bpy.ops.mesh.primitive_cube_add()
        source = Path(self.save())
        document = self.engine.read_glb(source)
        document["images"] = [{"uri": "file:///private.png"}]
        import struct
        data = source.read_bytes()
        old = struct.unpack_from("<I", data, 12)[0]
        encoded = json.dumps(document).encode()
        encoded += b" " * (-len(encoded) % 4)
        tail = data[20 + old:]
        source.write_bytes(struct.pack("<4sII", b"glTF", 2, 20 + len(encoded) + len(tail)) + struct.pack("<II", len(encoded), 0x4E4F534A) + encoded + tail)
        with self.assertRaisesRegex(ValueError, "external-resources-unsupported"):
            self.job("normals", [str(source)])

    def test_normal_bake_exports_real_embedded_normal_map(self):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8)
        low = self.save("low.glb")
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16)
        obj = bpy.context.object
        for vertex in obj.data.vertices:
            vertex.co *= 1 + 0.025 * math.sin(vertex.co.x * 20) * math.sin(vertex.co.z * 20)
        high = self.save("high.glb")
        output, report, _ = self.job("normals", [low, high], {"mode": "bake", "resolution": "512"})
        doc = self.engine.read_glb(output / "model.glb")
        self.assertTrue(any("normalTexture" in m for m in doc["materials"]))
        normal_material = next(m for m in doc["materials"] if "normalTexture" in m)
        texture = doc["textures"][normal_material["normalTexture"]["index"]]
        self.assertEqual(texture.get("extras", {}).get("formaMapSources", {}).get("normal"), "baked")
        self.assertTrue(all("bufferView" in i for i in doc["images"]))
        self.assertGreater(report["details"]["normalVariation"], 0.01)
        self.assertEqual(report["details"]["bakeEngine"], "CYCLES_CPU")

    def test_occlusion_bake_adds_map_without_touching_original_data(self):
        bpy.ops.mesh.primitive_plane_add(size=4)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.5))
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.object.join()
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project()
        bpy.ops.object.mode_set(mode="OBJECT")
        source = self.save("occlusion.glb")
        original = self.engine.read_glb(source)
        output, report, files = self.job("ambient-occlusion", [source], {"resolution": "512", "samples": 16})
        doc = self.engine.read_glb(output / "model.glb")
        self.assertEqual(doc["accessors"], original["accessors"])
        self.assertEqual(doc["bufferViews"][:len(original["bufferViews"])], original["bufferViews"])
        source_bytes = Path(source).read_bytes()
        result_bytes = (output / "model.glb").read_bytes()
        source_bin = source_bytes[20 + int.from_bytes(source_bytes[12:16], "little") + 8:]
        result_bin = result_bytes[20 + int.from_bytes(result_bytes[12:16], "little") + 8:]
        self.assertEqual(result_bin[:len(source_bin.rstrip(b"\0"))], source_bin.rstrip(b"\0"))
        occlusion = doc["materials"][0]["occlusionTexture"]
        self.assertEqual(occlusion["texCoord"], 0)
        texture = doc["textures"][occlusion["index"]]
        self.assertEqual(texture["extras"]["formaMapSources"]["ao"], "baked")
        self.assertEqual(doc["images"][texture["source"]]["mimeType"], "image/png")
        self.assertGreater(report["details"]["coverage"], 0.05)
        self.assertLess(report["details"]["minOcclusion"], 0.6)
        self.assertIn({"path": "occlusion.png", "label": "Ambient occlusion", "kind": "image"}, files)

    def test_occlusion_bake_ignores_other_scene_objects(self):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=1)
        source = self.save("sphere.glb")
        bpy.ops.mesh.primitive_cube_add(size=2)
        _, report, _ = self.job("ambient-occlusion", [source], {"resolution": "512", "samples": 16})
        self.assertGreater(report["details"]["meanOcclusion"], 0.95)

    def test_occlusion_bake_requires_uvs(self):
        bpy.ops.mesh.primitive_cube_add()
        bpy.context.object.data.uv_layers.remove(bpy.context.object.data.uv_layers[0])
        with self.assertRaisesRegex(ValueError, "occlusion-uv-required"):
            self.job("ambient-occlusion", [self.save()])


if __name__ == "__main__":
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(MeshEngineTests))
    if not result.wasSuccessful():
        raise RuntimeError("Blender mesh tests failed")
