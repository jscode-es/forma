import importlib.util
import json
import math
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest


SOURCE = Path(__file__).parents[1] / 'main.py'
spec = importlib.util.spec_from_file_location('motion_engine', SOURCE)
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)


class MotionTests(unittest.TestCase):
    def test_quaternion_rotates_rest_axis_and_stays_normalized(self):
        rotation = engine.between([1, 0, 0], [0, 1, 0])
        actual = engine.Rotation.from_quat(rotation).apply([1, 0, 0])
        self.assertTrue(engine.np.allclose(actual, [0, 1, 0]))
        self.assertAlmostEqual(sum(value * value for value in rotation), 1)
        opposite = engine.between([1, 0, 0], [-1, 0, 0])
        self.assertTrue(engine.np.allclose(engine.Rotation.from_quat(opposite).apply([1, 0, 0]), [-1, 0, 0]))

    def test_landmarks_convert_camera_axes_and_require_confidence(self):
        from types import SimpleNamespace
        landmarks = [SimpleNamespace(x=i / 100, y=.2, z=-.3, visibility=.99, presence=.99) for i in range(33)]
        points = engine.landmark_points(landmarks, .5)
        self.assertTrue(engine.np.allclose(points[11], [.11, -.2, .3]))
        landmarks[11].visibility = .1
        self.assertIsNone(engine.landmark_points(landmarks, .5))

    def test_pose_rotation_respects_parent_and_uses_real_target_rest(self):
        target = [
            {'name': 'Hips', 'parent': None, 'translation': [0, 0, 0], 'rotation': [0, 0, 0, 1], 'scale': [1, 1, 1]},
            {'name': 'LeftUpperArm', 'parent': 'Hips', 'translation': [1, 1, 0], 'rotation': engine.Rotation.from_euler('z', -math.pi / 2).as_quat().tolist(), 'scale': [1, 1, 1]},
            {'name': 'LeftForeArm', 'parent': 'LeftUpperArm', 'translation': [0, 1, 0], 'rotation': [0, 0, 0, 1], 'scale': [1, 1, 1]},
        ]
        world = engine.rest_world(target)
        poses = engine.pose_rotations(target, world, {'Hips': engine.np.array([0, 1, 0]), 'LeftUpperArm': engine.np.array([0, 1, 0])})
        arm_world = engine.Rotation.from_quat(poses['Hips']) * engine.Rotation.from_quat(poses['LeftUpperArm'])
        self.assertTrue(engine.np.allclose(arm_world.apply([0, 1, 0]), [0, 1, 0]))

    def test_empty_and_short_detection_fail_without_output(self):
        with self.assertRaisesRegex(ValueError, 'insufficient-pose-frames'):
            engine.build_clip('test', 15, [], [], [])
        with self.assertRaisesRegex(ValueError, 'insufficient-pose-frames'):
            engine.build_clip('test', 15, [], [(0, {})], [])

    def test_missing_frames_keep_timing_without_fabricated_keys(self):
        bones = [{'name': 'Hips', 'parent': None, 'translation': [0, 0, 0], 'rotation': [0, 0, 0, 1], 'scale': [1, 1, 1]}]
        clip = engine.build_clip('walk', 15, bones, [(2, {'Hips': [0, 0, 0, 1]}), (5, {'Hips': [0, 0, 0, -1]})], [])
        self.assertEqual(clip['durationFrames'], 5)
        self.assertEqual([key['frame'] for key in clip['tracks'][0]['keys']], [2, 5])
        self.assertEqual(clip['tracks'][0]['keys'][1]['value'], [0, 0, 0, 1])
        self.assertEqual(clip['bones'], bones)

    def test_target_rejects_unrigged_external_and_noncanonical_data(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'model.glb'
            for document, message in [({'nodes': []}, 'canonical-humanoid-required'), ({'buffers': [{'uri': 'https://example.com/a.bin'}]}, 'external-resources-unsupported')]:
                payload = json.dumps(document).encode()
                payload += b' ' * (-len(payload) % 4)
                target.write_bytes(struct.pack('<III', 0x46546C67, 2, 20 + len(payload)) + struct.pack('<II', len(payload), 0x4E4F534A) + payload)
                with self.assertRaisesRegex(ValueError, message):
                    engine.read_target(target)


@unittest.skipUnless(all(os.environ.get(key) for key in ('FORMA_MOTION_MODEL', 'FORMA_MOTION_VIDEO', 'FORMA_MOTION_TARGET')), 'Set local model, video and target paths for real inference')
class InferenceTests(unittest.TestCase):
    def invoke(self, directory, video):
        job = {'task': 'video-to-motion', 'inputs': {'models': [os.environ['FORMA_MOTION_TARGET']], 'videos': [str(video)], 'images': []}, 'parameters': {'fps': 15, 'maxSeconds': 3, 'confidence': .5}, 'weights': {'mediapipe-pose-lite': os.environ['FORMA_MOTION_MODEL']}, 'outputDir': str(directory / 'out')}
        source = directory / 'job.json'
        source.write_text(json.dumps(job), encoding='utf-8')
        environment = os.environ | {'HF_HUB_OFFLINE': '1', 'TRANSFORMERS_OFFLINE': '1', 'HTTP_PROXY': 'http://127.0.0.1:9', 'HTTPS_PROXY': 'http://127.0.0.1:9', 'ALL_PROXY': 'http://127.0.0.1:9'}
        return subprocess.run([sys.executable, str(SOURCE), '--job', str(source)], capture_output=True, text=True, timeout=60, env=environment)

    def test_real_video_inference_produces_changing_normalized_target_tracks(self):
        import hashlib
        target = Path(os.environ['FORMA_MOTION_TARGET'])
        before = hashlib.sha256(target.read_bytes()).hexdigest()
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder)
            process = self.invoke(directory, os.environ['FORMA_MOTION_VIDEO'])
            self.assertEqual(process.returncode, 0, process.stdout + process.stderr)
            clip = json.loads((directory / 'out/clip.json').read_text())
            report = json.loads((directory / 'out/motion-report.json').read_text())
            self.assertEqual(clip['bones'], engine.read_target(target))
            self.assertGreaterEqual(report['acceptedFrames'], 2)
            self.assertGreaterEqual(len(clip['tracks']), 15)
            changed = 0
            for track in clip['tracks']:
                values = engine.np.asarray([key['value'] for key in track['keys']])
                self.assertTrue(engine.np.all(engine.np.isfinite(values)))
                self.assertTrue(engine.np.allclose(engine.np.linalg.norm(values, axis=1), 1, atol=1e-6))
                changed += bool(engine.np.max(engine.np.abs(values - values[0])) > .001)
            self.assertGreater(changed, 5)
            self.assertEqual(hashlib.sha256(target.read_bytes()).hexdigest(), before)

    def test_blank_video_fails_without_fabricating_a_clip(self):
        import cv2
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder)
            video = directory / 'blank.mp4'
            writer = cv2.VideoWriter(str(video), cv2.VideoWriter_fourcc(*'mp4v'), 15, (320, 240))
            self.assertTrue(writer.isOpened())
            for _ in range(30):
                writer.write(engine.np.zeros((240, 320, 3), dtype=engine.np.uint8))
            writer.release()
            process = self.invoke(directory, video)
            self.assertNotEqual(process.returncode, 0)
            self.assertIn('insufficient-pose-frames', process.stdout)
            self.assertFalse((directory / 'out/clip.json').exists())


if __name__ == '__main__':
    unittest.main()
