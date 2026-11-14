import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
import sys

import numpy as np
from scipy.spatial.transform import Rotation


MODEL_SHA256 = '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a'
CANONICAL = ['Hips', 'Spine', 'Chest', 'Neck', 'Head'] + [side + bone for side in ('Left', 'Right') for bone in ('Shoulder', 'UpperArm', 'ForeArm', 'Hand', 'UpperLeg', 'LowerLeg', 'Foot')]
CHILD = {'Hips': 'Spine', 'Spine': 'Chest', 'Chest': 'Neck', 'Neck': 'Head'} | {side + bone: side + child for side in ('Left', 'Right') for bone, child in [('Shoulder', 'UpperArm'), ('UpperArm', 'ForeArm'), ('ForeArm', 'Hand'), ('UpperLeg', 'LowerLeg'), ('LowerLeg', 'Foot')]}
REQUIRED = [11, 12, 13, 14, 15, 16, 19, 20, 23, 24, 25, 26, 27, 28, 31, 32]


def send(message):
    print(json.dumps(message, allow_nan=False), flush=True)


def number(parameters, name, default, minimum, maximum, integer=False):
    value = parameters.get(name, default)
    if type(value) not in ({int} if integer else {int, float}) or not math.isfinite(value) or not minimum <= value <= maximum:
        raise ValueError('invalid-parameter:' + name)
    return value


def between(source, target):
    a, b = np.asarray(source, dtype=float), np.asarray(target, dtype=float)
    lengths = np.linalg.norm(a), np.linalg.norm(b)
    if min(lengths) < 1e-8 or not np.all(np.isfinite([a, b])):
        raise ValueError('degenerate-pose-direction')
    a, b = a / lengths[0], b / lengths[1]
    cosine = float(np.clip(np.dot(a, b), -1, 1))
    if cosine < -0.999999:
        axis = np.cross(a, np.eye(3)[int(np.argmin(np.abs(a)))])
        return np.append(axis / np.linalg.norm(axis), 0).tolist()
    quaternion = np.append(np.cross(a, b), 1 + cosine)
    return (quaternion / np.linalg.norm(quaternion)).tolist()


def read_target(path):
    raw = Path(path).read_bytes()
    if len(raw) < 20 or raw[:4] != b'glTF' or struct.unpack_from('<II', raw, 4) != (2, len(raw)):
        raise ValueError('invalid-glb')
    size, kind = struct.unpack_from('<II', raw, 12)
    if kind != 0x4E4F534A or size > len(raw) - 20:
        raise ValueError('invalid-glb')
    document = json.loads(raw[20:20 + size])
    if any(item.get('uri') and not item['uri'].startswith('data:') for key in ('buffers', 'images') for item in document.get(key, [])):
        raise ValueError('external-resources-unsupported')
    nodes, skins = document.get('nodes', []), document.get('skins', [])
    if len(skins) != 1 or len(skins[0].get('joints', [])) != len(CANONICAL):
        raise ValueError('canonical-humanoid-required')
    joints = skins[0]['joints']
    if any(type(index) is not int or not 0 <= index < len(nodes) for index in joints):
        raise ValueError('invalid-joints')
    names = [nodes[index].get('name') for index in joints]
    if len(set(names)) != len(names) or set(names) != set(CANONICAL) or any(sum(node.get('name') == name for node in nodes) != 1 for name in names):
        raise ValueError('canonical-humanoid-required')
    parents = {}
    for index, node in enumerate(nodes):
        for child in node.get('children', []):
            if type(child) is not int or not 0 <= child < len(nodes) or child in parents:
                raise ValueError('invalid-hierarchy')
            parents[child] = index
    bones = []
    for index in joints:
        node, parent = nodes[index], parents.get(index)
        if parent is not None and parent not in joints:
            seen = {index}
            while parent is not None and parent not in joints:
                if parent in seen:
                    raise ValueError('invalid-hierarchy')
                seen.add(parent)
                ancestor = nodes[parent]
                if 'matrix' in ancestor or ancestor.get('translation', [0, 0, 0]) != [0, 0, 0] or ancestor.get('rotation', [0, 0, 0, 1]) != [0, 0, 0, 1] or ancestor.get('scale', [1, 1, 1]) != [1, 1, 1]:
                    raise ValueError('unsupported-rig-transform')
                parent = parents.get(parent)
        if 'matrix' in node:
            raise ValueError('unsupported-rig-transform')
        bone = {'name': node['name'], 'parent': nodes[parent]['name'] if parent is not None else None, 'translation': node.get('translation', [0, 0, 0]), 'rotation': node.get('rotation', [0, 0, 0, 1]), 'scale': node.get('scale', [1, 1, 1])}
        for field, count in [('translation', 3), ('rotation', 4), ('scale', 3)]:
            if len(bone[field]) != count or any(type(value) not in (int, float) or not math.isfinite(value) for value in bone[field]):
                raise ValueError('invalid-rest-transform')
        if not np.allclose(bone['scale'], [1, 1, 1], atol=1e-5) or not math.isclose(np.linalg.norm(bone['rotation']), 1, abs_tol=1e-4):
            raise ValueError('unsupported-rig-transform')
        bones.append(bone)
    rest_world(bones)
    return bones


