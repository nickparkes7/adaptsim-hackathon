#!/usr/bin/env python3
"""Basic structural validation for the starter public military disposition DB."""

from __future__ import annotations

import json
import pathlib
import sqlite3
import sys


ROOT = pathlib.Path(__file__).resolve().parents[1]


REQUIRED_ENTITY_FIELDS = {
    "entity_id",
    "name",
    "entity_status",
    "un_membership",
    "included_reason",
    "coverage_tier",
    "public_military_data_available",
    "source_ids",
    "as_of_date",
    "confidence",
}

REQUIRED_SEED_FIELDS = {
    "profile_id",
    "entity_id",
    "as_of_date",
    "confidence",
    "public_sensitivity",
    "estimate_type",
    "variables",
    "sources",
}

REQUIRED_EQUIPMENT_FIELDS = {
    "equipment_id",
    "entity_id",
    "category",
    "system_name",
    "source_id",
    "as_of_date",
    "confidence",
    "estimate_type",
}

REQUIRED_CAPABILITY_FIELDS = {
    "capability_id",
    "domain",
    "capability_type",
    "name",
    "description",
    "effect_model",
    "default_public_sensitivity",
    "safety_boundary",
}

REQUIRED_SOFTWARE_FIELDS = {
    "software_id",
    "entity_id",
    "category",
    "system_name",
    "source_id",
    "as_of_date",
    "confidence",
    "estimate_type",
    "public_sensitivity",
}

REQUIRED_ASSET_CAPABILITY_FIELDS = {
    "asset_capability_id",
    "entity_id",
    "capability_id",
    "asset_scope",
    "source_id",
    "as_of_date",
    "confidence",
    "estimate_type",
    "public_sensitivity",
}

REQUIRED_INJECTION_ACTION_FIELDS = {
    "action_type_id",
    "name",
    "description",
    "action_level",
    "required_capability_ids",
    "preconditions",
    "outputs",
    "failure_modes",
    "safety_boundary",
}

REQUIRED_COVERAGE_CATEGORY_FIELDS = {
    "layer",
    "category_id",
    "name",
    "description",
    "required_source_tier",
    "source_id",
    "source_locator",
    "safety_boundary",
}

REQUIRED_COVERAGE_FIELDS = {
    "coverage_id",
    "entity_id",
    "layer",
    "category_id",
    "status",
    "record_count",
    "source_ids",
    "as_of_date",
    "confidence",
    "research_priority",
    "public_sensitivity",
}

REQUIRED_PUBLIC_REFERENCE_FIELDS = {
    "reference_id",
    "entity_id",
    "source_id",
    "reference_type",
    "url",
    "source_locator",
    "as_of_date",
    "confidence",
    "public_sensitivity",
}

REQUIRED_ENRICHMENT_FIELDS = {
    "enrichment_id",
    "entity_id",
    "source_id",
    "source_locator",
    "field_group",
    "field_name",
    "value",
    "as_of_date",
    "confidence",
    "public_sensitivity",
}

COUNT_FIELDS = {
    "estimated_total_count",
    "estimated_active_count",
    "estimated_storage_count",
    "estimated_ordered_count",
    "estimated_delivered_count",
    "uncertainty_low",
    "uncertainty_high",
}

ESTIMATE_TYPES = {"reported", "estimated_range", "model_parameter", "qualitative_assessment", "unknown"}
CONFIDENCE_VALUES = {"low", "medium", "high"}
PUBLIC_SENSITIVITY_VALUES = {
    "public_low",
    "public_low_to_moderate",
    "public_moderate",
    "exclude_operational_sensitive",
}

EQUIPMENT_CATEGORIES = {
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
}

SOFTWARE_CATEGORIES = {
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
}

CAPABILITY_DOMAINS = {
    "land",
    "air",
    "maritime",
    "space",
    "cyber",
    "c4isr",
    "logistics",
    "personnel",
    "economic_industrial",
    "political_legal",
    "nuclear",
    "multi_domain",
}

