#!/usr/bin/env python3
"""Export the public military disposition database to portable artifacts."""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import json
import pathlib
import shutil
import sqlite3
import subprocess
import sys
import zipfile
from typing import Any


ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_EXPORT_DIR = ROOT / "exports"
DATABASE_BASENAME = "adaptsim_military_disposition"

TABLE_ORDER = [
    "source",
    "entity",
    "entity_source",
    "entity_public_reference",
    "entity_context_enrichment",
    "coverage_category",
    "entity_category_coverage",
    "equipment_inventory",
    "software_system_inventory",
    "capability_catalog",
    "asset_capability_map",
    "injection_action_type",
    "profile_snapshot",
    "model_area",
    "disposition_variable",
    "profile_variable_value",
    "value_source",
    "simulation_process",
    "scenario_overlay",
]

SOURCE_COLUMNS = [
    "source_id",
    "title",
    "publisher",
    "url",
    "source_type",
    "recency_note",
    "public_sensitivity",
]

ENTITY_COLUMNS = [
    "entity_id",
    "name",
    "official_name",
    "iso3",
    "iso2",
    "entity_status",
    "un_membership",
    "sovereignty_context",
    "region",
    "subregion",
    "included_reason",
    "public_military_data_available",
    "coverage_tier",
    "profile_seeded",
    "as_of_date",
    "confidence",
    "source_ids_json",
    "recency",
    "notes",
]

COVERAGE_CATEGORY_COLUMNS = [
    "layer",
    "category_id",
    "name",
    "description",
    "required_source_tier",
    "source_id",
    "source_locator",
    "safety_boundary",
]

ENTITY_PUBLIC_REFERENCE_COLUMNS = [
    "reference_id",
    "entity_id",
    "source_id",
    "reference_type",
    "url",
    "source_locator",
    "as_of_date",
    "confidence",
    "public_sensitivity",
    "notes",
]

ENTITY_CONTEXT_ENRICHMENT_COLUMNS = [
    "enrichment_id",
    "entity_id",
    "source_id",
    "source_locator",
    "field_group",
    "field_name",
    "value_json",
    "as_of_date",
    "confidence",
    "public_sensitivity",
    "notes",
]

COVERAGE_COLUMNS = [
    "coverage_id",
    "entity_id",
    "layer",
    "category_id",
    "status",
    "record_count",
    "source_ids_json",
    "as_of_date",
    "confidence",
    "research_priority",
    "public_sensitivity",
    "next_step",
    "notes",
]

EQUIPMENT_COLUMNS = [
    "equipment_id",
    "entity_id",
    "service_branch",
    "category",
    "subcategory",
    "system_name",
    "variant",
    "origin_country",
    "manufacturer",
    "role",
    "estimated_total_count",
    "estimated_active_count",
    "estimated_storage_count",
    "estimated_ordered_count",
    "estimated_delivered_count",
    "readiness_status",
    "upgrade_status",
    "introduction_year",
    "retirement_year",
    "source_id",
    "source_locator",
    "as_of_date",
    "confidence",
    "estimate_type",
    "uncertainty_low",
    "uncertainty_high",
    "public_sensitivity",
    "notes",
]

SOFTWARE_COLUMNS = [
    "software_id",
    "entity_id",
    "service_branch",
    "category",
    "system_name",
    "variant",
    "developer",
    "role",
    "deployment_scope",
    "integration_targets_json",
    "lifecycle_status",
    "source_id",
    "source_locator",
    "as_of_date",
    "confidence",
    "estimate_type",
    "public_sensitivity",
    "notes",
]

CAPABILITY_COLUMNS = [
    "capability_id",
    "domain",
    "capability_type",
    "name",
    "description",
    "effect_model_json",
    "default_public_sensitivity",
    "source_id",
    "source_locator",
    "safety_boundary",
]

ASSET_CAPABILITY_COLUMNS = [
    "asset_capability_id",
    "entity_id",
    "capability_id",
    "asset_scope",
    "equipment_id",
    "software_id",
    "force_element_label",
    "capability_level",
    "quantity_basis",
    "effect_parameters_json",
    "constraints_json",
    "source_id",
    "source_locator",
    "as_of_date",
    "confidence",
    "estimate_type",
    "public_sensitivity",
    "notes",
]

