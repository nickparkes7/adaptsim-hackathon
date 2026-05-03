from __future__ import annotations

import importlib.machinery
import importlib.util
import unittest
from pathlib import Path
from types import ModuleType

from contracts.models import SemanticEnvironment
from contracts.scenario_planner import build_manifest, load_asset_cards, load_behavior_profiles


EXAMPLES_DIR = Path(__file__).resolve().parent / "examples"
L4_IMPORTER_PATH = Path(__file__).resolve().parents[1] / "workers" / "l4-unreal-import" / "adaptsim-import-capture"


def load_l4_importer() -> ModuleType:
    loader = importlib.machinery.SourceFileLoader("adaptsim_import_capture", str(L4_IMPORTER_PATH))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


class ScenarioPlannerTests(unittest.TestCase):
    def test_l4_safety_park_placeholder_feeds_capture_specific_mvp_manifest(self) -> None:
        importer = load_l4_importer()
        environment = SemanticEnvironment.model_validate(
            importer.semantic_environment("safety_park", "/Game/AdaptSim/Maps/L_Reconstructed_safety_park")
        )
        assets = load_asset_cards([EXAMPLES_DIR / "asset_cards"])
        profiles = load_behavior_profiles([EXAMPLES_DIR / "behavior_profiles"])

        manifest = build_manifest(environment, assets, profiles)

        self.assertEqual(manifest.scenario_id, "safety_park_mvp_001")
        self.assertEqual(manifest.environment_id, "safety_park")

        anchors = {anchor.anchor_id: anchor for anchor in environment.anchors}
        environment_tags: set[str] = set()
        for anchor in environment.anchors:
            environment_tags.add(anchor.anchor_type)
            environment_tags.update(anchor.tags)

        for event in manifest.events:
            self.assertTrue(set(event.required_tags).issubset(environment_tags))
            anchor_hint = event.parameters.get("anchor_hint")
            if isinstance(anchor_hint, str):
                self.assertIn(anchor_hint, anchors)
            if event.trigger.anchor_id:
                self.assertIn(event.trigger.anchor_id, anchors)


if __name__ == "__main__":
    unittest.main()
