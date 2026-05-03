# Military Disposition Database Schema

This first iteration is optimized for sparse, public-source simulation inputs. It separates entity identity, source registry, profile snapshots, model variables, and scenario overlays so a country can have many dated estimates without forcing every model area to be populated.

## Core Tables

- `source`: canonical public source registry. Every assertion-bearing value should cite one or more `source_id` records.
- `entity`: coverage index for UN member states, UN observer states, and curated disputed/partially recognized entities.
- `entity_source`: sources that justify inclusion or status metadata.
- `equipment_inventory`: public system/platform/variant-level equipment rows by entity and service branch, with count estimates, uncertainty, source, date, and confidence.
- `software_system_inventory`: public software, battle-management, data-link, logistics, training, cyber-defense, and C4ISR program/system rows at safe abstraction.
- `capability_catalog`: simulation-addressable capability definitions such as armored direct fire, area air defense, joint data links, logistics visibility, and nuclear deterrence.
- `asset_capability_map`: links entity-level assets, equipment rows, software rows, or force elements to abstract simulation capabilities.
- `injection_action_type`: allowed action templates and preconditions that consume capabilities without exposing operational details.
- `profile_snapshot`: dated, source-bound assessment for one entity. Use multiple snapshots instead of overwriting historical assessments.
- `model_area`: the 13 simulation areas requested by the project.
- `disposition_variable`: reusable variable definitions, units, value types, sensitivity ceilings, and safety notes.
- `profile_variable_value`: sparse values for a profile. Values are JSON to support text, ranges, ordinal labels, and structured parameters.
- `value_source`: citations for individual variable values.
- `simulation_process`: abstract process definitions for C2 delay, readiness decay, logistics consumption, attrition, order propagation, reconstitution, and other model behavior.
- `scenario_overlay`: optional scenario-specific assumptions. Keep overlays separate from baseline public data.

## Model Areas

1. `orbat`: force hierarchy, composition, public equipment categories, non-sensitive infrastructure, reserves/mobilization.
2. `c4i`: command hierarchy, high-level decision latency, communications resilience, C2 degradation, intelligence cycle.
3. `logistics_sustainment`: supply classes, public depot/stockpile indicators, transport, maintenance, medical evacuation/treatment.
4. `personnel_morale`: manning, training, experience, morale drivers, fatigue/rest, discipline/desertion risk.
5. `geography_environment`: terrain, infrastructure, weather/seasons, climate, disease.
6. `combat_power`: sensor/weapon envelopes at system-class level, firepower/protection, attrition parameters, abstract air/naval superiority zones.
7. `doctrine_behavior`: offensive/defensive doctrine, ROE, operational art, strategic guidance.
8. `mobilization_movement`: mobilization stages, movement rates, prepositioned stocks, time-distance factors.
9. `economic_industrial`: defense industry, manpower pool, fuel/energy dependency, budget, reconstitution cost.
10. `political_legal`: casualty tolerance, LOAC/targeting restrictions, alliances, nuclear/red-line policy.
11. `intelligence_deception`: public intel estimates, fog-of-war model, deception means, SIGINT/EW at high level.
12. `injection_interface`: action types, order propagation delay, friction/miscommunication, preconditions.
13. `metrics_logging`: loss-exchange ratios, operational tempo, logistics consumption, readiness decay, reconstitution time.

## Safety Boundaries

Allowed:

- Public, dated, attributable information.
- Country-level or service-level descriptions.
- Public bases or infrastructure at non-sensitive granularity.
- System-class capabilities, broad readiness ranges, and abstract model parameters.
- Null/unknown values where sources are absent or contradictory.

Excluded:

- Classified or leaked material.
- Exact live troop locations, targeting data, exploitable vulnerabilities, or real-time operational dispositions.
- Instructions for operational targeting, evasion, sabotage, or weapon employment.
- Fine-grained C4I, depot, stockpile, medical evacuation route, or maintenance weakness details that could be operationally exploitable.

## Recommended Value Shape

Use JSON values rather than widening the schema for every force type:

```json
{
  "label": "large_active_force",
  "range": {"low": 100000, "high": 250000, "unit": "personnel"},
  "basis": "public estimates vary by source",
  "notes": "Reserve and paramilitary forces excluded unless stated."
}
```

For sensitive areas, prefer ordinal abstractions:

```json
{
  "label": "communications_resilience",
  "ordinal": "medium",
  "scale": ["low", "medium", "high"],
  "notes": "Country-level public assessment only."
}
```

## Equipment Inventory Model

`equipment_inventory` is the scalable table for granular public assets. It is intentionally separate from profile variables because an exhaustive inventory can contain thousands of rows per major military.

Required fields:

- Identity: `equipment_id`, `entity_id`, `service_branch`, `category`, `subcategory`, `system_name`, `variant`.
- Provenance: `source_id`, `source_locator`, `as_of_date`, `confidence`, `estimate_type`.
- Counts: `estimated_total_count`, `estimated_active_count`, `estimated_storage_count`, `estimated_ordered_count`, `estimated_delivered_count`.
- Uncertainty: `uncertainty_low`, `uncertainty_high`, plus source notes.
- Lifecycle/status: `readiness_status` when publicly disclosed, `upgrade_status`, `introduction_year`, `retirement_year`.
- Context: `origin_country`, `manufacturer`, `role`, `notes`, `public_sensitivity`.

Supported categories include:

- `small_arms_family`
- `crew_served_weapons`
- `tank`
- `ifv_apc_mrap`
- `artillery`
- `mlrs`
- `tactical_missile`
- `sam_gbad`
- `radar_sensor`
- `ew_system`
- `logistics_vehicle`
- `combat_aircraft`
- `transport_aircraft`
- `helicopter`
- `uav`
- `naval_combatant`
- `submarine`
- `amphibious_vessel`
- `auxiliary_vessel`
- `coast_guard_security_asset`
- `nuclear_delivery_system`
- `other_public_system`

Count policy:

- Use integers only when a public source supports the value.
- Use `null` for unknown counts. Do not use `"unknown"`, `0`, or invented estimates.
- If sources conflict, use `estimate_type = "estimated_range"` and populate `uncertainty_low` and `uncertainty_high`.
- Avoid readiness rates unless officially disclosed or described at a broad public level.

## Capability Injection Model

Treat the database as two linked layers:

1. Inventory layer: what public hardware, software, organizations, and force structures are known to exist.
2. Capability layer: what abstract simulation effects those assets can inject.

This lets an F-35A, Type 055 destroyer, S-400 system, Link 16 data-link family, logistics enterprise platform, reserve law, or nuclear policy become addressable without turning the database into a tactical employment guide.

### Software and Digital Systems

`software_system_inventory` covers public, simulation-relevant software or digital program families, including:

- `c2_battle_management`
- `air_defense_c2`
- `fire_control`
- `logistics_enterprise`
- `intelligence_processing`
- `cyber_defense_public`
- `cyber_operations_public`
- `electronic_warfare_control`
- `space_ground_system`
- `training_simulation`
- `data_link_network`
- `other_public_software`

Use program-level or public capability-family records unless a source safely supports a specific product/version. Never store network architecture, credentials, crypto details, frequencies, vulnerabilities, exploit paths, or live deployment details.

### Capabilities

`capability_catalog` defines injectable effects with safe model inputs/outputs:

```json
{
  "capability_id": "cap_area_air_defense",
  "domain": "c4isr",
  "capability_type": "protection",
  "name": "Area air and missile defense",
  "effect_model": {
    "primary_effects": ["air_denial", "missile_defense", "force_protection"],
    "typical_inputs": ["system_count", "sensor_integration_level", "training"],
    "typical_outputs": ["air_denial_index", "protected_asset_modifier"]
  }
}
```

`asset_capability_map` links a capability to:

- `equipment`: a row in `equipment_inventory`.
- `software`: a row in `software_system_inventory`.
- `entity_level`: a national-level public capability such as reserve mobilization law or nuclear deterrence policy.
- `force_element`: a public non-live organization label when appropriate.
- `scenario_overlay`: scenario-specific capability assumptions.

Use ordinal capability levels (`limited`, `basic`, `moderate`, `advanced`, `strategic`) and JSON effect parameters rather than sensitive tactical measurements. Put source/date/confidence on every mapping.

### Injection Actions

`injection_action_type` defines what a user or higher-level AI can inject into a simulation:

- Movement: relocate force, withdraw, posture.
- Combat: abstract armored attack, air sortie generation, area defense posture.
- Support: resupply, repair, reinforce, medical support.
- C2: change ROE, alter objectives, transfer abstract command responsibility.
- Strategic: mobilize reserves, cease-fire, surrender, nuclear release policy gates.

Each action stores required capabilities, preconditions, expected outputs, failure modes, and a safety boundary. Actions should reference abstract regions, force elements, and capability indices, not live positions, target packages, route plans, or weapon employment instructions.

## Update Pattern

1. Add or refresh sources in `data/sources.json`.
2. Add a new `profile_snapshot` rather than mutating a prior dated estimate.
3. Add equipment rows at the system/platform/variant level when public sources support them.
4. Add software/digital system rows at public program or system-family level where relevant.
5. Map assets to `capability_catalog` entries through `asset_capability_map`.
6. Add sparse profile values only where public sources support them.
7. Attach `source_id`, `as_of_date`, `estimate_type`, `confidence`, `public_sensitivity`, and uncertainty fields to each value.
8. Run `python3 scripts/validate.py` before publishing.
