import contextlib
import json
import math
from pathlib import Path
import struct
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector


GUIDES = {
    'hips': (0, .52, 0), 'spine': (0, .66, 0), 'chest': (0, .78, 0),
    'neck': (0, .88, 0), 'head': (0, .98, 0),
    'leftHip': (.10, .50, 0), 'rightHip': (-.10, .50, 0),
    'leftShoulder': (.18, .78, 0), 'rightShoulder': (-.18, .78, 0),
    'leftElbow': (.34, .78, 0), 'rightElbow': (-.34, .78, 0),
    'leftWrist': (.47, .78, 0), 'rightWrist': (-.47, .78, 0),
    'leftKnee': (.10, .27, 0), 'rightKnee': (-.10, .27, 0),
    'leftAnkle': (.10, .05, 0), 'rightAnkle': (-.10, .05, 0),
    'leftToe': (.10, .03, .35), 'rightToe': (-.10, .03, .35),
}


def send(message):
    sys.__stdout__.write(json.dumps(message) + '\n')
    sys.__stdout__.flush()


def read_glb(path):
    data = Path(path).read_bytes()
    if len(data) < 20 or data[:4] != b'glTF' or struct.unpack_from('<II', data, 4) != (2, len(data)):
        raise ValueError('invalid-glb')
    length, kind = struct.unpack_from('<II', data, 12)
    if kind != 0x4E4F534A or length > len(data) - 20:
        raise ValueError('invalid-glb')
    return json.loads(data[20:20 + length])


