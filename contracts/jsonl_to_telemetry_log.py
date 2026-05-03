#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from pydantic import ValidationError

if __package__ is None or __package__ == "":
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from contracts.models import TelemetryLog


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw_line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f"{path}:{line_number}: invalid JSONL event: {exc}") from exc
        if not isinstance(event, dict):
            raise ValueError(f"{path}:{line_number}: telemetry event must be a JSON object")
        events.append(event)
    if not events:
        raise ValueError(f"{path}: no telemetry events found")
    return events


def wrap_events(events: list[dict[str, Any]]) -> TelemetryLog:
    first_event = events[0]
    run_id = first_event.get("run_id")
    scenario_id = first_event.get("scenario_id")
    if not isinstance(run_id, str) or not run_id:
        raise ValueError("first telemetry event is missing run_id")
    if not isinstance(scenario_id, str) or not scenario_id:
        raise ValueError("first telemetry event is missing scenario_id")

    try:
        return TelemetryLog.model_validate(
            {
                "contract_type": "telemetry_log",
                "schema_version": "1.0",
                "run_id": run_id,
                "scenario_id": scenario_id,
                "events": events,
            }
        )
    except ValidationError as exc:
        raise ValueError(str(exc)) from exc


def main() -> int:
    parser = argparse.ArgumentParser(description="Wrap AdaptSim ScenarioDirector JSONL into telemetry_log JSON.")
    parser.add_argument("input", help="ScenarioDirector telemetry JSONL file")
    parser.add_argument("--output", required=True, help="Output telemetry_log JSON file")
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)
    try:
        telemetry_log = wrap_events(load_jsonl(input_path))
    except ValueError as exc:
        print(f"JSONL WRAP FAILED: {exc}", file=sys.stderr)
        return 1

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(telemetry_log.model_dump_json(indent=2) + "\n", encoding="utf-8")
    print(f"OK: wrote {len(telemetry_log.events)} event(s) to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
