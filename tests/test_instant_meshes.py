import hashlib
import importlib.util
import io
import itertools
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch


class InstantMeshesTests(unittest.TestCase):
    def setUp(self):
        folder = Path(__file__).resolve().parents[1] / "plugins/instant-meshes"
        spec = importlib.util.spec_from_file_location("setup_runtime", folder / "setup_runtime.py")
        self.runtime = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.runtime)
        spec = importlib.util.spec_from_file_location("instant_meshes", folder / "main.py")
        self.worker = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {"setup_runtime": self.runtime}):
            spec.loader.exec_module(self.worker)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)

    def glb(self, doc):
        payload = json.dumps(doc).encode()
        payload += b" " * (-len(payload) % 4)
        return struct.pack("<4sIIII", b"glTF", 2, 20 + len(payload), len(payload), 0x4E4F534A) + payload

    def test_rejects_external_textured_and_rigged_inputs_before_loading_dependencies(self):
        base = {"asset": {"version": "2.0"}, "nodes": [{"mesh": 0}], "meshes": [{"primitives": [{"attributes": {"POSITION": 0}}]}]}
        for changed in [{"buffers": [{"uri": "../secret.bin"}]}, {"skins": [{}]}, {"textures": [{}]}, {"animations": [{}]}, {"extensionsUsed": ["KHR_draco_mesh_compression"]}]:
            source = self.folder / "source.glb"
            source.write_bytes(self.glb({**base, **changed}))
            original = source.read_bytes()
            with self.subTest(changed=changed), self.assertRaises(ValueError):
                self.worker.run_job({"task": "retopology", "inputs": {"models": [str(source)]}, "parameters": {}, "outputDir": str(self.folder / "out")})
            self.assertEqual(source.read_bytes(), original)
            self.assertFalse((self.folder / "out/model.glb").exists())

    def test_only_finite_valid_quad_indices_are_accepted(self):
        output = self.folder / "result.obj"
        vertices = "v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\n"
        output.write_text(vertices + "f 1 2 3 4\n")
        self.assertEqual(self.worker.read_quads(output)[1], [[0, 1, 2, 3]])
        for value in [vertices + "f 1 2 3", vertices + "f 1 2 3 5", vertices + "f 1 2 3 1", "v nan 0 0\nf 1 2 3 4"]:
            output.write_text(value)
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.worker.read_quads(output)

    def test_runtime_checks_hash_and_does_not_download_during_verification(self):
        binary = self.folder / "InstantMeshes.exe"
        binary.write_bytes(b"test")
        with patch.object(self.runtime, "BINARY", binary), patch.object(self.runtime, "BINARY_SIZE", 4), patch.object(self.runtime, "BINARY_SHA256", hashlib.sha256(b"test").hexdigest()), patch.object(self.runtime.urllib.request, "build_opener") as network:
            self.assertEqual(self.runtime.verified_binary(), binary)
            binary.write_bytes(b"fail")
            with self.assertRaisesRegex(ValueError, "instant-meshes-missing"):
                self.runtime.verified_binary()
            network.assert_not_called()

    def test_install_rejects_unverified_download_without_writing_an_executable(self):
        binary = self.folder / "InstantMeshes.exe"
        opener = Mock()
        opener.open.return_value = io.BytesIO(b"bad archive")
        with patch.object(self.runtime, "BINARY", binary), patch.object(self.runtime.sys, "platform", "win32"), patch.object(self.runtime.urllib.request, "build_opener", return_value=opener), self.assertRaisesRegex(ValueError, "instant-meshes-checksum"):
            self.runtime.prepare()
        self.assertFalse(binary.exists())

    def test_rejects_invalid_budgets_and_resolution(self):
        for values in [{"faceBudget": True}, {"faceBudget": 127}, {"faceBudget": 100001}, {"resolution": "8192"}]:
            with self.subTest(values=values), self.assertRaises(ValueError):
                self.worker.run_job({"task": "retopology", "inputs": {"models": ["unused"]}, "parameters": values})

    def test_idle_upstream_process_is_killed_and_retried_without_another_backend(self):
        processes = []
        def start(*args, **kwargs):
            process = Mock()
            process.poll.return_value = None
            process.kill.side_effect = lambda: setattr(process.poll, "return_value", -9)
            processes.append(process)
            return process
        with patch.object(self.worker.sys, "platform", "win32"), patch.object(self.worker.subprocess, "CREATE_NO_WINDOW", 0, create=True), patch.object(self.worker.subprocess, "Popen", side_effect=start) as popen, patch.object(self.worker, "cpu_time", return_value=0), patch.object(self.worker.time, "monotonic", side_effect=itertools.count()), patch.object(self.worker.time, "sleep"), patch.object(self.worker, "send"), self.assertRaisesRegex(ValueError, "instant-meshes-stalled"):
            self.worker.run_binary(["verified-executable", "--faces", "128"])
        self.assertEqual(len(processes), 3)
        for process in processes:
            process.kill.assert_called_once()
            process.wait.assert_called_once()
        for call in popen.call_args_list:
            self.assertFalse(call.kwargs["shell"])
            self.assertEqual(call.args[0], ["verified-executable", "--faces", "128"])

    def test_active_cpu_work_is_not_treated_as_a_stall(self):
        process = Mock(returncode=0)
        process.poll.side_effect = [None, None, None, None, 0, 0]
        with patch.object(self.worker.sys, "platform", "win32"), patch.object(self.worker.subprocess, "CREATE_NO_WINDOW", 0, create=True), patch.object(self.worker.subprocess, "Popen", return_value=process), patch.object(self.worker, "cpu_time", side_effect=itertools.count()), patch.object(self.worker.time, "monotonic", side_effect=itertools.count(0, 10)), patch.object(self.worker.time, "sleep"):
            self.worker.run_binary(["verified-executable"])
        process.kill.assert_not_called()


if __name__ == "__main__":
    unittest.main()