def rest_world(bones):
    pending, world = list(bones), {}
    while pending:
        ready = [bone for bone in pending if bone['parent'] is None or bone['parent'] in world]
        if not ready:
            raise ValueError('invalid-hierarchy')
        for bone in ready:
            rotation = Rotation.from_quat(bone['rotation'])
            position = np.asarray(bone['translation'], dtype=float)
            if bone['parent']:
                parent_rotation, parent_position = world[bone['parent']]
                position = parent_rotation.apply(position) + parent_position
                rotation = parent_rotation * rotation
            world[bone['name']] = rotation, position
            pending.remove(bone)
    return world


def landmark_points(landmarks, confidence):
    if len(landmarks) != 33 or any(min(landmarks[index].visibility, landmarks[index].presence) < confidence for index in REQUIRED):
        return None
    points = np.asarray([[point.x, -point.y, -point.z] for point in landmarks], dtype=float)
    return points if np.all(np.isfinite(points)) else None


def directions(points):
    shoulders = (points[11] + points[12]) * .5
    hips = (points[23] + points[24]) * .5
    result = {name: shoulders - hips for name in ('Hips', 'Spine', 'Chest')}
    for side, shift in [('Left', 0), ('Right', 1)]:
        shoulder, elbow, wrist, index, hip, knee, ankle, toe = [points[value + shift] for value in (11, 13, 15, 19, 23, 25, 27, 31)]
        result.update({side + 'Shoulder': shoulder - shoulders, side + 'UpperArm': elbow - shoulder, side + 'ForeArm': wrist - elbow, side + 'Hand': index - wrist, side + 'UpperLeg': knee - hip, side + 'LowerLeg': ankle - knee, side + 'Foot': toe - ankle})
    return result


def pose_rotations(bones, world, observed):
    desired = {}
    for bone in bones:
        name = bone['name']
        rotation, position = world[name]
        if name in observed:
            child = CHILD.get(name)
            axis = world[child][1] - position if child in world else rotation.apply([0, 1, 0])
            desired[name] = Rotation.from_quat(between(axis, observed[name])) * rotation
    pending, result, current = list(bones), {}, {}
    while pending:
        ready = [bone for bone in pending if bone['parent'] is None or bone['parent'] in current]
        if not ready:
            raise ValueError('invalid-hierarchy')
        for bone in ready:
            name, parent = bone['name'], bone['parent']
            parent_rotation = current[parent] if parent else Rotation.identity()
            local = parent_rotation.inv() * desired[name] if name in desired else Rotation.from_quat(bone['rotation'])
            current[name] = parent_rotation * local
            if name in observed:
                result[name] = local.as_quat().tolist()
            pending.remove(bone)
    return result


def build_clip(name, fps, bones, samples, warnings):
    if len(samples) < 2 or samples[-1][0] <= samples[0][0]:
        raise ValueError('insufficient-pose-frames')
    tracks = []
    for bone in bones:
        keys, previous = [], None
        for frame, rotations in samples:
            if bone['name'] not in rotations:
                continue
            value = np.asarray(rotations[bone['name']])
            if previous is not None and np.dot(previous, value) < 0:
                value = -value
            previous = value
            keys.append({'frame': frame, 'value': value.tolist()})
        if keys:
            tracks.append({'bone': bone['name'], 'path': 'rotation', 'interpolation': 'LINEAR', 'keys': keys})
    if not tracks:
        raise ValueError('insufficient-pose-frames')
    return {'version': 1, 'name': name[:120], 'fps': fps, 'durationFrames': samples[-1][0], 'bones': bones, 'tracks': tracks}


