#!/usr/bin/env python3
"""Generate exhaustive entity/category coverage rows for public research status."""

from __future__ import annotations

import datetime as dt
import json
import pathlib
from collections import Counter, defaultdict
from typing import Any


ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "exhaustive_coverage_matrix.json"
AS_OF_DATE = dt.date.today().isoformat()

EQUIPMENT_CATEGORIES = [
    "small_arms_family",
    "crew_served_weapons",
    "tank",
    "ifv_apc_mrap",
    "artillery",
    "mlrs",
    "tactical_missile",
    "sam_gbad",
    "radar_sensor",
    "ew_system",
    "logistics_vehicle",
    "combat_aircraft",
    "transport_aircraft",
    "helicopter",
    "uav",
    "naval_combatant",
    "submarine",
    "amphibious_vessel",
    "auxiliary_vessel",
    "coast_guard_security_asset",
    "nuclear_delivery_system",
    "other_public_system",
]

SOFTWARE_CATEGORIES = [
    "c2_battle_management",
    "air_defense_c2",
    "fire_control",
    "logistics_enterprise",
    "intelligence_processing",
    "cyber_defense_public",
    "cyber_operations_public",
    "electronic_warfare_control",
    "space_ground_system",
    "training_simulation",
    "data_link_network",
    "other_public_software",
]

LAYER_DESCRIPTIONS = {
    "model_area": "One of the 13 requested public military disposition model areas.",
    "equipment": "Public platform/system/variant equipment inventory category.",
    "software": "Public software, digital, C4ISR, logistics, or training system category.",
    "capability": "Simulation-addressable capability definition that can be mapped to equipment, software, force structures, or entity-level posture.",
}


