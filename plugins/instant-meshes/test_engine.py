import hashlib
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np
import trimesh

import main


class RealInstantMeshesTests(unittest.TestCase):
    def test_quads_uv_material_world_transform_and_source_preservation(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            source = folder / "source.glb"
            mesh = trimesh.creation.icosphere(subdivisions=3)
            mesh.visual = trimesh.visual.TextureVisuals(material=trimesh.visual.material.PBRMaterial(roughnessFactor=0.27, metallicFactor=0.1, baseColorFactor=[51, 102, 153, 255]))
            scene = trimesh.Scene()
            scene.add_geometry(mesh, transform=trimesh.transformations.translation_matrix([2, 3, 4]))
            scene.export(source)
            original = hashlib.sha256(source.read_bytes()).hexdigest()
            output = folder / "out"
            files = main.run_job({"task": "retopology", "inputs": {"models": [str(source)]}, "parameters": {"faceBudget": 256, "resolution": "512"}, "outputDir": str(output)})
            report = json.loads((output / "report.json").read_text())
            result = trimesh.load(output / "model.glb").to_geometry()
            self.assertEqual({file["kind"] for file in files}, {"model", "mesh-report"})
            self.assertEqual(report["details"]["method"], "instant-meshes")
            self.assertLessEqual(report["details"]["quadFaces"], 256)
            self.assertEqual(len(result.faces), report["details"]["quadFaces"] * 2)
            self.assertTrue(np.isfinite(result.visual.uv).all())
            self.assertTrue(np.all((result.visual.uv >= 0) & (result.visual.uv <= 1)))
            self.assertTrue(np.allclose(result.bounds.mean(axis=0), [2, 3, 4], atol=0.03))
            self.assertAlmostEqual(result.visual.material.roughnessFactor, 0.27)
            self.assertAlmostEqual(result.visual.material.metallicFactor, 0.1)
            self.assertTrue(np.array_equal(result.visual.material.baseColorFactor, [51, 102, 153, 255]))
            self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), original)


if __name__ == "__main__":
    unittest.main()