def select(objects, active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = active or objects[0]


def numeric(params, name, default, low, high, integer=False):
    value = params.get(name, default)
    if type(value) not in ({int} if integer else {int, float}) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError('invalid-parameter:' + name)
    return value


def validate_document(doc):
    if any(v.get('uri') and not v['uri'].startswith('data:') for key in ('buffers', 'images') for v in doc.get(key, [])):
        raise ValueError('external-resources-unsupported')
    if len(doc.get('buffers', [])) != 1 or doc['buffers'][0].get('uri'):
        raise ValueError('embedded-buffer-required')
    def has_extensions(value):
        if isinstance(value, dict):
            return bool(value.get('extensions')) or any(has_extensions(v) for v in value.values())
        return isinstance(value, list) and any(has_extensions(v) for v in value)
    if doc.get('extensionsUsed') or doc.get('extensionsRequired') or has_extensions(doc):
        raise ValueError('unsupported-gltf-extensions')
    if any(p.get('targets') for m in doc.get('meshes', []) for p in m['primitives']):
        raise ValueError('morph-targets-unsupported')
    if any(p.get('mode', 4) != 4 for m in doc.get('meshes', []) for p in m['primitives']):
        raise ValueError('triangle-mesh-required')
    if len(doc.get('skins', [])) > 1:
        raise ValueError('multiple-rigs-unsupported')
    if doc.get('skins'):
        if not doc['skins'][0].get('joints') or len(doc['skins'][0]['joints']) > 256:
            raise ValueError('unsupported-joint-count')
        names = [doc['nodes'][i].get('name') for i in doc['skins'][0]['joints']]
        all_names = [n.get('name') for n in doc['nodes']]
        if any(not name or all_names.count(name) != 1 for name in names):
            raise ValueError('ambiguous-joint-names')
    if any(c['target'].get('path') not in {'translation', 'rotation', 'scale'} for a in doc.get('animations', []) for c in a['channels']):
        raise ValueError('unsupported-animation-channel')
    if doc.get('animations') and (any(not a.get('name') for a in doc['animations']) or len({a['name'] for a in doc['animations']}) != len(doc['animations'])):
        raise ValueError('ambiguous-clip-names')


def bounds(meshes):
    points = [obj.matrix_world @ vertex.co for obj in meshes for vertex in obj.data.vertices]
    minimum = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    maximum = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    extent = maximum - minimum
    if not all(math.isfinite(v) for p in points for v in p) or extent.z < 1e-6:
        raise ValueError('invalid-model-bounds')
    return minimum, maximum, max(extent.x, extent.z * .001), extent.z, max(extent.y, extent.z * .001)


def guides(params, meshes):
    low, high, width, height, depth = bounds(meshes)
    points = {}
    normalized = {}
    for name, default in GUIDES.items():
        values = [numeric(params, name + axis, default[i], -.1 if i == 1 else -.75, 1.1 if i == 1 else .75) for i, axis in enumerate('XYZ')]
        normalized[name] = values
        points[name] = Vector(((low.x + high.x) / 2 + values[0] * width, (low.y + high.y) / 2 - values[2] * depth, low.z + values[1] * height))
    if not all(normalized[a][1] < normalized[b][1] for a, b in zip(['hips', 'spine', 'chest', 'neck'], ['spine', 'chest', 'neck', 'head'])):
        raise ValueError('invalid-guide-order')
    for side, sign in [('left', 1), ('right', -1)]:
        if not (normalized[side + 'Ankle'][1] < normalized[side + 'Knee'][1] < normalized[side + 'Hip'][1] <= normalized['hips'][1]):
            raise ValueError('invalid-guide-order')
        if not (0 < sign * normalized[side + 'Shoulder'][0] < sign * normalized[side + 'Elbow'][0] < sign * normalized[side + 'Wrist'][0]) or sign * normalized[side + 'Hip'][0] <= 0:
            raise ValueError('invalid-guide-order')
    return points, height


def create_rig(params, meshes):
    points, height = guides(params, meshes)
    definitions = [('Hips', 'hips', 'spine', None), ('Spine', 'spine', 'chest', 'Hips'), ('Chest', 'chest', 'neck', 'Spine'), ('Neck', 'neck', 'head', 'Chest')]
    points['headTip'] = points['head'] + Vector((0, 0, height * .04))
    definitions.append(('Head', 'head', 'headTip', 'Neck'))
    for side in ('Left', 'Right'):
        key = side.lower()
        points[key + 'HandTip'] = points[key + 'Wrist'] + (points[key + 'Wrist'] - points[key + 'Elbow']) * .16
        definitions.extend([(side + 'Shoulder', 'chest', key + 'Shoulder', 'Chest'), (side + 'UpperArm', key + 'Shoulder', key + 'Elbow', side + 'Shoulder'), (side + 'ForeArm', key + 'Elbow', key + 'Wrist', side + 'UpperArm'), (side + 'Hand', key + 'Wrist', key + 'HandTip', side + 'ForeArm'), (side + 'UpperLeg', key + 'Hip', key + 'Knee', 'Hips'), (side + 'LowerLeg', key + 'Knee', key + 'Ankle', side + 'UpperLeg'), (side + 'Foot', key + 'Ankle', key + 'Toe', side + 'LowerLeg')])
    data = bpy.data.armatures.new('Forma humanoid')
    rig = bpy.data.objects.new('Forma rig', data)
    bpy.context.collection.objects.link(rig)
    select([rig])
    bpy.ops.object.mode_set(mode='EDIT')
    for name, head, tail, parent in definitions:
        if (points[tail] - points[head]).length < height * .005:
            raise ValueError('invalid-bone-length')
        bone = data.edit_bones.new(name)
        bone.head, bone.tail = points[head], points[tail]
        if parent:
            bone.parent = data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    for obj in meshes:
        world = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = world
        for modifier in list(obj.modifiers):
            if modifier.type == 'ARMATURE':
                obj.modifiers.remove(modifier)
        obj.vertex_groups.clear()
    select(meshes + [rig], rig)
    status = bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    if 'FINISHED' not in status:
        raise ValueError('heat-weighting-failed')
    return rig


def weight_stats(meshes, rig, normalize=False):
    weighted = unweighted = 0
    bone_names = {bone.name for bone in rig.data.bones}
    for obj in meshes:
        groups = {g.index: g.name for g in obj.vertex_groups if g.name in bone_names}
        for vertex in obj.data.vertices:
            weights = [(g.group, g.weight) for g in vertex.groups if g.group in groups and g.weight != 0]
            if any(not math.isfinite(w) or w < 0 for _, w in weights):
                raise ValueError('invalid-skin-weights')
            weights.sort(key=lambda pair: pair[1], reverse=True)
            if normalize:
                for group, _ in weights:
                    obj.vertex_groups[group].remove([vertex.index])
                weights = weights[:4]
                total = sum(w for _, w in weights)
                if total > 1e-8:
                    for group, weight in weights:
                        obj.vertex_groups[group].add([vertex.index], weight / total, 'REPLACE')
            elif len(weights) > 4 or weights and abs(sum(w for _, w in weights) - 1) > 1e-4:
                raise ValueError('unsupported-skin-weights')
            if sum(w for _, w in weights) > 1e-8:
                weighted += 1
            else:
                unweighted += 1
    if unweighted:
        raise ValueError('unweighted-vertices')
    return weighted, unweighted


def clip_signature(doc):
    return {a['name']: sorted((doc['nodes'][c['target']['node']].get('name'), c['target']['path']) for c in a['channels']) for a in doc.get('animations', [])}


def run_job(job):
    if job.get('task') != 'rig':
        raise ValueError('unsupported-task')
    models = job.get('inputs', {}).get('models', [])
    if len(models) != 1:
        raise ValueError('single-model-required')
    params = job.get('parameters', {})
    mode, policy = params.get('mode', 'auto'), params.get('clipPolicy', 'preserve')
    if mode not in {'auto', 'edit'} or policy not in {'preserve', 'discard'}:
        raise ValueError('invalid-rig-mode-or-policy')
    doc = read_glb(models[0])
    validate_document(doc)
    validate_source_skin(doc, models[0])
    if mode == 'auto' and (doc.get('skins') or doc.get('animations')) and policy != 'discard':
        raise ValueError('auto-rig-requires-discard')
    if mode == 'edit' and not doc.get('skins'):
        raise ValueError('existing-rig-required')
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(models[0]))
    imported = [obj for obj in bpy.data.objects if obj not in before]
    rigs = [obj for obj in imported if obj.type == 'ARMATURE']
    shapes = {bone.custom_shape for rig in rigs for bone in rig.pose.bones if bone.custom_shape}
    meshes = [obj for obj in imported if obj.type == 'MESH' and obj not in shapes]
    if not meshes or not any(obj.data.polygons for obj in meshes):
        raise ValueError('mesh-required')
    if len(rigs) > 1:
        raise ValueError('multiple-rigs-unsupported')
    send({'type': 'progress', 'value': .2, 'stage': 'rigging'})
    if mode == 'auto':
        rig = create_rig(params, meshes)
    else:
        if len(rigs) != 1:
            raise ValueError('existing-rig-required')
        rig = rigs[0]
        index = numeric(params, 'boneIndex', 0, 0, 255, True)
        joints = doc['skins'][0]['joints']
        if index >= len(joints):
            raise ValueError('bone-index-out-of-range')
        name = doc['nodes'][joints[index]]['name']
        if name not in rig.data.bones:
            raise ValueError('joint-mapping-failed')
        height = bounds(meshes)[3]
        xyz = [numeric(params, 'offset' + axis, 0, -.5, .5) * height for axis in 'XYZ']
        delta = rig.matrix_world.inverted().to_3x3() @ Vector((xyz[0], -xyz[2], xyz[1]))
        select([rig])
        bpy.ops.object.mode_set(mode='EDIT')
        bone = rig.data.edit_bones[name]
        bone.use_connect = False
        bone.head += delta
        bone.tail += delta
        if any(b.length < height * .001 for b in rig.data.edit_bones):
            raise ValueError('invalid-bone-length')
        bpy.ops.object.mode_set(mode='OBJECT')
    weighted, unweighted = weight_stats(meshes, rig, mode == 'auto')
    if policy == 'discard':
        for obj in imported + [rig]:
            obj.animation_data_clear()
    output = Path(job['outputDir'])
    output.mkdir(parents=True, exist_ok=True)
    candidate = output / 'candidate.glb'
    select(meshes + [rig])
    send({'type': 'progress', 'value': .85, 'stage': 'exporting'})
    bpy.ops.export_scene.gltf(filepath=str(candidate), export_format='GLB', use_selection=True, export_animations=policy == 'preserve', export_animation_mode='ACTIONS', export_force_sampling=False, export_bake_animation=False, export_skins=True, export_morph=False, export_all_influences=False, export_def_bones=False, export_tangents=True)
    if mode == 'edit':
        preserve_source(models[0], candidate, policy)
    result = read_glb(candidate)
    if policy == 'preserve' and clip_signature(doc) != clip_signature(result):
        candidate.unlink()
        raise ValueError('clip-preservation-verification-failed')
    source_triangles = sum(doc['accessors'][p['indices']]['count'] // 3 if 'indices' in p else doc['accessors'][p['attributes']['POSITION']]['count'] // 3 for m in doc['meshes'] for p in m['primitives'])
    triangles = sum(result['accessors'][p['indices']]['count'] // 3 for m in result['meshes'] for p in m['primitives'])
    if source_triangles != triangles or len(doc.get('materials', [])) != len(result.get('materials', [])) or any('uri' in i for i in result.get('images', [])):
        candidate.unlink()
        raise ValueError('mesh-preservation-verification-failed')
    if sum('TEXCOORD_0' in p['attributes'] for m in doc['meshes'] for p in m['primitives']) != sum('TEXCOORD_0' in p['attributes'] for m in result['meshes'] for p in m['primitives']):
        candidate.unlink()
        raise ValueError('uv-preservation-verification-failed')
    candidate.replace(output / 'model.glb')
    report = {'version': 1, 'task': 'rig', 'mode': mode, 'boneCount': len(rig.data.bones), 'weightedVertices': weighted, 'unweightedVertices': unweighted, 'clipNames': [a['name'] for a in result.get('animations', [])], 'clipPolicy': policy, 'warnings': ['clips-discarded'] if policy == 'discard' and doc.get('animations') else []}
    (output / 'rig-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    return [{'path': 'model.glb', 'label': 'Rigged model', 'kind': 'model'}, {'path': 'rig-report.json', 'label': 'Rig report', 'kind': 'rig-report'}]



def accessor_values(doc, binary, index):
    accessor = doc['accessors'][index]
    if 'sparse' in accessor or 'bufferView' not in accessor:
        raise ValueError('unsupported-skin-accessor')
    view = doc['bufferViews'][accessor['bufferView']]
    components = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}.get(accessor['type'])
    formats = {5121: ('B', 1, 255), 5123: ('H', 2, 65535), 5126: ('f', 4, 1)}
    if components is None or accessor['componentType'] not in formats or view.get('buffer', 0) != 0:
        raise ValueError('unsupported-skin-accessor')
    code, size, divisor = formats[accessor['componentType']]
    offset = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    stride = view.get('byteStride', components * size)
    if stride < components * size or offset < 0 or offset + max(0, accessor['count'] - 1) * stride + components * size > len(binary):
        raise ValueError('invalid-skin-accessor')
    for i in range(accessor['count']):
        values = struct.unpack_from('<' + code * components, binary, offset + i * stride)
        yield tuple(v / divisor for v in values) if accessor.get('normalized') else values


def validate_source_skin(doc, path):
    if not doc.get('skins'):
        return
    binary = glb_binary(path)
    joints = doc['skins'][0]['joints']
    parents = {child: index for index, node in enumerate(doc['nodes']) for child in node.get('children', [])}
    def world(index, visiting=None):
        visiting = set() if visiting is None else visiting
        if index in visiting:
            raise ValueError('invalid-node-hierarchy')
        visiting.add(index)
        node = doc['nodes'][index]
        if 'matrix' in node:
            flat = node['matrix']
            local = Matrix([flat[i:i + 4] for i in range(0, 16, 4)]).transposed()
        else:
            rotation = node.get('rotation', [0, 0, 0, 1])
            local = Matrix.LocRotScale(Vector(node.get('translation', [0, 0, 0])), Quaternion((rotation[3], *rotation[:3])), Vector(node.get('scale', [1, 1, 1])))
        return world(parents[index], visiting) @ local if index in parents else local
    def identity(matrix):
        return all(math.isfinite(matrix[i][j]) and abs(matrix[i][j] - int(i == j)) < 1e-4 for i in range(4) for j in range(4))
    for node_index, node in enumerate(doc['nodes']):
        if 'skin' not in node:
            continue
        if node['skin'] != 0 or not identity(world(node_index)):
            raise ValueError('unsupported-skinned-transform')
        for primitive in doc['meshes'][node['mesh']]['primitives']:
            attrs = primitive['attributes']
            if 'WEIGHTS_0' not in attrs or 'JOINTS_0' not in attrs or any(key.startswith(('WEIGHTS_', 'JOINTS_')) and not key.endswith('_0') for key in attrs):
                raise ValueError('unsupported-skin-weights')
            wa, ja = doc['accessors'][attrs['WEIGHTS_0']], doc['accessors'][attrs['JOINTS_0']]
            count = doc['accessors'][attrs['POSITION']]['count']
            if wa['type'] != 'VEC4' or ja['type'] != 'VEC4' or wa['count'] != count or ja['count'] != count or ja['componentType'] not in {5121, 5123} or ja.get('normalized'):
                raise ValueError('unsupported-skin-weights')
            for weights, indices in zip(accessor_values(doc, binary, attrs['WEIGHTS_0']), accessor_values(doc, binary, attrs['JOINTS_0'])):
                if any(not math.isfinite(w) or w < 0 for w in weights) or any(index >= len(joints) for index in indices):
                    raise ValueError('invalid-skin-weights')
                if sum(weights) <= 1e-8:
                    raise ValueError('unweighted-vertices')
                if abs(sum(weights) - 1) > 1e-4:
                    raise ValueError('unsupported-skin-weights')
    skin = doc['skins'][0]
    if 'inverseBindMatrices' not in skin:
        raise ValueError('unsupported-bind-pose')
    accessor = doc['accessors'][skin['inverseBindMatrices']]
    if accessor['type'] != 'MAT4' or accessor['componentType'] != 5126 or accessor['count'] != len(joints):
        raise ValueError('unsupported-bind-pose')
    for joint, values in zip(joints, accessor_values(doc, binary, skin['inverseBindMatrices'])):
        inverse = Matrix([values[i:i + 4] for i in range(0, 16, 4)]).transposed()
        if not identity(world(joint) @ inverse):
            raise ValueError('unsupported-bind-pose')
        ancestor = parents.get(joint)
        while ancestor is not None:
            if ancestor not in joints and not identity(world(ancestor)):
                raise ValueError('unsupported-skinned-transform')
            ancestor = parents.get(ancestor)

def main():
    try:
        path = sys.argv[sys.argv.index('--job') + 1]
        job = json.loads(Path(path).read_text(encoding='utf-8'))
        with contextlib.redirect_stdout(sys.stderr):
            files = run_job(job)
        send({'type': 'result', 'files': files})
    except Exception as error:
        send({'type': 'error', 'message': str(error)})
        sys.exit(1)





def glb_binary(path):
    data = Path(path).read_bytes()
    offset = 20 + struct.unpack_from('<I', data, 12)[0]
    if offset + 8 > len(data):
        raise ValueError('embedded-buffer-required')
    length, kind = struct.unpack_from('<II', data, offset)
    if kind != 0x004E4942:
        raise ValueError('embedded-buffer-required')
    return data[offset + 8:offset + 8 + length]


def write_glb(path, document, binary):
    payload = json.dumps(document, separators=(',', ':')).encode()
    payload += b' ' * (-len(payload) % 4)
    binary += b'\0' * (-len(binary) % 4)
    Path(path).write_bytes(struct.pack('<4sII', b'glTF', 2, 28 + len(payload) + len(binary)) + struct.pack('<II', len(payload), 0x4E4F534A) + payload + struct.pack('<II', len(binary), 0x004E4942) + binary)


def preserve_source(source, candidate, policy):
    original, result = read_glb(source), read_glb(candidate)
    def parents(doc):
        return {child: index for index, node in enumerate(doc['nodes']) for child in node.get('children', [])}
    old_parents, new_parents = parents(original), parents(result)
    old_joints, new_joints = original['skins'][0]['joints'], result['skins'][0]['joints']
    by_name = {result['nodes'][index]['name']: index for index in new_joints}
    if len(by_name) != len(old_joints):
        raise ValueError('joint-mapping-failed')
    for index in old_joints:
        name = original['nodes'][index]['name']
        target = by_name.get(name)
        if target is None:
            raise ValueError('joint-mapping-failed')
        old_parent = original['nodes'][old_parents[index]].get('name') if index in old_parents else None
        new_parent = result['nodes'][new_parents[target]].get('name') if target in new_parents else None
        if old_parents.get(index) in old_joints or new_parents.get(target) in new_joints:
            if old_parent != new_parent:
                raise ValueError('rig-hierarchy-preservation-failed')
        else:
            a = original['nodes'][old_parents[index]] if index in old_parents else {}
            b = result['nodes'][new_parents[target]] if target in new_parents else {}
            for key, default in [('translation', [0, 0, 0]), ('rotation', [0, 0, 0, 1]), ('scale', [1, 1, 1])]:
                if any(abs(x-y) > 1e-5 for x, y in zip(a.get(key, default), b.get(key, default))) or a.get('matrix') != b.get('matrix'):
                    raise ValueError('rig-hierarchy-preservation-failed')
        for key in ('matrix', 'translation', 'rotation', 'scale'):
            original['nodes'][index].pop(key, None)
            if key in result['nodes'][target]:
                original['nodes'][index][key] = result['nodes'][target][key]
    accessor = result['accessors'][result['skins'][0]['inverseBindMatrices']]
    view = result['bufferViews'][accessor['bufferView']]
    if accessor['componentType'] != 5126 or accessor['type'] != 'MAT4' or 'sparse' in accessor:
        raise ValueError('invalid-inverse-bind-matrices')
    binary = glb_binary(source)
    binary += b'\0' * (-len(binary) % 4)
    offset = len(binary)
    generated = glb_binary(candidate)
    start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    matrices = {result['nodes'][joint]['name']: generated[start + i * view.get('byteStride', 64):start + i * view.get('byteStride', 64) + 64] for i, joint in enumerate(new_joints)}
    payload = b''.join(matrices[original['nodes'][joint]['name']] for joint in old_joints)
    if not all(math.isfinite(v) for v in struct.unpack('<' + 'f' * (len(payload) // 4), payload)):
        raise ValueError('invalid-inverse-bind-matrices')
    original.setdefault('bufferViews', []).append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(payload)})
    original['accessors'].append({'bufferView': len(original['bufferViews']) - 1, 'componentType': 5126, 'count': len(old_joints), 'type': 'MAT4'})
    original['skins'][0]['inverseBindMatrices'] = len(original['accessors']) - 1
    original['buffers'] = [{'byteLength': offset + len(payload)}]
    if policy == 'discard':
        original.pop('animations', None)
    write_glb(candidate, original, binary + payload)


if __name__ == '__main__':
    main()
