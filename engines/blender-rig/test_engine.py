import importlib.util
import json
import math
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest

import bpy
from mathutils import Vector

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('rig_engine', ROOT / 'main.py')
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)


def create_humanoid(path):
    pieces = []
    boxes = [((0, 0, 1.25), (.32, .16, .36)), ((0, 0, 1.78), (.18, .15, .22)), ((0, 0, 1.57), (1, .12, .10))]
    for x in (-.20, .20):
        boxes.extend([((x, 0, .52), (.12, .14, .52)), ((x, -.08, .08), (.13, .23, .08))])
    for location, scale in boxes:
        bpy.ops.mesh.primitive_cube_add(size=2, location=location)
        obj = bpy.context.object
        obj.scale = scale
        pieces.append(obj)
    engine.select(pieces)
    bpy.ops.object.join()
    obj = bpy.context.object
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.remesh_voxel_size = .065
    bpy.ops.object.voxel_remesh()
    smooth = obj.modifiers.new('smooth', 'SMOOTH')
    smooth.factor = .6
    smooth.iterations = 3
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    obj.name = 'Humanoid'
    material = bpy.data.materials.new('plain')
    material.use_nodes = True
    material.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = .31
    obj.data.materials.append(material)
    engine.select([obj])
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project()
    bpy.ops.object.mode_set(mode='OBJECT')
    path = Path(path)
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB')
    return path