INJECTION_ACTION_COLUMNS = [
    "action_type_id",
    "name",
    "description",
    "action_level",
    "required_capability_ids_json",
    "preconditions_json",
    "outputs_json",
    "failure_modes_json",
    "source_id",
    "source_locator",
    "safety_boundary",
]

PROFILE_SNAPSHOT_COLUMNS = [
    "profile_id",
    "entity_id",
    "as_of_date",
    "estimate_type",
    "confidence",
    "public_sensitivity",
    "classification_label",
    "source_ids_json",
    "summary",
]

MODEL_AREA_COLUMNS = [
    "model_area_id",
    "name",
    "description",
    "source_id",
    "source_locator",
]

DISPOSITION_VARIABLE_COLUMNS = [
    "variable_id",
    "model_area_id",
    "name",
    "description",
    "value_type",
    "unit",
    "allowed_sensitivity_max",
    "source_id",
    "source_locator",
    "safety_notes",
]

PROFILE_VALUE_COLUMNS = [
    "value_id",
    "profile_id",
    "variable_id",
    "value_json",
    "uncertainty_low",
    "uncertainty_high",
    "uncertainty_unit",
    "estimate_type",
    "confidence",
    "as_of_date",
    "public_sensitivity",
    "source_note",
]

SIMULATION_PROCESS_COLUMNS = [
    "process_id",
    "model_area_id",
    "name",
    "purpose",
    "inputs_json",
    "outputs_json",
    "source_id",
    "source_locator",
    "safety_boundary",
]


def load_json(path: pathlib.Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def load_equipment_rows() -> list[dict[str, Any]]:
    rows = list(load_json(ROOT / "data" / "equipment_inventory.json").get("equipment", []))
    bulk_path = ROOT / "data" / "equipment_inventory_wikipedia_staging.json"
    if bulk_path.exists():
        rows.extend(load_json(bulk_path).get("equipment", []))
    return rows


def json_text(value: Any) -> str:
    return json.dumps(value if value is not None else [], ensure_ascii=False, sort_keys=True)


def table_columns(connection: sqlite3.Connection, table: str) -> list[str]:
    rows = connection.execute(f"PRAGMA table_info({table})").fetchall()
    return [row[1] for row in rows]


def insert_row(connection: sqlite3.Connection, table: str, row: dict[str, Any]) -> None:
    columns = table_columns(connection, table)
    insertable = [column for column in columns if column in row]
    values = [row.get(column) for column in insertable]
    placeholders = ", ".join("?" for _ in insertable)
    column_sql = ", ".join(insertable)
    connection.execute(f"INSERT INTO {table} ({column_sql}) VALUES ({placeholders})", values)


def select_table(connection: sqlite3.Connection, table: str) -> tuple[list[str], list[dict[str, Any]]]:
    columns = table_columns(connection, table)
    rows = connection.execute(f"SELECT {', '.join(columns)} FROM {table}").fetchall()
    return columns, [dict(zip(columns, row, strict=True)) for row in rows]


def run_validation() -> None:
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "validate.py")],
        cwd=ROOT,
        check=False,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        sys.stderr.write(result.stdout)
        sys.stderr.write(result.stderr)
        raise SystemExit(result.returncode)


