# Military Disposition Public Database Starter

This folder is a first-iteration scaffold for a public-source military disposition database for simulation/world-model use. It is intentionally normalized, sparse, and safety-bounded: the goal is to make future research easy to add without mixing country identity, citations, estimates, scenario assumptions, and model parameters.

## Contents

- `schema.md`: concise schema design and safety rules.
- `schema.sql`: SQLite DDL for the normalized database.
- `data/sources.json`: public source registry.
- `data/entities.json`: generated coverage index for UN member states, UN observer states, and selected disputed/partially recognized entities.
- `data/entity_public_references.json`: generated per-entity CIA/public factbook and Wikipedia reference locators.
- `data/entity_context_enrichment.json`: generated public encyclopedia and factbook context rows with per-row sources.
- `data/model_catalog.json`: the 13 model areas, reusable variables, and abstract simulation processes.
- `data/equipment_inventory.json`: representative public system/platform/variant-level equipment rows.
- `data/equipment_inventory_wikipedia_staging.json`: generated low-confidence bulk equipment staging rows from public Wikipedia equipment list pages, when `scripts/ingest_wikipedia_equipment.py` has been run.
- `data/capability_catalog.json`: capability definitions, public software/digital-system rows, equipment/software-to-capability mappings, and safe injection action templates.
- `data/exhaustive_coverage_matrix.json`: generated entity-by-category coverage status for every tracked entity and every model/equipment/software/capability category.
- `data/ingestion_backlog.json`: source map and country/category backlog for completing global equipment coverage.
- `data/seed_profiles.json`: small representative sample for the United States, China, Russia, India, United Kingdom, France, Iran, Israel, Ukraine, and Taiwan.
- `scripts/generate_entities.py`: regenerates the entity scaffold from public metadata plus curated overlays.
- `scripts/generate_public_references.py`: regenerates per-entity CIA/public factbook and Wikipedia reference locators.
- `scripts/generate_entity_enrichment.py`: pulls sourced public factbook and Wikipedia summary context into enrichment rows.
- `scripts/ingest_wikipedia_equipment.py`: bulk-ingests reviewable low-confidence public equipment rows from Wikipedia equipment-by-country list pages.
- `scripts/generate_coverage_matrix.py`: regenerates exhaustive coverage status rows after source data changes.
- `scripts/validate.py`: basic structural checks.
- `scripts/export_database.py`: validates and exports the database to SQLite, CSV, JSON bundle, manifest, and zip artifacts.

## Source Policy

Use only public, reputable sources. Preferred source classes:

- Official intergovernmental indexes for country/status coverage, especially United Nations pages.
- CIA World Factbook final/archived public material and public-domain factbook JSON mirrors for broad country context.
- Official national defense ministry, armed forces, budget, and white-paper publications.
- Official UN and treaty reporting datasets: UNROCA, UN MilEx, ATT annual reports, UN Comtrade arms/ammunition trade codes, UN peacekeeping contributors, UN Treaty Collection, and IAEA safeguards references.
- Official regional defence datasets: NATO defence expenditure, EDA Defence Data, EEAS/EU arms export reporting, and OSCE Vienna Document transparency frameworks.
- Official procurement and register sources: national procurement releases, public naval registers, DSCA arms-sale notifications, U.S. State Department arms-sale notifications, USAspending, and SAM.gov award records.
- Official/public geospatial and logistics context sources: NGA World Port Index, NGA Geographic Names Server, World Bank Logistics Performance Index, Copernicus Global Land Cover, and NASA SRTM.
- Established research datasets and references such as SIPRI and IISS.
- Public macroeconomic datasets such as World Bank WDI for denominator variables.
- Transparent public country references such as the CIA World Factbook or archived/date-stamped equivalents.
- Wikipedia, Wikidata, DBpedia, Library of Congress Country Studies, and related public indexes only as discovery/staging inputs or historical context unless replaced by stronger cited sources.

Every assertion-bearing profile value should include:

- `source_id`
- `source_locator` or a source-specific locator/note
- `as_of_date`
- `confidence`
- `public_sensitivity`
- `estimate_type`
- uncertainty range or null/unknown when appropriate

Do not fabricate missing data. Prefer `null`, `"unknown"`, or a qualitative range with a source note.

## Safety Boundaries

Do include:

- Public country-level military and security force descriptors.
- Public system/platform/variant-level equipment rows where a reputable source supports the row.
- Public software, data-link, battle-management, logistics, training, and C4ISR program families at non-sensitive abstraction.
- Simulation-addressable capability mappings that describe broad effects, dependencies, and constraints.
- High-level force composition and institutional hierarchy.
- Public equipment categories and system-class capability summaries.
- Non-sensitive infrastructure categories and broad geography constraints.
- Abstract logistics, readiness, morale, attrition, and order-delay parameters.
- Dated source notes and confidence labels.

Do not include:

- Classified, leaked, or access-controlled operational details.
- Exact live troop locations, targeting data, exploitable vulnerabilities, or real-time operational dispositions.
- Software/network architecture, credentials, crypto details, frequencies, exploit paths, or vulnerability analysis.
- Tactical depot inventories, routes, C4I network details, medical evacuation routes, or maintenance weaknesses.
- Exact live basing, tasking, unit availability, or readiness rates not officially disclosed.
- Weapon employment instructions or target-selection guidance.

When a public source contains potentially sensitive detail, downsample to a safer abstraction or omit it.

## Coverage Policy

Minimum coverage is:

- All UN member states.
- UN non-member observer states: Holy See and State of Palestine.