CAPABILITY_TYPES = {
    "kinetic_effect",
    "mobility",
    "protection",
    "sensing",
    "command_control",
    "communications",
    "intelligence_processing",
    "deception",
    "electronic_warfare",
    "sustainment",
    "mobilization",
    "deterrence",
    "training",
    "industrial_capacity",
    "legal_constraint",
    "simulation_process",
}

ASSET_SCOPES = {"entity_level", "equipment", "software", "force_element", "scenario_overlay"}
CAPABILITY_LEVELS = {None, "unknown", "limited", "basic", "moderate", "advanced", "strategic"}
ACTION_LEVELS = {"tactical", "operational", "strategic", "political"}
COVERAGE_LAYERS = {"model_area", "equipment", "software", "capability"}
COVERAGE_STATUSES = {
    "not_started",
    "in_progress",
    "seeded_partial",
    "partial_public",
    "complete_public",
    "no_public_info_found",
    "not_applicable",
    "conflict_sensitive_deferred",
}
RESEARCH_PRIORITIES = {"low", "medium", "high"}


def load_json(path: pathlib.Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def load_equipment_rows() -> list[dict]:
    rows = list(load_json(ROOT / "data" / "equipment_inventory.json").get("equipment", []))
    bulk_path = ROOT / "data" / "equipment_inventory_wikipedia_staging.json"
    if bulk_path.exists():
        rows.extend(load_json(bulk_path).get("equipment", []))
    return rows


def validate_entities() -> list[str]:
    errors: list[str] = []
    payload = load_json(ROOT / "data" / "entities.json")
    entities = payload.get("entities", [])
    ids = [entity.get("entity_id") for entity in entities]
    if len(ids) != len(set(ids)):
        errors.append("entities.json has duplicate entity_id values")
    if len(entities) < 195:
        errors.append(f"entities.json has too few records: {len(entities)}")
    status_counts = {}
    for entity in entities:
        status_counts[entity["entity_status"]] = status_counts.get(entity["entity_status"], 0) + 1
    if status_counts.get("un_member_state") != 193:
        errors.append(f"expected 193 UN member states, found {status_counts.get('un_member_state', 0)}")
    for required in ["USA", "CHN", "RUS", "IND", "GBR", "FRA", "IRN", "ISR", "UKR", "TWN", "XKX", "PSE", "VAT"]:
        if required not in ids:
            errors.append(f"entities.json missing required entity_id {required}")
    for entity in entities:
        missing = REQUIRED_ENTITY_FIELDS - set(entity)
        if missing:
            errors.append(f"{entity.get('entity_id', '<unknown>')} missing fields {sorted(missing)}")
    return errors


def validate_sources() -> list[str]:
    errors: list[str] = []
    payload = load_json(ROOT / "data" / "sources.json")
    sources = payload.get("sources", [])
    ids = [source.get("source_id") for source in sources]
    if len(ids) != len(set(ids)):
        errors.append("sources.json has duplicate source_id values")
    for source in sources:
        if not source.get("source_id") or not source.get("url") or not source.get("publisher"):
            errors.append(f"source missing source_id/url/publisher: {source}")
    return errors


def validate_public_references() -> list[str]:
    errors: list[str] = []
    path = ROOT / "data" / "entity_public_references.json"
    if not path.exists():
        errors.append("data/entity_public_references.json missing; run scripts/generate_public_references.py")
        return errors

    entity_ids = {entity["entity_id"] for entity in load_json(ROOT / "data" / "entities.json")["entities"]}
    source_ids = {source["source_id"] for source in load_json(ROOT / "data" / "sources.json")["sources"]}
    payload = load_json(path)
    references = payload.get("references", [])
    ids = [reference.get("reference_id") for reference in references]
    if len(ids) != len(set(ids)):
        errors.append("entity_public_references.json has duplicate reference_id values")
    if len(references) < len(entity_ids) * 2:
        errors.append(f"expected at least {len(entity_ids) * 2} public reference rows, found {len(references)}")
    for reference in references:
        missing = REQUIRED_PUBLIC_REFERENCE_FIELDS - set(reference)
        if missing:
            errors.append(f"{reference.get('reference_id', '<unknown>')} missing fields {sorted(missing)}")
        if reference.get("entity_id") not in entity_ids:
            errors.append(f"{reference.get('reference_id')} references unknown entity_id {reference.get('entity_id')}")
        if reference.get("source_id") not in source_ids:
            errors.append(f"{reference.get('reference_id')} references unknown source_id {reference.get('source_id')}")
        if reference.get("confidence") not in CONFIDENCE_VALUES:
            errors.append(f"{reference.get('reference_id')} has invalid confidence {reference.get('confidence')}")
        if reference.get("public_sensitivity") not in PUBLIC_SENSITIVITY_VALUES:
            errors.append(f"{reference.get('reference_id')} has invalid public_sensitivity {reference.get('public_sensitivity')}")
        if not reference.get("url"):
            errors.append(f"{reference.get('reference_id')} missing url")
    return errors


def validate_entity_enrichment() -> list[str]:
    errors: list[str] = []
    path = ROOT / "data" / "entity_context_enrichment.json"
    if not path.exists():
        errors.append("data/entity_context_enrichment.json missing; run scripts/generate_entity_enrichment.py")
        return errors

    entity_ids = {entity["entity_id"] for entity in load_json(ROOT / "data" / "entities.json")["entities"]}
    source_ids = {source["source_id"] for source in load_json(ROOT / "data" / "sources.json")["sources"]}
    payload = load_json(path)
    rows = payload.get("enrichment", [])
    ids = [row.get("enrichment_id") for row in rows]
    if len(ids) != len(set(ids)):
        errors.append("entity_context_enrichment.json has duplicate enrichment_id values")
    if len(rows) < 100:
        errors.append(f"expected at least 100 entity enrichment rows, found {len(rows)}")
    for row in rows:
        missing = REQUIRED_ENRICHMENT_FIELDS - set(row)
        if missing:
            errors.append(f"{row.get('enrichment_id', '<unknown>')} missing fields {sorted(missing)}")
        if row.get("entity_id") not in entity_ids:
            errors.append(f"{row.get('enrichment_id')} references unknown entity_id {row.get('entity_id')}")
        if row.get("source_id") not in source_ids:
            errors.append(f"{row.get('enrichment_id')} references unknown source_id {row.get('source_id')}")
        if not row.get("source_locator"):
            errors.append(f"{row.get('enrichment_id')} missing source_locator")
        if not row.get("field_group") or not row.get("field_name"):
            errors.append(f"{row.get('enrichment_id')} missing field_group/field_name")
        if not isinstance(row.get("value"), dict):
            errors.append(f"{row.get('enrichment_id')} value must be an object")
        if row.get("confidence") not in CONFIDENCE_VALUES:
            errors.append(f"{row.get('enrichment_id')} has invalid confidence {row.get('confidence')}")
        if row.get("public_sensitivity") not in PUBLIC_SENSITIVITY_VALUES:
            errors.append(f"{row.get('enrichment_id')} has invalid public_sensitivity {row.get('public_sensitivity')}")
    return errors


def validate_seed_profiles() -> list[str]:
    errors: list[str] = []
    entity_ids = {entity["entity_id"] for entity in load_json(ROOT / "data" / "entities.json")["entities"]}
    source_ids = {source["source_id"] for source in load_json(ROOT / "data" / "sources.json")["sources"]}
    payload = load_json(ROOT / "data" / "seed_profiles.json")
    profiles = payload.get("profiles", [])
    if len(profiles) < 10:
        errors.append(f"expected at least 10 seed profiles, found {len(profiles)}")
    for profile in profiles:
        missing = REQUIRED_SEED_FIELDS - set(profile)
        if missing:
            errors.append(f"{profile.get('profile_id', '<unknown>')} missing fields {sorted(missing)}")
        if profile.get("entity_id") not in entity_ids:
            errors.append(f"{profile.get('profile_id')} references unknown entity_id {profile.get('entity_id')}")
        for source_id in profile.get("sources", []):
            if source_id not in source_ids:
                errors.append(f"{profile.get('profile_id')} references unknown source_id {source_id}")
    return errors


def validate_equipment_inventory() -> list[str]:
    errors: list[str] = []
    entity_ids = {entity["entity_id"] for entity in load_json(ROOT / "data" / "entities.json")["entities"]}
    source_ids = {source["source_id"] for source in load_json(ROOT / "data" / "sources.json")["sources"]}
    rows = load_equipment_rows()
    ids = [row.get("equipment_id") for row in rows]
    if len(ids) != len(set(ids)):
        errors.append("equipment inventory sources have duplicate equipment_id values")
    if len(rows) < 12:
        errors.append(f"expected at least 12 equipment seed rows, found {len(rows)}")
    for row in rows:
        missing = REQUIRED_EQUIPMENT_FIELDS - set(row)
        if missing:
            errors.append(f"{row.get('equipment_id', '<unknown>')} missing fields {sorted(missing)}")
        if row.get("entity_id") not in entity_ids:
            errors.append(f"{row.get('equipment_id')} references unknown entity_id {row.get('entity_id')}")
        if row.get("source_id") not in source_ids:
            errors.append(f"{row.get('equipment_id')} references unknown source_id {row.get('source_id')}")
        if row.get("category") not in EQUIPMENT_CATEGORIES:
            errors.append(f"{row.get('equipment_id')} has invalid category {row.get('category')}")
        if row.get("confidence") not in CONFIDENCE_VALUES:
            errors.append(f"{row.get('equipment_id')} has invalid confidence {row.get('confidence')}")
        if row.get("estimate_type") not in ESTIMATE_TYPES:
            errors.append(f"{row.get('equipment_id')} has invalid estimate_type {row.get('estimate_type')}")
        for field in COUNT_FIELDS:
            value = row.get(field)
            if value is None:
                continue
            if not isinstance(value, int) or value < 0:
                errors.append(f"{row.get('equipment_id')} {field} must be null or non-negative integer, got {value!r}")
        low = row.get("uncertainty_low")
        high = row.get("uncertainty_high")
        if low is not None and high is not None and low > high:
            errors.append(f"{row.get('equipment_id')} uncertainty_low exceeds uncertainty_high")
    return errors


def validate_capability_catalog() -> list[str]:
    errors: list[str] = []
    entity_ids = {entity["entity_id"] for entity in load_json(ROOT / "data" / "entities.json")["entities"]}
    source_ids = {source["source_id"] for source in load_json(ROOT / "data" / "sources.json")["sources"]}
    equipment_ids = {
        row["equipment_id"]
        for row in load_equipment_rows()
        if row.get("equipment_id")
    }
    payload = load_json(ROOT / "data" / "capability_catalog.json")

    capabilities = payload.get("capability_definitions", [])
    capability_ids = [capability.get("capability_id") for capability in capabilities]
    if len(capability_ids) != len(set(capability_ids)):
        errors.append("capability_catalog.json has duplicate capability_id values")
    if len(capabilities) < 8:
        errors.append(f"expected at least 8 capability definitions, found {len(capabilities)}")
    for capability in capabilities:
        missing = REQUIRED_CAPABILITY_FIELDS - set(capability)
        if missing:
            errors.append(f"{capability.get('capability_id', '<unknown>')} missing fields {sorted(missing)}")
        if capability.get("domain") not in CAPABILITY_DOMAINS:
            errors.append(f"{capability.get('capability_id')} has invalid domain {capability.get('domain')}")
        if capability.get("capability_type") not in CAPABILITY_TYPES:
            errors.append(f"{capability.get('capability_id')} has invalid capability_type {capability.get('capability_type')}")
        if capability.get("default_public_sensitivity") not in PUBLIC_SENSITIVITY_VALUES:
            errors.append(f"{capability.get('capability_id')} has invalid default_public_sensitivity")
        if not isinstance(capability.get("effect_model"), dict):
            errors.append(f"{capability.get('capability_id')} effect_model must be an object")
        if not capability.get("safety_boundary"):
            errors.append(f"{capability.get('capability_id')} missing safety_boundary")

    capability_id_set = set(capability_ids)
    software_rows = payload.get("software_inventory", [])
    software_ids = [row.get("software_id") for row in software_rows]
    if len(software_ids) != len(set(software_ids)):
        errors.append("capability_catalog.json has duplicate software_id values")
    for row in software_rows:
        missing = REQUIRED_SOFTWARE_FIELDS - set(row)
        if missing:
            errors.append(f"{row.get('software_id', '<unknown>')} missing fields {sorted(missing)}")
        if row.get("entity_id") not in entity_ids:
            errors.append(f"{row.get('software_id')} references unknown entity_id {row.get('entity_id')}")
        if row.get("source_id") not in source_ids:
            errors.append(f"{row.get('software_id')} references unknown source_id {row.get('source_id')}")
        if row.get("category") not in SOFTWARE_CATEGORIES:
            errors.append(f"{row.get('software_id')} has invalid category {row.get('category')}")
        if row.get("confidence") not in CONFIDENCE_VALUES:
            errors.append(f"{row.get('software_id')} has invalid confidence {row.get('confidence')}")
        if row.get("estimate_type") not in ESTIMATE_TYPES:
            errors.append(f"{row.get('software_id')} has invalid estimate_type {row.get('estimate_type')}")
        if row.get("public_sensitivity") not in PUBLIC_SENSITIVITY_VALUES:
            errors.append(f"{row.get('software_id')} has invalid public_sensitivity {row.get('public_sensitivity')}")
        if not isinstance(row.get("integration_targets", []), list):
            errors.append(f"{row.get('software_id')} integration_targets must be a list")

    software_id_set = set(software_ids)
    mappings = payload.get("asset_capability_map", [])
    mapping_ids = [row.get("asset_capability_id") for row in mappings]
    if len(mapping_ids) != len(set(mapping_ids)):
        errors.append("capability_catalog.json has duplicate asset_capability_id values")
    for row in mappings:
        missing = REQUIRED_ASSET_CAPABILITY_FIELDS - set(row)
        if missing:
            errors.append(f"{row.get('asset_capability_id', '<unknown>')} missing fields {sorted(missing)}")
        if row.get("entity_id") not in entity_ids:
            errors.append(f"{row.get('asset_capability_id')} references unknown entity_id {row.get('entity_id')}")
        if row.get("capability_id") not in capability_id_set:
            errors.append(f"{row.get('asset_capability_id')} references unknown capability_id {row.get('capability_id')}")
        if row.get("source_id") not in source_ids:
            errors.append(f"{row.get('asset_capability_id')} references unknown source_id {row.get('source_id')}")
        if row.get("asset_scope") not in ASSET_SCOPES:
            errors.append(f"{row.get('asset_capability_id')} has invalid asset_scope {row.get('asset_scope')}")
        if row.get("capability_level") not in CAPABILITY_LEVELS:
            errors.append(f"{row.get('asset_capability_id')} has invalid capability_level {row.get('capability_level')}")
        if row.get("confidence") not in CONFIDENCE_VALUES:
            errors.append(f"{row.get('asset_capability_id')} has invalid confidence {row.get('confidence')}")
        if row.get("estimate_type") not in ESTIMATE_TYPES:
            errors.append(f"{row.get('asset_capability_id')} has invalid estimate_type {row.get('estimate_type')}")
        if row.get("public_sensitivity") not in PUBLIC_SENSITIVITY_VALUES:
            errors.append(f"{row.get('asset_capability_id')} has invalid public_sensitivity {row.get('public_sensitivity')}")
        if not isinstance(row.get("effect_parameters", {}), dict):
            errors.append(f"{row.get('asset_capability_id')} effect_parameters must be an object")
        if not isinstance(row.get("constraints", {}), dict):
            errors.append(f"{row.get('asset_capability_id')} constraints must be an object")
        if row.get("asset_scope") == "equipment" and row.get("equipment_id") not in equipment_ids:
            errors.append(f"{row.get('asset_capability_id')} references unknown equipment_id {row.get('equipment_id')}")
        if row.get("asset_scope") == "software" and row.get("software_id") not in software_id_set:
            errors.append(f"{row.get('asset_capability_id')} references unknown software_id {row.get('software_id')}")
        if row.get("asset_scope") in {"entity_level", "force_element", "scenario_overlay"} and (
            row.get("equipment_id") or row.get("software_id")
        ):
            errors.append(f"{row.get('asset_capability_id')} entity/force/scenario mapping must not include equipment_id or software_id")

    actions = payload.get("injection_action_types", [])
    action_ids = [row.get("action_type_id") for row in actions]
    if len(action_ids) != len(set(action_ids)):
        errors.append("capability_catalog.json has duplicate action_type_id values")
    if len(actions) < 5:
        errors.append(f"expected at least 5 injection action types, found {len(actions)}")
    for row in actions:
        missing = REQUIRED_INJECTION_ACTION_FIELDS - set(row)
        if missing:
            errors.append(f"{row.get('action_type_id', '<unknown>')} missing fields {sorted(missing)}")
        if row.get("action_level") not in ACTION_LEVELS:
            errors.append(f"{row.get('action_type_id')} has invalid action_level {row.get('action_level')}")
        if not isinstance(row.get("required_capability_ids"), list):
            errors.append(f"{row.get('action_type_id')} required_capability_ids must be a list")
        else:
            for capability_id in row.get("required_capability_ids", []):
                if capability_id not in capability_id_set:
                    errors.append(f"{row.get('action_type_id')} references unknown capability_id {capability_id}")
        if not isinstance(row.get("preconditions"), dict):
            errors.append(f"{row.get('action_type_id')} preconditions must be an object")
        if not isinstance(row.get("outputs"), dict):
            errors.append(f"{row.get('action_type_id')} outputs must be an object")
        if not isinstance(row.get("failure_modes"), list):
            errors.append(f"{row.get('action_type_id')} failure_modes must be a list")
        if not row.get("safety_boundary"):
            errors.append(f"{row.get('action_type_id')} missing safety_boundary")
    return errors


def validate_coverage_matrix() -> list[str]:
    errors: list[str] = []
    path = ROOT / "data" / "exhaustive_coverage_matrix.json"
    if not path.exists():
        errors.append("data/exhaustive_coverage_matrix.json missing; run scripts/generate_coverage_matrix.py")
        return errors

    entity_ids = {entity["entity_id"] for entity in load_json(ROOT / "data" / "entities.json")["entities"]}
    source_ids = {source["source_id"] for source in load_json(ROOT / "data" / "sources.json")["sources"]}
    payload = load_json(path)
    categories = payload.get("categories", [])
    coverage = payload.get("coverage", [])
    category_keys = {(row.get("layer"), row.get("category_id")) for row in categories}
    coverage_keys = {(row.get("entity_id"), row.get("layer"), row.get("category_id")) for row in coverage}

    if len(category_keys) != len(categories):
        errors.append("exhaustive_coverage_matrix.json has duplicate category keys")
    if len(coverage_keys) != len(coverage):
        errors.append("exhaustive_coverage_matrix.json has duplicate coverage keys")
    if not categories:
        errors.append("exhaustive_coverage_matrix.json has no categories")

    expected_rows = len(entity_ids) * len(categories)
    if len(coverage) != expected_rows:
        errors.append(f"expected {expected_rows} coverage rows, found {len(coverage)}")

    for category in categories:
        missing = REQUIRED_COVERAGE_CATEGORY_FIELDS - set(category)
        if missing:
            errors.append(f"coverage category {category.get('category_id', '<unknown>')} missing fields {sorted(missing)}")
        if category.get("layer") not in COVERAGE_LAYERS:
            errors.append(f"coverage category {category.get('category_id')} has invalid layer {category.get('layer')}")
        if category.get("source_id") not in source_ids:
            errors.append(f"coverage category {category.get('category_id')} references unknown source_id {category.get('source_id')}")
        if not category.get("source_locator"):
            errors.append(f"coverage category {category.get('category_id')} missing source_locator")

    for entity_id in entity_ids:
        for layer, category_id in category_keys:
            if (entity_id, layer, category_id) not in coverage_keys:
                errors.append(f"coverage matrix missing {entity_id}/{layer}/{category_id}")

    for row in coverage:
        missing = REQUIRED_COVERAGE_FIELDS - set(row)
        if missing:
            errors.append(f"coverage row {row.get('coverage_id', '<unknown>')} missing fields {sorted(missing)}")
        if row.get("entity_id") not in entity_ids:
            errors.append(f"{row.get('coverage_id')} references unknown entity_id {row.get('entity_id')}")
        if (row.get("layer"), row.get("category_id")) not in category_keys:
            errors.append(f"{row.get('coverage_id')} references unknown category {row.get('layer')}/{row.get('category_id')}")
        if row.get("status") not in COVERAGE_STATUSES:
            errors.append(f"{row.get('coverage_id')} has invalid status {row.get('status')}")
        if not isinstance(row.get("record_count"), int) or row.get("record_count") < 0:
            errors.append(f"{row.get('coverage_id')} record_count must be a non-negative integer")
        if not isinstance(row.get("source_ids"), list):
            errors.append(f"{row.get('coverage_id')} source_ids must be a list")
        else:
            if not row.get("source_ids"):
                errors.append(f"{row.get('coverage_id')} source_ids must not be empty")
            for source_id in row.get("source_ids", []):
                if source_id not in source_ids:
                    errors.append(f"{row.get('coverage_id')} references unknown source_id {source_id}")
        if row.get("confidence") not in CONFIDENCE_VALUES:
            errors.append(f"{row.get('coverage_id')} has invalid confidence {row.get('confidence')}")
        if row.get("research_priority") not in RESEARCH_PRIORITIES:
            errors.append(f"{row.get('coverage_id')} has invalid research_priority {row.get('research_priority')}")
        if row.get("public_sensitivity") not in PUBLIC_SENSITIVITY_VALUES:
            errors.append(f"{row.get('coverage_id')} has invalid public_sensitivity {row.get('public_sensitivity')}")
    return errors


def validate_sqlite_schema() -> list[str]:
    errors: list[str] = []
    ddl = (ROOT / "schema.sql").read_text(encoding="utf-8")
    try:
        con = sqlite3.connect(":memory:")
        con.executescript(ddl)
    except sqlite3.Error as exc:
        errors.append(f"schema.sql failed sqlite parse: {exc}")
    finally:
        try:
            con.close()
        except Exception:
            pass
    return errors


def main() -> int:
    errors = []
    errors.extend(validate_sources())
    errors.extend(validate_entities())
    errors.extend(validate_public_references())
    errors.extend(validate_entity_enrichment())
    errors.extend(validate_seed_profiles())
    errors.extend(validate_equipment_inventory())
    errors.extend(validate_capability_catalog())
    errors.extend(validate_coverage_matrix())
    errors.extend(validate_sqlite_schema())
    if errors:
        print("validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1
    print("validation passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