def load_json(path: pathlib.Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def humanize(value: str) -> str:
    return value.replace("_", " ").title()


def load_equipment_rows() -> list[dict[str, Any]]:
    rows = list(load_json(ROOT / "data" / "equipment_inventory.json").get("equipment", []))
    bulk_path = ROOT / "data" / "equipment_inventory_wikipedia_staging.json"
    if bulk_path.exists():
        rows.extend(load_json(bulk_path).get("equipment", []))
    return rows


def category_catalog(model_catalog: dict[str, Any], capability_payload: dict[str, Any]) -> list[dict[str, str]]:
    categories = []
    for area in model_catalog.get("model_areas", []):
        categories.append(
            {
                "layer": "model_area",
                "category_id": area["model_area_id"],
                "name": area["name"],
                "description": area["description"],
                "required_source_tier": "public country profile source",
                "source_id": "PROJECT_SCHEMA",
                "source_locator": "data/model_catalog.json",
                "safety_boundary": "Use country-level public abstractions only; no live operational detail.",
            }
        )
    for category in EQUIPMENT_CATEGORIES:
        categories.append(
            {
                "layer": "equipment",
                "category_id": category,
                "name": humanize(category),
                "description": "Public equipment inventory category requiring platform/system/family rows where known.",
                "required_source_tier": "official/IISS/SIPRI/UNROCA/FlightGlobal/naval register preferred; Wikipedia staging allowed only as low-confidence seed",
                "source_id": "PROJECT_SCHEMA",
                "source_locator": "schema.sql equipment_inventory category enum",
                "safety_boundary": "No live basing, tasking, readiness, targeting, vulnerability, or employment details.",
            }
        )
    for category in SOFTWARE_CATEGORIES:
        categories.append(
            {
                "layer": "software",
                "category_id": category,
                "name": humanize(category),
                "description": "Public software or digital military capability category.",
                "required_source_tier": "official public program material or reputable public reporting",
                "source_id": "PROJECT_SCHEMA",
                "source_locator": "schema.sql software_system_inventory category enum",
                "safety_boundary": "No architecture, credentials, frequencies, cryptography, exploit paths, or vulnerabilities.",
            }
        )
    for capability in capability_payload.get("capability_definitions", []):
        categories.append(
            {
                "layer": "capability",
                "category_id": capability["capability_id"],
                "name": capability["name"],
                "description": capability["description"],
                "required_source_tier": "mapped from sourced public inventory/software/profile records",
                "source_id": "PROJECT_SCHEMA",
                "source_locator": "data/capability_catalog.json",
                "safety_boundary": capability["safety_boundary"],
            }
        )
    return categories


def priority_for_entity(entity: dict[str, Any]) -> str:
    if entity.get("coverage_tier") == "seed_profile":
        return "high"
    if entity.get("entity_status") in {"un_member_state", "un_observer_state"}:
        return "medium"
    return "low"


def status_for_count(count: int) -> str:
    return "seeded_partial" if count > 0 else "not_started"


def main() -> int:
    entities = load_json(ROOT / "data" / "entities.json")["entities"]
    model_catalog = load_json(ROOT / "data" / "model_catalog.json")
    capability_payload = load_json(ROOT / "data" / "capability_catalog.json")
    seed_profiles = load_json(ROOT / "data" / "seed_profiles.json").get("profiles", [])
    equipment_rows = load_equipment_rows()

    categories = category_catalog(model_catalog, capability_payload)
    variable_to_area = {
        variable["variable_id"]: variable["model_area_id"]
        for variable in model_catalog.get("variables", [])
    }

    counts: dict[tuple[str, str, str], int] = Counter()
    sources: dict[tuple[str, str, str], set[str]] = defaultdict(set)
    notes: dict[tuple[str, str, str], set[str]] = defaultdict(set)

    for profile in seed_profiles:
        for variable_id in profile.get("variables", {}):
            area = variable_to_area.get(variable_id)
            if not area:
                continue
            key = (profile["entity_id"], "model_area", area)
            counts[key] += 1
            sources[key].update(profile.get("sources", []))

    for row in equipment_rows:
        key = (row["entity_id"], "equipment", row["category"])
        counts[key] += 1
        sources[key].add(row["source_id"])
        if row.get("source_id") == "WIKIPEDIA_LOW_CONF":
            notes[key].add("Includes low-confidence Wikipedia staging rows; requires review and source upgrade.")

    for row in capability_payload.get("software_inventory", []):
        key = (row["entity_id"], "software", row["category"])
        counts[key] += 1
        sources[key].add(row["source_id"])

    for row in capability_payload.get("asset_capability_map", []):
        key = (row["entity_id"], "capability", row["capability_id"])
        counts[key] += 1
        sources[key].add(row["source_id"])

    coverage = []
    for entity in entities:
        priority = priority_for_entity(entity)
        for category in categories:
            key = (entity["entity_id"], category["layer"], category["category_id"])
            count = counts[key]
            source_ids = sorted(sources[key])
            status = status_for_count(count)
            next_step = (
                "Review existing public rows, reconcile duplicates, and upgrade source confidence."
                if count
                else "Research public sources; mark no_public_info_found or not_applicable only after documented review."
            )
            coverage.append(
                {
                    "coverage_id": f"{entity['entity_id']}__{category['layer']}__{category['category_id']}",
                    "entity_id": entity["entity_id"],
                    "layer": category["layer"],
                    "category_id": category["category_id"],
                    "status": status,
                    "record_count": count,
                    "source_ids": source_ids or ["PROJECT_SCHEMA"],
                    "as_of_date": AS_OF_DATE,
                    "confidence": "low" if not count or "WIKIPEDIA_LOW_CONF" in source_ids else "medium",
                    "research_priority": priority,
                    "public_sensitivity": "public_low_to_moderate",
                    "next_step": next_step,
                    "notes": " ".join(sorted(notes[key])) or None,
                }
            )

    status_counts = Counter(row["status"] for row in coverage)
    layer_counts = Counter(row["layer"] for row in coverage)
    payload = {
        "metadata": {
            "title": "Exhaustive Public Coverage Matrix",
            "scope": "One coverage row for every tracked entity and every model/equipment/software/capability category.",
            "generated_at": AS_OF_DATE,
            "entity_count": len(entities),
            "category_count": len(categories),
            "coverage_row_count": len(coverage),
            "exhaustiveness_rule": "A category is analytically exhaustive only when status is complete_public, no_public_info_found, or not_applicable with sources/notes supporting that status.",
            "safety_note": "Coverage tracking must not introduce live disposition, targeting, vulnerabilities, classified data, or weapon employment details.",
        },
        "summary": {
            "by_status": dict(sorted(status_counts.items())),
            "by_layer": dict(sorted(layer_counts.items())),
        },
        "categories": categories,
        "coverage": coverage,
    }
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {len(coverage)} coverage rows across {len(entities)} entities and {len(categories)} categories")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