def build_database(sqlite_path: pathlib.Path) -> dict[str, int]:
    if sqlite_path.exists():
        sqlite_path.unlink()

    ddl = (ROOT / "schema.sql").read_text(encoding="utf-8")
    connection = sqlite3.connect(sqlite_path)
    connection.execute("PRAGMA foreign_keys = ON")
    connection.executescript(ddl)

    sources = load_json(ROOT / "data" / "sources.json").get("sources", [])
    entities = load_json(ROOT / "data" / "entities.json").get("entities", [])
    equipment_rows = load_equipment_rows()
    model_catalog = load_json(ROOT / "data" / "model_catalog.json")
    seed_profiles = load_json(ROOT / "data" / "seed_profiles.json").get("profiles", [])
    capability_payload = load_json(ROOT / "data" / "capability_catalog.json")
    coverage_payload = load_json(ROOT / "data" / "exhaustive_coverage_matrix.json")
    reference_payload = load_json(ROOT / "data" / "entity_public_references.json")
    enrichment_payload = load_json(ROOT / "data" / "entity_context_enrichment.json")

    for source in sources:
        insert_row(connection, "source", {column: source.get(column) for column in SOURCE_COLUMNS})

    for entity in entities:
        row = {column: entity.get(column) for column in ENTITY_COLUMNS if column != "source_ids_json"}
        row["public_military_data_available"] = int(bool(row["public_military_data_available"]))
        row["profile_seeded"] = int(bool(row["profile_seeded"]))
        row["source_ids_json"] = json_text(entity.get("source_ids", []))
        insert_row(connection, "entity", row)
        for source_id in entity.get("source_ids", []):
            insert_row(
                connection,
                "entity_source",
                {
                    "entity_id": entity["entity_id"],
                    "source_id": source_id,
                    "source_note": "Entity/status coverage source.",
                },
            )

    for reference in reference_payload.get("references", []):
        insert_row(
            connection,
            "entity_public_reference",
            {column: reference.get(column) for column in ENTITY_PUBLIC_REFERENCE_COLUMNS},
        )

    for enrichment in enrichment_payload.get("enrichment", []):
        row = {
            column: enrichment.get(column)
            for column in ENTITY_CONTEXT_ENRICHMENT_COLUMNS
            if column != "value_json"
        }
        row["value_json"] = json_text(enrichment.get("value", {}))
        insert_row(connection, "entity_context_enrichment", row)

    for category in coverage_payload.get("categories", []):
        row = {column: category.get(column) for column in COVERAGE_CATEGORY_COLUMNS}
        row["source_id"] = row.get("source_id") or "PROJECT_SCHEMA"
        row["source_locator"] = row.get("source_locator") or "data/exhaustive_coverage_matrix.json"
        insert_row(connection, "coverage_category", row)

    for coverage in coverage_payload.get("coverage", []):
        row = {column: coverage.get(column) for column in COVERAGE_COLUMNS if column != "source_ids_json"}
        row["source_ids_json"] = json_text(coverage.get("source_ids", []))
        insert_row(connection, "entity_category_coverage", row)

    for equipment in equipment_rows:
        insert_row(connection, "equipment_inventory", {column: equipment.get(column) for column in EQUIPMENT_COLUMNS})

    for software in capability_payload.get("software_inventory", []):
        row = {column: software.get(column) for column in SOFTWARE_COLUMNS if column != "integration_targets_json"}
        row["integration_targets_json"] = json_text(software.get("integration_targets", []))
        insert_row(connection, "software_system_inventory", row)

    for capability in capability_payload.get("capability_definitions", []):
        row = {
            column: capability.get(column)
            for column in CAPABILITY_COLUMNS
            if column not in {"effect_model_json", "source_id", "source_locator"}
        }
        row["effect_model_json"] = json_text(capability.get("effect_model", {}))
        row["source_id"] = capability.get("source_id") or "PROJECT_SCHEMA"
        row["source_locator"] = capability.get("source_locator") or "data/capability_catalog.json"
        insert_row(connection, "capability_catalog", row)

    for mapping in capability_payload.get("asset_capability_map", []):
        row = {
            column: mapping.get(column)
            for column in ASSET_CAPABILITY_COLUMNS
            if column not in {"effect_parameters_json", "constraints_json"}
        }
        row["effect_parameters_json"] = json_text(mapping.get("effect_parameters", {}))
        row["constraints_json"] = json_text(mapping.get("constraints", {}))
        insert_row(connection, "asset_capability_map", row)

    for action in capability_payload.get("injection_action_types", []):
        row = {
            column: action.get(column)
            for column in INJECTION_ACTION_COLUMNS
            if column
            not in {
                "required_capability_ids_json",
                "preconditions_json",
                "outputs_json",
                "failure_modes_json",
                "source_id",
                "source_locator",
            }
        }
        row["required_capability_ids_json"] = json_text(action.get("required_capability_ids", []))
        row["preconditions_json"] = json_text(action.get("preconditions", {}))
        row["outputs_json"] = json_text(action.get("outputs", {}))
        row["failure_modes_json"] = json_text(action.get("failure_modes", []))
        row["source_id"] = action.get("source_id") or "PROJECT_SCHEMA"
        row["source_locator"] = action.get("source_locator") or "data/capability_catalog.json"
        insert_row(connection, "injection_action_type", row)

    for area in model_catalog.get("model_areas", []):
        row = {column: area.get(column) for column in MODEL_AREA_COLUMNS}
        row["source_id"] = row.get("source_id") or "PROJECT_SCHEMA"
        row["source_locator"] = row.get("source_locator") or "data/model_catalog.json"
        insert_row(connection, "model_area", row)

    for variable in model_catalog.get("variables", []):
        row = {column: variable.get(column) for column in DISPOSITION_VARIABLE_COLUMNS}
        row["description"] = row.get("description") or row.get("name") or row["variable_id"]
        row["source_id"] = row.get("source_id") or "PROJECT_SCHEMA"
        row["source_locator"] = row.get("source_locator") or "data/model_catalog.json"
        insert_row(connection, "disposition_variable", row)

    for profile in seed_profiles:
        snapshot = {
            column: profile.get(column)
            for column in PROFILE_SNAPSHOT_COLUMNS
            if column not in {"classification_label", "source_ids_json"}
        }
        snapshot["classification_label"] = "public"
        snapshot["source_ids_json"] = json_text(profile.get("sources", []))
        insert_row(connection, "profile_snapshot", snapshot)

        for variable_id, value in profile.get("variables", {}).items():
            value_id = f"{profile['profile_id']}__{variable_id}"
            insert_row(
                connection,
                "profile_variable_value",
                {
                    "value_id": value_id,
                    "profile_id": profile["profile_id"],
                    "variable_id": variable_id,
                    "value_json": json_text(value),
                    "uncertainty_low": None,
                    "uncertainty_high": None,
                    "uncertainty_unit": None,
                    "estimate_type": profile["estimate_type"],
                    "confidence": profile["confidence"],
                    "as_of_date": profile["as_of_date"],
                    "public_sensitivity": profile["public_sensitivity"],
                    "source_note": profile.get("source_notes"),
                },
            )
            for source_id in profile.get("sources", []):
                insert_row(
                    connection,
                    "value_source",
                    {
                        "value_id": value_id,
                        "source_id": source_id,
                        "locator": profile.get("source_notes"),
                    },
                )

    for process in model_catalog.get("processes", []):
        insert_row(
            connection,
            "simulation_process",
            {
                "process_id": process.get("process_id"),
                "model_area_id": process.get("model_area_id"),
                "name": process.get("name"),
                "purpose": process.get("purpose"),
                "inputs_json": json_text(process.get("inputs", [])),
                "outputs_json": json_text(process.get("outputs", [])),
                "source_id": process.get("source_id") or "PROJECT_SCHEMA",
                "source_locator": process.get("source_locator") or "data/model_catalog.json",
                "safety_boundary": process.get("safety_boundary"),
            },
        )

    connection.commit()
    counts = {
        table: connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        for table in TABLE_ORDER
    }
    connection.close()
    return counts


