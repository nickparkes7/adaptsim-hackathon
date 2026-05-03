#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

if __package__ is None or __package__ == "":
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from contracts.models import SCHEMA_MODELS


def export_schemas(output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    for contract_type, model in SCHEMA_MODELS.items():
        schema = model.model_json_schema(mode="validation")
        schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
        schema["$id"] = f"https://adaptsim.local/contracts/{contract_type}.schema.json"
        schema["title"] = model.__name__
        output_path = output_dir / f"{contract_type}.schema.json"
        output_path.write_text(json.dumps(schema, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(f"wrote {output_path}")


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    output_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else repo_root / "contracts" / "schemas"
    export_schemas(output_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