class RigTests(unittest.TestCase):
    def setUp(self):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        self.temp = tempfile.TemporaryDirectory(prefix='forma-rig-')
        self.folder = Path(self.temp.name)

    def tearDown(self):
        if os.environ.get('FORMA_BLENDER_EVIDENCE'):
            shutil.copytree(self.folder, Path(os.environ['FORMA_BLENDER_EVIDENCE']) / self._testMethodName, dirs_exist_ok=True)
        self.temp.cleanup()

    def fixture(self):
        return create_humanoid(self.folder / 'source.glb')

    def job(self, source, **params):
        output = self.folder / ('output-' + str(len(list(self.folder.glob('output-*')))))
        files = engine.run_job({'task': 'rig', 'inputs': {'models': [str(source)]}, 'parameters': params, 'outputDir': str(output)})
        return output / 'model.glb', json.loads((output / 'rig-report.json').read_text()), files

    def imported(self, path):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(path))
        objects = [o for o in bpy.data.objects if o not in before]
        return next(o for o in objects if o.type == 'MESH'), next(o for o in objects if o.type == 'ARMATURE')

    def test_auto_real_weights_deformation_and_original(self):
        source = self.fixture()
        original = source.read_bytes()
        path, report, files = self.job(source)
        self.assertEqual(report['boneCount'], 19)
        self.assertEqual(report['unweightedVertices'], 0)
        self.assertGreater(report['weightedVertices'], 500)
        self.assertEqual({f['kind'] for f in files}, {'model', 'rig-report'})
        mesh, rig = self.imported(path)
        engine.weight_stats([mesh], rig)
        self.assertEqual(len(rig.data.bones), 19)
        graph = bpy.context.evaluated_depsgraph_get()
        before = [v.co.copy() for v in mesh.evaluated_get(graph).data.vertices]
        bone = rig.pose.bones['LeftUpperArm']
        bone.rotation_mode = 'XYZ'
        bone.rotation_euler.y = .7
        bpy.context.view_layer.update()
        after = [v.co.copy() for v in mesh.evaluated_get(graph).data.vertices]
        self.assertGreater(max((a-b).length for a, b in zip(before, after)), .05)
        self.assertEqual(source.read_bytes(), original)
        doc = engine.read_glb(path)
        self.assertTrue(doc['skins'][0]['inverseBindMatrices'] >= 0)
        self.assertAlmostEqual(doc['materials'][0]['pbrMetallicRoughness']['roughnessFactor'], .31, places=5)
        self.assertTrue(all('TEXCOORD_0' in p['attributes'] for m in doc['meshes'] for p in m['primitives']))

    def test_edit_existing_joint_preserves_weights_and_changes_bind(self):
        source = self.fixture()
        rigged, _, _ = self.job(source)
        original = rigged.read_bytes()
        source_doc = engine.read_glb(rigged)
        index = next(i for i, n in enumerate(source_doc['skins'][0]['joints']) if source_doc['nodes'][n]['name'] == 'LeftForeArm')
        edited, _, _ = self.job(rigged, mode='edit', boneIndex=index, offsetY=.02)
        mesh_a, rig_a = self.imported(rigged)
        mesh_b, rig_b = self.imported(edited)
        self.assertAlmostEqual((rig_b.data.bones['LeftForeArm'].head_local-rig_a.data.bones['LeftForeArm'].head_local).z, engine.bounds([mesh_a])[3]*.02, places=4)
        self.assertEqual(len(mesh_a.data.vertices), len(mesh_b.data.vertices))
        for a, b in zip(mesh_a.data.vertices, mesh_b.data.vertices):
            wa = {mesh_a.vertex_groups[g.group].name: g.weight for g in a.groups}
            wb = {mesh_b.vertex_groups[g.group].name: g.weight for g in b.groups}
            self.assertEqual(wa.keys(), wb.keys())
            for name in wa:
                self.assertAlmostEqual(wa[name], wb[name], places=5)
        self.assertEqual(rigged.read_bytes(), original)

    def test_actual_animated_clip_preserve_and_discard(self):
        source = self.fixture()
        rigged, _, _ = self.job(source)
        bpy.ops.wm.read_factory_settings(use_empty=True)
        mesh, rig = self.imported(rigged)
        bone = rig.pose.bones['LeftUpperArm']
        bone.rotation_mode = 'QUATERNION'
        bone.rotation_quaternion = (1, 0, 0, 0)
        bone.keyframe_insert('rotation_quaternion', frame=1)
        bone.rotation_quaternion = (.9238795, 0, .3826834, 0)
        bone.keyframe_insert('rotation_quaternion', frame=20)
        rig.animation_data.action.name = 'Wave'
        bpy.context.scene.frame_end = 20
        animated = self.folder / 'animated.glb'
        engine.select([mesh, rig])
        bpy.ops.export_scene.gltf(filepath=str(animated), export_format='GLB', use_selection=True, export_force_sampling=False)
        self.assertTrue(engine.read_glb(animated).get('animations'))
        with self.assertRaisesRegex(ValueError, 'auto-rig-requires-discard'):
            self.job(animated)
        edited, report, _ = self.job(animated, mode='edit', offsetX=.01)
        self.assertEqual(report['clipNames'], ['Wave'])
        self.assertEqual(engine.clip_signature(engine.read_glb(animated)), engine.clip_signature(engine.read_glb(edited)))
        bpy.ops.wm.read_factory_settings(use_empty=True)
        mesh, rig = self.imported(edited)
        bpy.context.scene.frame_set(1)
        a = rig.pose.bones['LeftUpperArm'].matrix.copy()
        bpy.context.scene.frame_set(20)
        b = rig.pose.bones['LeftUpperArm'].matrix.copy()
        self.assertGreater(sum(abs(a[i][j]-b[i][j]) for i in range(4) for j in range(4)), .1)
        discarded, report, _ = self.job(animated, mode='edit', clipPolicy='discard')
        self.assertFalse(engine.read_glb(discarded).get('animations'))
        self.assertEqual(report['warnings'], ['clips-discarded'])

    def test_raw_zero_weights_and_incompatible_bind_are_rejected(self):
        source = self.fixture()
        rigged, _, _ = self.job(source)
        original = rigged.read_bytes()
        doc = engine.read_glb(rigged)
        weight = doc['meshes'][0]['primitives'][0]['attributes']['WEIGHTS_0']
        accessor = doc['accessors'][weight]
        view = doc['bufferViews'][accessor['bufferView']]
        data = bytearray(original)
        start = 28 + struct.unpack_from('<I', data, 12)[0] + view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
        size = {5121: 1, 5123: 2, 5126: 4}[accessor['componentType']]
        data[start:start + size * 4] = b'\0' * (size * 4)
        rigged.write_bytes(data)
        with self.assertRaisesRegex(ValueError, 'unweighted-vertices'):
            self.job(rigged, mode='edit')
        rigged.write_bytes(original)
        def change_bind(document):
            joint = document['nodes'][document['skins'][0]['joints'][0]]
            translation = joint.setdefault('translation', [0, 0, 0])
            translation[0] += .2
        self.patch(rigged, change_bind)
        with self.assertRaisesRegex(ValueError, 'unsupported-bind-pose'):
            self.job(rigged, mode='edit')
        rigged.write_bytes(original)
        self.patch(rigged, lambda d: next(n for n in d['nodes'] if 'skin' in n).update(translation=[.2, 0, 0]))
        with self.assertRaisesRegex(ValueError, 'unsupported-skinned-transform'):
            self.job(rigged, mode='edit')

    def test_protocol_and_portable_animated_fixture(self):
        source = create_animated_rig(self.folder / 'animated-fixture.glb')
        self.assertEqual(engine.clip_signature(engine.read_glb(source)).keys(), {'Wave'})
        job = self.folder / 'job.json'
        output = self.folder / 'protocol'
        job.write_text(json.dumps({'task': 'rig', 'inputs': {'models': [str(source)]}, 'parameters': {'mode': 'edit', 'clipPolicy': 'preserve', 'offsetY': .01}, 'outputDir': str(output)}))
        command = [bpy.app.binary_path, '--background', '--factory-startup', '--python-exit-code', '1', '--python', str(ROOT / 'main.py'), '--', '--job', str(job)]
        result = subprocess.run(command, capture_output=True, text=True, timeout=60)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        messages = [json.loads(line) for line in result.stdout.splitlines() if line.startswith('{"type":')]
        self.assertTrue(any(m['type'] == 'result' for m in messages))
        self.assertEqual(json.loads((output / 'rig-report.json').read_text())['clipNames'], ['Wave'])
        job.write_text(json.dumps({'task': 'wrong'}))
        result = subprocess.run(command, capture_output=True, text=True, timeout=60)
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(any(json.loads(line).get('type') == 'error' for line in result.stdout.splitlines() if line.startswith('{"type":')))

    def patch(self, source, mutate):
        data = source.read_bytes()
        doc = engine.read_glb(source)
        mutate(doc)
        old = struct.unpack_from('<I', data, 12)[0]
        payload = json.dumps(doc).encode()
        payload += b' ' * (-len(payload) % 4)
        tail = data[20+old:]
        source.write_bytes(struct.pack('<4sII', b'glTF', 2, 20+len(payload)+len(tail))+struct.pack('<II',len(payload),0x4E4F534A)+payload+tail)

    def test_guards_external_morphs_material_extensions_guides_and_weights(self):
        source = self.fixture()
        data = source.read_bytes()
        cases = [ (lambda d: d.update(images=[{'uri': '../private.png'}]), 'external-resources-unsupported'), (lambda d: d['meshes'][0]['primitives'][0].update(targets=[{}]), 'morph-targets-unsupported'), (lambda d: d.update(extensionsUsed=['KHR_materials_clearcoat']), 'unsupported-gltf-extensions') ]
        for mutate, error in cases:
            self.patch(source, mutate)
            with self.assertRaisesRegex(ValueError, error):
                self.job(source)
            source.write_bytes(data)
        for params, error in [({'spineY': .3}, 'invalid-guide-order'), ({'hipsX': float('nan')}, 'invalid-parameter'), ({'leftWristX': .8}, 'invalid-parameter')]:
            with self.assertRaisesRegex(ValueError, error):
                self.job(source, **params)
        rigged, _, _ = self.job(source)
        mesh, rig = self.imported(rigged)
        for g in mesh.vertex_groups:
            g.remove([0])
        with self.assertRaisesRegex(ValueError, 'unweighted-vertices'):
            engine.weight_stats([mesh], rig)


