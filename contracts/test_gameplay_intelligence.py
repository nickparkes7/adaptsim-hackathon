from __future__ import annotations

import unittest
from pathlib import Path

from contracts.gameplay_intelligence import (
    build_threat_injection_plan,
    enrich_manifest_with_plan,
    load_generated_asset_database,
)
from contracts.scenario_planner import build_manifest, load_asset_cards, load_behavior_profiles, load_environment


EXAMPLES_DIR = Path(__file__).resolve().parent / "examples"


class GameplayIntelligenceTests(unittest.TestCase):
    def test_safety_park_vignette_uses_generated_threat_asset_metadata(self) -> None:
        environment_path = EXAMPLES_DIR / "semantic_environments" / "safety_park.json"
        generated_database_path = EXAMPLES_DIR / "generated_asset_databases" / "threat_vector_asset_database.json"
        environment = load_environment(environment_path)
        generated_database = load_generated_asset_database(generated_database_path)
        assets = load_asset_cards([EXAMPLES_DIR / "asset_cards"])
        profiles = load_behavior_profiles([EXAMPLES_DIR / "behavior_profiles"])

        plan = build_threat_injection_plan(
            environment,
            generated_database,
            semantic_environment_ref="contracts/examples/semantic_environments/safety_park.json",
            threat_asset_database_ref="contracts/examples/asset_cards",
            generated_asset_database_ref="contracts/examples/generated_asset_databases/threat_vector_asset_database.json",
            linked_scenario_manifest="contracts/examples/gameplay_intelligence/safety_park/scenario_manifest.json",
        )
        manifest = enrich_manifest_with_plan(
            build_manifest(environment, assets, profiles, scenario_id=plan.scenario_id, planner_id=plan.planner_id),
            plan,
        )

        self.assertEqual(plan.environment_id, "safety_park")
        self.assertEqual(plan.threats[0].generated_asset_id, "fpv_quadcopter_asset")
        self.assertIn("line_of_sight", plan.threats[0].entry_anchor_tags)

        generated_refs = [
            event.parameters.get("generated_threat_asset_id")
            for event in manifest.events
            if event.parameters.get("generated_threat_asset_id")
        ]
        self.assertIn("fpv_quadcopter_asset", generated_refs)
        self.assertNotIn("fpv_quadcopter_asset", manifest.required_asset_ids)


if __name__ == "__main__":
    unittest.main()