def export_csvs(sqlite_path: pathlib.Path, csv_dir: pathlib.Path) -> list[pathlib.Path]:
    csv_dir.mkdir(parents=True, exist_ok=True)
    written: list[pathlib.Path] = []
    connection = sqlite3.connect(sqlite_path)
    try:
        for table in TABLE_ORDER:
            columns, rows = select_table(connection, table)
            path = csv_dir / f"{table}.csv"
            with path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=columns)
                writer.writeheader()
                writer.writerows(rows)
            written.append(path)
    finally:
        connection.close()
    return written


def export_json_bundle(sqlite_path: pathlib.Path, json_path: pathlib.Path, counts: dict[str, int]) -> pathlib.Path:
    connection = sqlite3.connect(sqlite_path)
    try:
        tables = {}
        for table in TABLE_ORDER:
            _, rows = select_table(connection, table)
            tables[table] = rows
    finally:
        connection.close()

    payload = {
        "metadata": {
            "title": "AdaptSim Military Disposition Public Export",
            "generated_at": dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat(),
            "schema": "schema.sql",
            "source_policy": "Public, attributable, non-operational data only.",
            "safety_note": "No live disposition, targeting data, exploitable vulnerabilities, classified/leaked material, or weapon employment instructions.",
            "table_counts": counts,
        },
        "tables": tables,
    }
    with json_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    return json_path