def run_job(job):
    import cv2
    import mediapipe as mp
    if job.get('task') != 'video-to-motion':
        raise ValueError('unsupported-task')
    inputs, parameters = job.get('inputs', {}), job.get('parameters', {})
    if len(inputs.get('videos', [])) != 1 or len(inputs.get('models', [])) != 1 or inputs.get('images'):
        raise ValueError('one-video-and-rig-required')
    fps = number(parameters, 'fps', 15, 5, 30, True)
    seconds = number(parameters, 'maxSeconds', 10, 1, 30, True)
    confidence = number(parameters, 'confidence', .5, .1, .95)
    model = Path(job.get('weights', {}).get('mediapipe-pose-lite', '')) / 'pose_landmarker_lite.task'
    if not model.is_file() or hashlib.sha256(model.read_bytes()).hexdigest() != MODEL_SHA256:
        raise ValueError('pose-model-missing-or-corrupt')
    bones = read_target(inputs['models'][0])
    world = rest_world(bones)
    capture = cv2.VideoCapture(str(Path(inputs['videos'][0]).resolve()))
    samples, rejected, examined = [], 0, 0
    try:
        source_fps = capture.get(cv2.CAP_PROP_FPS)
        width, height = capture.get(cv2.CAP_PROP_FRAME_WIDTH), capture.get(cv2.CAP_PROP_FRAME_HEIGHT)
        if not capture.isOpened() or not math.isfinite(source_fps) or not 1 <= source_fps <= 120 or not 1 <= width <= 3840 or not 1 <= height <= 2160:
            raise ValueError('unsupported-video')
        options = mp.tasks.vision.PoseLandmarkerOptions(base_options=mp.tasks.BaseOptions(model_asset_path=str(model), delegate=mp.tasks.BaseOptions.Delegate.CPU), running_mode=mp.tasks.vision.RunningMode.VIDEO, num_poses=1, min_pose_detection_confidence=confidence, min_pose_presence_confidence=confidence, min_tracking_confidence=confidence)
        last_frame = -1
        with mp.tasks.vision.PoseLandmarker.create_from_options(options) as detector:
            for index in range(math.ceil(source_fps * seconds)):
                success, frame = capture.read()
                if not success:
                    break
                timestamp = index / source_fps
                output_frame = int(math.floor(timestamp * fps + 1e-6))
                if output_frame == last_frame:
                    continue
                last_frame = output_frame
                if frame.shape[1] > 3840 or frame.shape[0] > 2160:
                    raise ValueError('unsupported-video')
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                result = detector.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), int(round(timestamp * 1000)))
                examined += 1
                points = landmark_points(result.pose_world_landmarks[0], confidence) if result.pose_world_landmarks else None
                if points is None:
                    rejected += 1
                else:
                    try:
                        rotations = pose_rotations(bones, world, directions(points))
                    except ValueError as error:
                        if str(error) != 'degenerate-pose-direction':
                            raise
                        rejected += 1
                    else:
                        samples.append((output_frame, rotations))
                send({'type': 'progress', 'value': min(.95, timestamp / seconds), 'stage': 'pose-estimation'})
    finally:
        capture.release()
    warnings = ['in-place-motion', 'bone-twist-not-estimated', 'head-neck-at-rest']
    if rejected:
        warnings.append('low-confidence-frames-omitted')
    clip = build_clip('Video motion', fps, bones, samples, warnings)
    output = Path(job['outputDir'])
    output.mkdir(parents=True, exist_ok=True)
    (output / 'clip.json').write_text(json.dumps(clip, allow_nan=False), encoding='utf-8')
    report = {'version': 1, 'model': 'pose_landmarker_lite/float16/1', 'modelSha256': MODEL_SHA256, 'fps': fps, 'examinedFrames': examined, 'acceptedFrames': len(samples), 'rejectedFrames': rejected, 'durationFrames': clip['durationFrames'], 'warnings': warnings}
    (output / 'motion-report.json').write_text(json.dumps(report, allow_nan=False), encoding='utf-8')
    return [{'path': 'clip.json', 'kind': 'animation-clip', 'label': 'Video motion'}, {'path': 'motion-report.json', 'kind': 'motion-report', 'label': 'Pose estimation report'}]


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--job', required=True)
    arguments = parser.parse_args()
    try:
        send({'type': 'result', 'files': run_job(json.loads(Path(arguments.job).read_text(encoding='utf-8')))})
    except Exception as error:
        send({'type': 'error', 'message': str(error)})
        sys.exit(1)
