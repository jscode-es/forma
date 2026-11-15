import contextlib
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, Mock, patch


class SdxlPromptTests(unittest.TestCase):
    def setUp(self):
        source = Path(__file__).resolve().parents[1] / "plugins/sdxl-lightning/main.py"
        spec = importlib.util.spec_from_file_location("sdxl_prompt", source)
        self.wrapper = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.wrapper)
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.out = Path(temporary.name)

    def pipeline(self):
        pipeline = Mock()
        pipeline.return_value = SimpleNamespace(images=[Mock()])
        tokenizer = SimpleNamespace(encode=lambda text: text.split(), model_max_length=77)
        pipeline.tokenizer = pipeline.tokenizer_2 = tokenizer
        return pipeline

    def modules(self):
        torch = SimpleNamespace(inference_mode=contextlib.nullcontext, Generator=lambda device: SimpleNamespace(manual_seed=lambda seed: seed), cuda=SimpleNamespace(empty_cache=Mock()))
        return {"torch": torch, "PIL": SimpleNamespace(Image=SimpleNamespace(open=lambda path: contextlib.nullcontext(Mock())))}

    def test_output_is_bounded_and_excludes_reasoning_or_truncated_replies(self):
        self.assertEqual(self.wrapper.validate_prompt_output("  Chinese-style\n ceramic vase  "), "Chinese-style ceramic vase")
        for value in ["", "x" * 801, "<think>reasoning</think> vase", "```vase```", "vase\x00"]:
            with self.subTest(value=value[:20]), self.assertRaises(ValueError):
                self.wrapper.validate_prompt_output(value)
        with self.assertRaises(ValueError):
            self.wrapper.validate_prompt_output("Chinese vase", truncated=True)

    def test_refiner_uses_verified_local_cpu_model_without_thinking(self):
        tokenizer = Mock(eos_token_id=9, pad_token_id=0)
        tokenizer.apply_chat_template.return_value = {"input_ids": SimpleNamespace(shape=(1, 3))}
        tokenizer.decode.return_value = "Chinese-style ceramic vase"
        continuation = MagicMock()
        continuation.numel.return_value = 8
        continuation.__getitem__.return_value.item.return_value = 9
        generated = MagicMock()
        generated.__getitem__.return_value = continuation
        model = Mock()
        model.generate.return_value = generated
        transformers = SimpleNamespace(AutoTokenizer=Mock(), AutoModelForCausalLM=Mock())
        transformers.AutoTokenizer.from_pretrained.return_value = tokenizer
        transformers.AutoModelForCausalLM.from_pretrained.return_value = model
        torch = SimpleNamespace(float32="float32", inference_mode=contextlib.nullcontext, random=SimpleNamespace(fork_rng=lambda devices: contextlib.nullcontext(), default_generator=Mock()))
        with patch.dict(sys.modules, {"torch": torch, "transformers": transformers}):
            result = self.wrapper.refine_prompt({"weights": {"prompt-qwen3": "/verified/qwen"}}, "Jarron chino")
        self.assertEqual(result, ("Chinese-style ceramic vase", ""))
        settings = transformers.AutoModelForCausalLM.from_pretrained.call_args.kwargs
        self.assertEqual(settings["device_map"], "cpu")
        self.assertEqual(settings["dtype"], "float32")
        self.assertTrue(settings["local_files_only"])
        self.assertTrue(settings["use_safetensors"])
        self.assertFalse(settings["trust_remote_code"])
        template = tokenizer.apply_chat_template.call_args
        self.assertFalse(template.kwargs["enable_thinking"])
        self.assertEqual(template.args[0][-1]["content"], "Jarron chino")
        self.assertEqual(model.generate.call_args.kwargs["max_new_tokens"], 64)
        self.assertTrue(model.generate.call_args.kwargs["do_sample"])
        self.assertEqual(model.generate.call_args.kwargs["temperature"], 0.3)

        tokenizer.decode.side_effect = ["vase", "hand-painted, rounded shapes, pastel colors"]
        with patch.dict(sys.modules, {"torch": torch, "transformers": transformers}):
            result = self.wrapper.refine_prompt({"weights": {"prompt-qwen3": "/verified/qwen"}}, "jarrón", "Japanese fantasy diorama, pastel colors")
        self.assertEqual(result, ("vase", "hand-painted, rounded shapes, pastel colors"))
        messages = tokenizer.apply_chat_template.call_args_list[-2:]
        self.assertEqual(messages[0].args[0][-1]["content"], "jarrón")
        self.assertEqual(messages[1].args[0][-1]["content"], "Japanese fantasy diorama, pastel colors")
        self.assertNotIn("diorama", messages[0].args[0][0]["content"])

    def test_missing_refiner_weights_fail_before_loading_a_model(self):
        with patch.object(self.wrapper, "send") as send, self.assertRaises(SystemExit):
            self.wrapper.refine_prompt({"weights": {}}, "Jarron chino")
        self.assertIn("prompt-qwen3", send.call_args.kwargs["message"])

    def test_refinement_precedes_sdxl_and_keeps_the_original_request(self):
        order = []
        pipeline = self.pipeline()
        job = {"parameters": {"count": 1, "seed": 42, "objectFraming": True}, "inputs": {"prompt": "Jarron chino"}}
        modules = self.modules()
        modules["torch"].cuda.empty_cache.side_effect = lambda: order.append("release")
        with patch.dict(sys.modules, modules), patch.object(self.wrapper, "refine_prompt", side_effect=lambda *args: order.append("refine") or ("Chinese-style ceramic vase", "")), patch.object(self.wrapper, "load_pipeline", side_effect=lambda *args: order.append("sdxl") or pipeline), patch.object(self.wrapper, "load_background_remover", side_effect=lambda *args: order.append("background") or Mock()), patch.object(self.wrapper, "transparent_image", return_value=Mock()), patch.object(self.wrapper, "send"):
            self.wrapper.run_text_to_image(job, self.out)
        self.assertEqual(order, ["refine", "sdxl", "release", "background", "release"])
        self.assertEqual(job["inputs"]["prompt"], "Jarron chino")
        self.assertEqual(pipeline.call_args.kwargs["prompt"], "Chinese-style ceramic vase" + self.wrapper.FRAMING)

    def test_invalid_refinement_never_loads_sdxl(self):
        job = {"parameters": {"count": 1, "seed": 42, "objectFraming": True}, "inputs": {"prompt": "Jarron chino"}}
        with patch.dict(sys.modules, self.modules()), patch.object(self.wrapper, "refine_prompt", side_effect=ValueError("prompt-refinement-invalid")), patch.object(self.wrapper, "load_pipeline") as load, patch.object(self.wrapper, "send"), self.assertRaises(SystemExit):
            self.wrapper.run_text_to_image(job, self.out)
        load.assert_not_called()

    def test_shared_style_is_refined_with_the_object_without_replacing_the_original(self):
        pipeline = self.pipeline()
        job = {"parameters": {"count": 1, "seed": 42, "objectFraming": False, "stylePrompt": "low-poly, pastel colors"}, "inputs": {"prompt": "Jarron chino"}}
        with patch.dict(sys.modules, self.modules()), patch.object(self.wrapper, "refine_prompt", return_value=("Chinese vase", "low-poly, pastel colors")) as refine, patch.object(self.wrapper, "load_pipeline", return_value=pipeline), patch.object(self.wrapper, "load_background_remover", return_value=Mock()), patch.object(self.wrapper, "transparent_image", return_value=Mock()), patch.object(self.wrapper, "send"):
            self.wrapper.run_text_to_image(job, self.out)
        refine.assert_called_once_with(job, "Jarron chino", "low-poly, pastel colors")
        self.assertEqual(job["inputs"]["prompt"], "Jarron chino")
        self.assertEqual(pipeline.call_args.kwargs["prompt"], "Chinese vase, low-poly, pastel colors")

    def test_subject_and_framing_survive_both_encoder_token_limits(self):
        pipeline = self.pipeline()
        pipeline.tokenizer = SimpleNamespace(encode=lambda text: text.split(), model_max_length=20)
        pipeline.tokenizer_2 = SimpleNamespace(encode=lambda text: text.split(), model_max_length=18)
        result = self.wrapper.image_prompt("Chinese vase", "hand-painted, rounded shapes, warm pastel colors, turquoise blue, gold highlights", pipeline, True)
        self.assertTrue(result.startswith("Chinese vase"))
        self.assertTrue(result.endswith(self.wrapper.FRAMING))
        self.assertLessEqual(len(result.split()), 18)
        self.assertNotIn("gold highlights", result)
        with self.assertRaisesRegex(ValueError, "prompt-too-long"):
            self.wrapper.image_prompt("vase " * 100, "pastel", pipeline, True)

    def test_real_alpha_clears_hidden_background_without_darkening_soft_edges(self):
        try:
            from PIL import Image
        except ImportError:
            self.skipTest("Pillow is available in the engine runtime")
        original = Image.new("RGB", (64, 64), (123, 45, 67))
        mask = Image.new("L", original.size, 0)
        mask.paste(255, (16, 16, 48, 48))
        mask.paste(128, (15, 16, 16, 48))
        result = self.wrapper.apply_alpha(original, mask)
        self.assertEqual(result.mode, "RGBA")
        self.assertEqual(result.getpixel((0, 0)), (0, 0, 0, 0))
        self.assertEqual(result.getpixel((32, 32)), (123, 45, 67, 255))
        self.assertEqual(result.getpixel((15, 32)), (123, 45, 67, 128))
        self.assertEqual(original.getpixel((0, 0)), (123, 45, 67))
        for value in (0, 255):
            with self.subTest(alpha=value), self.assertRaisesRegex(ValueError, "image-background-not-transparent"):
                self.wrapper.apply_alpha(original, Image.new("L", original.size, value))


if __name__ == "__main__":
    unittest.main()