def sha256_file(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_manifest(export_dir: pathlib.Path, files: list[pathlib.Path], counts: dict[str, int]) -> pathlib.Path:
    manifest_path = export_dir / "manifest.json"
    payload = {
        "generated_at": dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat(),
        "database": DATABASE_BASENAME,
        "formats": ["sqlite", "csv", "json", "zip"],
        "table_counts": counts,
        "files": [
            {
                "path": str(path.relative_to(export_dir)),
                "bytes": path.stat().st_size,
                "sha256": sha256_file(path),
            }
            for path in files
            if path.exists() and path != manifest_path
        ],
        "safety_note": "Export contains public, non-operational simulation data only. Do not add live or sensitive operational material.",
    }
    with manifest_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    return manifest_path


def write_zip(export_dir: pathlib.Path, files: list[pathlib.Path], zip_path: pathlib.Path) -> pathlib.Path:
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in files:
            if path.exists() and path != zip_path:
                archive.write(path, path.relative_to(export_dir))
    return zip_path


def export_database(export_dir: pathlib.Path, skip_validation: bool = False) -> dict[str, Any]:
    if not skip_validation:
        run_validation()

    export_dir.mkdir(parents=True, exist_ok=True)
    csv_dir = export_dir / "csv"
    sqlite_path = export_dir / f"{DATABASE_BASENAME}.sqlite"
    json_path = export_dir / f"{DATABASE_BASENAME}_bundle.json"
    zip_path = export_dir / f"{DATABASE_BASENAME}_export.zip"

    counts = build_database(sqlite_path)
    csv_paths = export_csvs(sqlite_path, csv_dir)
    export_json_bundle(sqlite_path, json_path, counts)

    files = [sqlite_path, json_path, *csv_paths]
    manifest_path = write_manifest(export_dir, files, counts)
    files.append(manifest_path)
    write_zip(export_dir, files, zip_path)
    files.append(zip_path)
    write_manifest(export_dir, files, counts)

    return {
        "export_dir": export_dir,
        "sqlite": sqlite_path,
        "json_bundle": json_path,
        "csv_dir": csv_dir,
        "zip": zip_path,
        "manifest": manifest_path,
        "counts": counts,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out-dir",
        type=pathlib.Path,
        default=DEFAULT_EXPORT_DIR,
        help="Directory for generated export artifacts.",
    )
    parser.add_argument(
        "--skip-validation",
        action="store_true",
        help="Skip scripts/validate.py before exporting.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.out_dir.exists() and not args.out_dir.is_dir():
        raise SystemExit(f"Export path exists and is not a directory: {args.out_dir}")

    if args.out_dir.exists():
        for stale_zip in args.out_dir.glob("*_export.zip"):
            stale_zip.unlink()
        stale_csv_dir = args.out_dir / "csv"
        if stale_csv_dir.exists():
            shutil.rmtree(stale_csv_dir)

    result = export_database(args.out_dir, skip_validation=args.skip_validation)
    print(f"exported to {result['export_dir']}")
    print(f"sqlite: {result['sqlite']}")
    print(f"csv: {result['csv_dir']}")
    print(f"json: {result['json_bundle']}")
    print(f"zip: {result['zip']}")
    print("table counts:")
    for table, count in result["counts"].items():
        print(f"- {table}: {count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
