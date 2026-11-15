import contextlib
import importlib.util
import sys
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
        self.assertEqual(result, "Chinese-style ceramic vase")
        settings = transformers.AutoModelForCausalLM.from_pretrained.call_args.kwargs
        self.assertEqual(settings["device_map"], "cpu")
        self.assertEqual(settings["dtype"], "float32")
        self.assertTrue(settings["local_files_only"])
        self.assertTrue(settings["use_safetensors"])
        self.assertFalse(settings["trust_remote_code"])
        template = tokenizer.apply_chat_template.call_args
        self.assertFalse(template.kwargs["enable_thinking"])
        self.assertEqual(template.args[0][-1]["content"], "Jarron chino")
        self.assertEqual(model.generate.call_args.kwargs["max_new_tokens"], 128)
        self.assertTrue(model.generate.call_args.kwargs["do_sample"])
        self.assertEqual(model.generate.call_args.kwargs["temperature"], 0.7)

    def test_missing_refiner_weights_fail_before_loading_a_model(self):
        with patch.object(self.wrapper, "send") as send, self.assertRaises(SystemExit):
            self.wrapper.refine_prompt({"weights": {}}, "Jarron chino")
        self.assertIn("prompt-qwen3", send.call_args.kwargs["message"])

    def test_refinement_precedes_sdxl_and_keeps_the_original_request(self):
        order = []
        pipeline = Mock()
        pipeline.return_value = SimpleNamespace(images=[Mock()])
        torch = SimpleNamespace(inference_mode=contextlib.nullcontext, Generator=lambda device: SimpleNamespace(manual_seed=lambda seed: seed), cuda=SimpleNamespace(empty_cache=Mock()))
        job = {"parameters": {"count": 1, "seed": 42, "objectFraming": True}, "inputs": {"prompt": "Jarron chino"}}
        with patch.dict(sys.modules, {"torch": torch}), patch.object(self.wrapper, "refine_prompt", side_effect=lambda *args: order.append("refine") or "Chinese-style ceramic vase"), patch.object(self.wrapper, "load_pipeline", side_effect=lambda *args: order.append("sdxl") or pipeline), patch.object(self.wrapper, "send"):
            self.wrapper.run_text_to_image(job, Path("/out"))
        self.assertEqual(order, ["refine", "sdxl"])
        self.assertEqual(job["inputs"]["prompt"], "Jarron chino")
        self.assertEqual(pipeline.call_args.kwargs["prompt"], "Chinese-style ceramic vase" + self.wrapper.FRAMING)

    def test_invalid_refinement_never_loads_sdxl(self):
        torch = SimpleNamespace()
        job = {"parameters": {"count": 1, "seed": 42, "objectFraming": True}, "inputs": {"prompt": "Jarron chino"}}
        with patch.dict(sys.modules, {"torch": torch}), patch.object(self.wrapper, "refine_prompt", side_effect=ValueError("prompt-refinement-invalid")), patch.object(self.wrapper, "load_pipeline") as load, patch.object(self.wrapper, "send"), self.assertRaises(SystemExit):
            self.wrapper.run_text_to_image(job, Path("/out"))
        load.assert_not_called()

    def test_shared_style_is_refined_with_the_object_without_replacing_the_original(self):
        pipeline = Mock()
        pipeline.return_value = SimpleNamespace(images=[Mock()])
        torch = SimpleNamespace(inference_mode=contextlib.nullcontext, Generator=lambda device: SimpleNamespace(manual_seed=lambda seed: seed), cuda=SimpleNamespace(empty_cache=Mock()))
        job = {"parameters": {"count": 1, "seed": 42, "objectFraming": False, "stylePrompt": "low-poly, pastel colors"}, "inputs": {"prompt": "Jarron chino"}}
        with patch.dict(sys.modules, {"torch": torch}), patch.object(self.wrapper, "refine_prompt", return_value="Chinese vase, low-poly, pastel colors") as refine, patch.object(self.wrapper, "load_pipeline", return_value=pipeline), patch.object(self.wrapper, "send"):
            self.wrapper.run_text_to_image(job, Path("/out"))
        refine.assert_called_once_with(job, "Jarron chino, low-poly, pastel colors")
        self.assertEqual(job["inputs"]["prompt"], "Jarron chino")
        self.assertEqual(pipeline.call_args.kwargs["prompt"], "Chinese vase, low-poly, pastel colors")


if __name__ == "__main__":
    unittest.main()
