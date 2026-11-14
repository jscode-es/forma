import contextlib
import importlib.util
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch


class MultiViewWrapperTests(unittest.TestCase):
    def setUp(self):
        source = Path(__file__).resolve().parents[1] / "plugins/hunyuan3d-2-mv/main.py"
        spec = importlib.util.spec_from_file_location("hunyuan_mv", source)
        self.wrapper = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.wrapper)
        self.job = {
            "parameters": {"steps": 5, "removeBackground": False, "guidanceScale": 5, "octreeResolution": "256", "seed": 42},
            "inputs": {"images": ["front.png", "back.png"], "views": ["front", "back"]},
            "weights": {"hunyuan3d-2-mv-dit": "/verified/weights"},
        }

    def test_passes_named_images_and_verified_local_safetensors(self):
        mesh = SimpleNamespace(vertices=[1, 2], faces=[1], export=Mock())
        pipeline = Mock(return_value=[mesh])
        factory = SimpleNamespace(from_single_file=Mock(return_value=pipeline))
        shapegen = SimpleNamespace(Hunyuan3DDiTFlowMatchingPipeline=factory, FloaterRemover=lambda: lambda value: value, DegenerateFaceRemover=lambda: lambda value: value)
        torch = SimpleNamespace(float16="float16", inference_mode=contextlib.nullcontext, Generator=lambda **_: SimpleNamespace(manual_seed=lambda seed: seed))
        with patch.dict(sys.modules, {"torch": torch, "hy3dgen": SimpleNamespace(), "hy3dgen.shapegen": shapegen}), patch.object(self.wrapper, "load_image", side_effect=lambda file: SimpleNamespace(save=Mock(), file=file)), patch.object(self.wrapper, "send"):
            self.wrapper.run_image_to_3d(self.job, Path("/output"))
        images = pipeline.call_args.kwargs["image"]
        self.assertEqual(list(images), ["front", "back"])
        self.assertEqual(images["back"].file, "back.png")
        self.assertTrue(factory.from_single_file.call_args.kwargs["use_safetensors"])
        self.assertTrue(factory.from_single_file.call_args.args[0].endswith("model.fp16.safetensors"))
        mesh.export.assert_called_once()

    def test_rejects_unsupported_top_view_before_loading_images(self):
        self.job["inputs"]["views"] = ["front", "top"]
        with patch.dict(sys.modules, {"torch": SimpleNamespace()}), patch.object(self.wrapper, "load_image") as load, patch.object(self.wrapper, "send"), self.assertRaises(SystemExit):
            self.wrapper.run_image_to_3d(self.job, Path("/output"))
        load.assert_not_called()


if __name__ == "__main__":
    unittest.main()
