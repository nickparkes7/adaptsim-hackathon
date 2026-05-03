from __future__ import annotations

import unittest
from pathlib import Path

from contracts.aar_generator import context_from_contract, load_contract, render_markdown


EXAMPLES_DIR = Path(__file__).resolve().parent / "examples"


class AarGeneratorTests(unittest.TestCase):
    def test_generates_from_telemetry_log(self) -> None:
        contract = load_contract(EXAMPLES_DIR / "telemetry" / "mock_hallway_delay_log.json")
        markdown = render_markdown(context_from_contract(contract))

        self.assertIn("# After Action Review: run_hallway_delay_001", markdown)
        self.assertIn("## Timeline", markdown)
        self.assertIn("`asset_spawned`", markdown)
        self.assertIn("`AI_Adversary_02`", markdown)
        self.assertIn("No LLM coaching was used", markdown)

    def test_generates_from_aar_input(self) -> None:
        contract = load_contract(EXAMPLES_DIR / "aar" / "hallway_delay_aar_input.json")
        markdown = render_markdown(context_from_contract(contract))

        self.assertIn("Environment: `scan_hallway_alpha`", markdown)
        self.assertIn("Trainee: `trainee_demo_001`", markdown)
        self.assertIn("Detect delayed contact from an occluded side room.", markdown)
        self.assertIn("## Rubric Context", markdown)


if __name__ == "__main__":
    unittest.main()