def create_animated_rig(path):
    path = Path(path)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    with tempfile.TemporaryDirectory(prefix='forma-rig-fixture-') as temporary:
        source = create_humanoid(Path(temporary) / 'source.glb')
        output = Path(temporary) / 'rigged'
        engine.run_job({'task': 'rig', 'inputs': {'models': [str(source)]}, 'outputDir': str(output)})
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=str(output / 'model.glb'))
        rig = next(obj for obj in bpy.data.objects if obj.type == 'ARMATURE')
        mesh = next(obj for obj in bpy.data.objects if obj.type == 'MESH' and obj.parent == rig)
        bone = rig.pose.bones['LeftUpperArm']
        bone.rotation_mode = 'QUATERNION'
        bone.rotation_quaternion = (1, 0, 0, 0)
        bone.keyframe_insert('rotation_quaternion', frame=1)
        bone.rotation_quaternion = (.9238795, 0, .3826834, 0)
        bone.keyframe_insert('rotation_quaternion', frame=20)
        rig.animation_data.action.name = 'Wave'
        bpy.context.scene.frame_end = 20
        engine.select([mesh, rig])
        bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True, export_force_sampling=False)
    return path


if __name__ == '__main__':
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(RigTests))
    if not result.wasSuccessful():
        raise RuntimeError('Blender rig tests failed')