This starter also includes commonly tracked disputed or partially recognized entities where public military/security data exists, including Taiwan, Kosovo, Western Sahara/SADR, Somaliland, Northern Cyprus, Abkhazia, South Ossetia, and Transnistria.

The `entity_status` and `un_membership` fields are required so simulations do not silently treat all records as equivalent sovereign UN member states.

## Update Cadence

- Entity/status scaffold: quarterly, or whenever UN/recognition status changes.
- Military expenditure and economic denominators: annually after SIPRI/World Bank releases.
- Baseline military profiles: annually for stable countries.
- Conflict-affected profiles: only as dated public snapshots; do not attempt live tracking.
- Scenario overlays: per scenario, separate from baseline country profiles.

## Extension Workflow

1. Add any new source to `data/sources.json`.
2. Add equipment inventory rows in `data/equipment_inventory.json` at the most specific public system/platform/variant level supported by sources.
3. Use `null` for unknown equipment counts. Do not use zero unless the public source means zero.
4. Add public software/digital-system rows in `data/capability_catalog.json` where they materially affect simulation behavior.
5. Link hardware, software, entity-level posture, and force elements to abstract capabilities through `asset_capability_map`.
6. Add or refresh profile values in a new dated profile snapshot.
7. Keep scenario assumptions in overlays rather than changing baseline data.
8. Use coarse public abstractions for sensitive model areas.
9. Work through `data/ingestion_backlog.json` by category and entity batch.
10. Run:

```bash
python3 scripts/generate_entities.py
python3 scripts/generate_public_references.py
python3 scripts/generate_entity_enrichment.py
python3 scripts/ingest_wikipedia_equipment.py
python3 scripts/generate_coverage_matrix.py
python3 scripts/validate.py
```

For convenience from the repository root:

```bash
npm run ingest-equipment
npm run enrich-db
npm run export-db
```

`equipment_inventory_wikipedia_staging.json` is intentionally low-confidence. It is useful for scale and discovery: thousands of candidate public rows across countries and categories. Rows should be reconciled, deduplicated, and upgraded to official, IISS, SIPRI, UNROCA, FlightGlobal, naval-register, or defense-ministry sources before being treated as high-confidence analytical inventory.

## Source Discovery

The source registry now includes a broader official-source sweep for exhaustive public coverage:

- Global official reporting: UNROCA, UN MilEx, ATT annual reports, UN Comtrade HS 93, UN peacekeeping contributor reports, UN Treaty Collection, and IAEA safeguards.
- Regional official reporting: NATO defence expenditure, EDA Defence Data, EU/EEAS COARM arms export reporting, and OSCE Vienna Document transparency frameworks.
- National official source families: defense ministry releases, naval registers, procurement releases, DSCA/State Department arms-sale notifications, USAspending, and SAM.gov.
- Public geography/logistics inputs: NGA World Port Index, NGA Geographic Names Server, World Bank LPI, Copernicus land cover, and NASA SRTM.
- Structured public encyclopedia inputs: Wikidata, DBpedia, Wikipedia indexes, and Library of Congress Country Studies.

These are represented as first-class `source_id` entries in `data/sources.json` and grouped into ingestion batches in `data/ingestion_backlog.json`. Official reporting should be preferred where it directly supports a row; encyclopedia/graph sources should mainly normalize names, aliases, variants, and source-discovery links.

## Exhaustiveness Policy

The target state is exhaustive public coverage, not just a sample. That means:

- Every tracked entity has a row for every model area, equipment category, software category, and capability category in `data/exhaustive_coverage_matrix.json`.
- Every exported row has corresponding provenance: either `source_id`, `source_ids_json`, a bridge table such as `value_source`, or source URL metadata in the source registry itself.
- Every coverage row must eventually be marked `complete_public`, `no_public_info_found`, or `not_applicable` with supporting sources/notes.
- `seeded_partial` means rows exist but are not yet complete or fully source-upgraded.
- `not_started` means the database is explicitly acknowledging a gap.
- Unknown counts remain `null`; they are not converted to zero or guessed.
- Conflict-affected inventories remain dated public snapshots and do not include live operational availability.

## Export Workflow

Generate portable artifacts with:

```bash
python3 scripts/export_database.py
```

By default this writes:

- `exports/adaptsim_military_disposition.sqlite`
- `exports/csv/*.csv`
- `exports/adaptsim_military_disposition_bundle.json`
- `exports/manifest.json`
- `exports/adaptsim_military_disposition_export.zip`

Use a custom output directory when needed:

```bash
python3 scripts/export_database.py --out-dir /tmp/adaptsim-export
```

The exporter runs `scripts/validate.py` first unless `--skip-validation` is passed. The SQLite export follows `schema.sql`; CSV and JSON exports mirror the same normalized tables for spreadsheet, BI, and simulation ingestion workflows.

## Current Gaps

- The entity index and coverage matrix are complete scaffolds, but many entity/category combinations remain `not_started` or `seeded_partial`.
- Bulk Wikipedia staging produces scale quickly but remains low-confidence until reviewed and source-upgraded.
- The capability catalog is a representative seed for the injection model; exhaustive capability mapping should be generated from vetted equipment/software inventory rows.
- Seed profiles are qualitative and representative; they validate shape rather than analytical completeness.
- No SQLite loader is included yet.
- Automated ingestion currently covers entity metadata and low-confidence Wikipedia equipment staging; official-source ingestion remains to be implemented source-by-source.
- Confidence labels are conservative and should be revisited during country-by-country research.
