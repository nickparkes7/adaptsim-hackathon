PRAGMA foreign_keys = ON;

CREATE TABLE source (
  source_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  publisher TEXT NOT NULL,
  url TEXT NOT NULL,
  source_type TEXT NOT NULL,
  recency_note TEXT,
  public_sensitivity TEXT NOT NULL CHECK (public_sensitivity IN (
    'public_low',
    'public_low_to_moderate',
    'public_moderate',
    'exclude_operational_sensitive'
  ))
);

CREATE TABLE entity (
  entity_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  official_name TEXT,
  iso3 TEXT,
  iso2 TEXT,
  entity_status TEXT NOT NULL CHECK (entity_status IN (
    'un_member_state',
    'un_observer_state',
    'partially_recognized_or_disputed',
    'other_tracked_entity'
  )),
  un_membership TEXT NOT NULL CHECK (un_membership IN (
    'member_state',
    'non_member_observer_state',
    'not_un_member'
  )),
  sovereignty_context TEXT,
  region TEXT,
  subregion TEXT,
  included_reason TEXT NOT NULL,
  public_military_data_available INTEGER NOT NULL CHECK (public_military_data_available IN (0, 1)),
  coverage_tier TEXT NOT NULL CHECK (coverage_tier IN (
    'index_only',
    'source_stub',
    'seed_profile',
    'full_profile'
  )),
  profile_seeded INTEGER NOT NULL DEFAULT 0 CHECK (profile_seeded IN (0, 1)),
  as_of_date TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  source_ids_json TEXT NOT NULL DEFAULT '[]',
  recency TEXT,
  notes TEXT
);

CREATE TABLE entity_source (
  entity_id TEXT NOT NULL REFERENCES entity(entity_id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES source(source_id),
  source_note TEXT,
  PRIMARY KEY (entity_id, source_id)
);

CREATE TABLE coverage_category (
  layer TEXT NOT NULL CHECK (layer IN (
    'model_area',
    'equipment',
    'software',
    'capability'
  )),
  category_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  required_source_tier TEXT NOT NULL,
  source_id TEXT NOT NULL DEFAULT 'PROJECT_SCHEMA' REFERENCES source(source_id),
  source_locator TEXT,
  safety_boundary TEXT NOT NULL,
  PRIMARY KEY (layer, category_id)
);

CREATE TABLE entity_public_reference (
  reference_id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entity(entity_id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES source(source_id),
  reference_type TEXT NOT NULL,
  url TEXT NOT NULL,
  source_locator TEXT,
  as_of_date TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  public_sensitivity TEXT NOT NULL DEFAULT 'public_low' CHECK (public_sensitivity IN (
    'public_low',
    'public_low_to_moderate',
    'public_moderate',
    'exclude_operational_sensitive'
  )),
  notes TEXT
);

CREATE INDEX idx_entity_public_reference_entity ON entity_public_reference(entity_id);
CREATE INDEX idx_entity_public_reference_source ON entity_public_reference(source_id);

CREATE TABLE entity_context_enrichment (
  enrichment_id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entity(entity_id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES source(source_id),
  source_locator TEXT NOT NULL,
  field_group TEXT NOT NULL,
  field_name TEXT NOT NULL,
  value_json TEXT NOT NULL,
  as_of_date TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  public_sensitivity TEXT NOT NULL DEFAULT 'public_low' CHECK (public_sensitivity IN (
    'public_low',
    'public_low_to_moderate',
    'public_moderate',
    'exclude_operational_sensitive'
  )),
  notes TEXT
);

CREATE INDEX idx_entity_context_enrichment_entity ON entity_context_enrichment(entity_id);
CREATE INDEX idx_entity_context_enrichment_source ON entity_context_enrichment(source_id);
CREATE INDEX idx_entity_context_enrichment_group ON entity_context_enrichment(field_group, field_name);

CREATE TABLE entity_category_coverage (
  coverage_id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entity(entity_id) ON DELETE CASCADE,
  layer TEXT NOT NULL,
  category_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'not_started',
    'in_progress',
    'seeded_partial',
    'partial_public',
    'complete_public',
    'no_public_info_found',
    'not_applicable',
    'conflict_sensitive_deferred'
  )),
  record_count INTEGER NOT NULL DEFAULT 0 CHECK (record_count >= 0),
  source_ids_json TEXT NOT NULL DEFAULT '[]',
  as_of_date TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  research_priority TEXT NOT NULL CHECK (research_priority IN ('low', 'medium', 'high')),
  public_sensitivity TEXT NOT NULL DEFAULT 'public_low_to_moderate' CHECK (public_sensitivity IN (
    'public_low',
    'public_low_to_moderate',
    'public_moderate',
    'exclude_operational_sensitive'
  )),
  next_step TEXT,
  notes TEXT,
  FOREIGN KEY (layer, category_id) REFERENCES coverage_category(layer, category_id)
);

CREATE INDEX idx_entity_category_coverage_entity ON entity_category_coverage(entity_id);
CREATE INDEX idx_entity_category_coverage_category ON entity_category_coverage(layer, category_id);
CREATE INDEX idx_entity_category_coverage_status ON entity_category_coverage(status);

CREATE TABLE equipment_inventory (
  equipment_id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entity(entity_id) ON DELETE CASCADE,
  service_branch TEXT,
  category TEXT NOT NULL CHECK (category IN (
    'small_arms_family',
    'crew_served_weapons',
    'tank',
    'ifv_apc_mrap',
    'artillery',
    'mlrs',
    'tactical_missile',
    'sam_gbad',
    'radar_sensor',
    'ew_system',
    'logistics_vehicle',
    'combat_aircraft',
    'transport_aircraft',
    'helicopter',
    'uav',
    'naval_combatant',
    'submarine',
    'amphibious_vessel',
    'auxiliary_vessel',
    'coast_guard_security_asset',
    'nuclear_delivery_system',
    'other_public_system'
  )),
  subcategory TEXT,
  system_name TEXT NOT NULL,
  variant TEXT,
  origin_country TEXT,
  manufacturer TEXT,
  role TEXT,
  estimated_total_count INTEGER CHECK (estimated_total_count IS NULL OR estimated_total_count >= 0),
  estimated_active_count INTEGER CHECK (estimated_active_count IS NULL OR estimated_active_count >= 0),
  estimated_storage_count INTEGER CHECK (estimated_storage_count IS NULL OR estimated_storage_count >= 0),
  estimated_ordered_count INTEGER CHECK (estimated_ordered_count IS NULL OR estimated_ordered_count >= 0),
  estimated_delivered_count INTEGER CHECK (estimated_delivered_count IS NULL OR estimated_delivered_count >= 0),
  readiness_status TEXT,
  upgrade_status TEXT,
  introduction_year INTEGER,
  retirement_year INTEGER,
  source_id TEXT NOT NULL REFERENCES source(source_id),
  source_locator TEXT,
  as_of_date TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  estimate_type TEXT NOT NULL CHECK (estimate_type IN (
    'reported',
    'estimated_range',
    'model_parameter',
    'qualitative_assessment',
    'unknown'
  )),
  uncertainty_low INTEGER CHECK (uncertainty_low IS NULL OR uncertainty_low >= 0),
  uncertainty_high INTEGER CHECK (uncertainty_high IS NULL OR uncertainty_high >= 0),
  public_sensitivity TEXT NOT NULL DEFAULT 'public_low_to_moderate' CHECK (public_sensitivity IN (
    'public_low',
    'public_low_to_moderate',
    'public_moderate',
    'exclude_operational_sensitive'
  )),
  notes TEXT,
  CHECK (uncertainty_low IS NULL OR uncertainty_high IS NULL OR uncertainty_low <= uncertainty_high),
  CHECK (retirement_year IS NULL OR introduction_year IS NULL OR retirement_year >= introduction_year)
);

CREATE INDEX idx_equipment_inventory_entity ON equipment_inventory(entity_id);
CREATE INDEX idx_equipment_inventory_category ON equipment_inventory(category, subcategory);
CREATE INDEX idx_equipment_inventory_system ON equipment_inventory(system_name, variant);

CREATE TABLE software_system_inventory (
  software_id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entity(entity_id) ON DELETE CASCADE,
  service_branch TEXT,
  category TEXT NOT NULL CHECK (category IN (
    'c2_battle_management',
    'air_defense_c2',
    'fire_control',
    'logistics_enterprise',
    'intelligence_processing',
    'cyber_defense_public',
    'cyber_operations_public',
    'electronic_warfare_control',
    'space_ground_system',
    'training_simulation',
    'data_link_network',
    'other_public_software'
  )),
  system_name TEXT NOT NULL,
  variant TEXT,
  developer TEXT,
  role TEXT,
  deployment_scope TEXT,
  integration_targets_json TEXT NOT NULL DEFAULT '[]',
  lifecycle_status TEXT,
  source_id TEXT NOT NULL REFERENCES source(source_id),
  source_locator TEXT,
  as_of_date TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  estimate_type TEXT NOT NULL CHECK (estimate_type IN (
    'reported',
    'estimated_range',
    'model_parameter',
    'qualitative_assessment',
    'unknown'
  )),
  public_sensitivity TEXT NOT NULL DEFAULT 'public_low_to_moderate' CHECK (public_sensitivity IN (
    'public_low',
    'public_low_to_moderate',
    'public_moderate',
    'exclude_operational_sensitive'
  )),
  notes TEXT
);

CREATE INDEX idx_software_inventory_entity ON software_system_inventory(entity_id);
CREATE INDEX idx_software_inventory_category ON software_system_inventory(category);
CREATE INDEX idx_software_inventory_system ON software_system_inventory(system_name, variant);

CREATE TABLE capability_catalog (
  capability_id TEXT PRIMARY KEY,
  domain TEXT NOT NULL CHECK (domain IN (
    'land',
    'air',
    'maritime',
    'space',
    'cyber',
    'c4isr',
    'logistics',
    'personnel',
    'economic_industrial',
    'political_legal',
    'nuclear',
    'multi_domain'
  )),
  capability_type TEXT NOT NULL CHECK (capability_type IN (
    'kinetic_effect',
    'mobility',
    'protection',
    'sensing',
    'command_control',
    'communications',
    'intelligence_processing',
    'deception',
    'electronic_warfare',
    'sustainment',
    'mobilization',
    'deterrence',
    'training',
    'industrial_capacity',
    'legal_constraint',
    'simulation_process'
  )),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  effect_model_json TEXT NOT NULL DEFAULT '{}',
  default_public_sensitivity TEXT NOT NULL DEFAULT 'public_low_to_moderate' CHECK (default_public_sensitivity IN (
    'public_low',
    'public_low_to_moderate',
    'public_moderate',
    'exclude_operational_sensitive'
  )),
  source_id TEXT NOT NULL DEFAULT 'PROJECT_SCHEMA' REFERENCES source(source_id),
  source_locator TEXT,
  safety_boundary TEXT NOT NULL
);

CREATE TABLE asset_capability_map (
  asset_capability_id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entity(entity_id) ON DELETE CASCADE,
  capability_id TEXT NOT NULL REFERENCES capability_catalog(capability_id),
  asset_scope TEXT NOT NULL CHECK (asset_scope IN (
    'entity_level',
    'equipment',
    'software',
    'force_element',
    'scenario_overlay'
  )),
  equipment_id TEXT REFERENCES equipment_inventory(equipment_id),
  software_id TEXT REFERENCES software_system_inventory(software_id),
  force_element_label TEXT,
  capability_level TEXT CHECK (capability_level IS NULL OR capability_level IN (
    'unknown',
    'limited',
    'basic',
    'moderate',
    'advanced',
    'strategic'
  )),
  quantity_basis TEXT,
  effect_parameters_json TEXT NOT NULL DEFAULT '{}',
  constraints_json TEXT NOT NULL DEFAULT '{}',
  source_id TEXT NOT NULL REFERENCES source(source_id),
  source_locator TEXT,
  as_of_date TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  estimate_type TEXT NOT NULL CHECK (estimate_type IN (
    'reported',
    'estimated_range',
    'model_parameter',
    'qualitative_assessment',
    'unknown'
  )),
  public_sensitivity TEXT NOT NULL DEFAULT 'public_low_to_moderate' CHECK (public_sensitivity IN (
    'public_low',
    'public_low_to_moderate',
    'public_moderate',
    'exclude_operational_sensitive'
  )),
  notes TEXT,
  CHECK (
    (asset_scope = 'equipment' AND equipment_id IS NOT NULL AND software_id IS NULL) OR
    (asset_scope = 'software' AND software_id IS NOT NULL AND equipment_id IS NULL) OR
    (asset_scope IN ('entity_level', 'force_element', 'scenario_overlay') AND equipment_id IS NULL AND software_id IS NULL)
  )
);

CREATE INDEX idx_asset_capability_entity ON asset_capability_map(entity_id);
CREATE INDEX idx_asset_capability_capability ON asset_capability_map(capability_id);
CREATE INDEX idx_asset_capability_equipment ON asset_capability_map(equipment_id);
CREATE INDEX idx_asset_capability_software ON asset_capability_map(software_id);

CREATE TABLE injection_action_type (
  action_type_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  action_level TEXT NOT NULL CHECK (action_level IN (
    'tactical',
    'operational',
    'strategic',
    'political'
  )),
  required_capability_ids_json TEXT NOT NULL DEFAULT '[]',
  preconditions_json TEXT NOT NULL DEFAULT '{}',
  outputs_json TEXT NOT NULL DEFAULT '{}',
  failure_modes_json TEXT NOT NULL DEFAULT '[]',
  source_id TEXT NOT NULL DEFAULT 'PROJECT_SCHEMA' REFERENCES source(source_id),
  source_locator TEXT,
  safety_boundary TEXT NOT NULL
);

CREATE TABLE profile_snapshot (
  profile_id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entity(entity_id) ON DELETE CASCADE,
  as_of_date TEXT NOT NULL,
  estimate_type TEXT NOT NULL CHECK (estimate_type IN (
    'reported',
    'estimated_range',
    'model_parameter',
    'qualitative_assessment',
    'unknown'
  )),
  confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  public_sensitivity TEXT NOT NULL CHECK (public_sensitivity IN (
    'public_low',
    'public_low_to_moderate',
    'public_moderate',
    'exclude_operational_sensitive'
  )),
  classification_label TEXT NOT NULL DEFAULT 'public',
  source_ids_json TEXT NOT NULL DEFAULT '[]',
  summary TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE model_area (
  model_area_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  source_id TEXT NOT NULL DEFAULT 'PROJECT_SCHEMA' REFERENCES source(source_id),
  source_locator TEXT
);

CREATE TABLE disposition_variable (
  variable_id TEXT PRIMARY KEY,
  model_area_id TEXT NOT NULL REFERENCES model_area(model_area_id),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  value_type TEXT NOT NULL CHECK (value_type IN (
    'number',
    'range',
    'ordinal',
    'boolean',
    'text',
    'json',
    'unknown'
  )),
  unit TEXT,
  allowed_sensitivity_max TEXT NOT NULL DEFAULT 'public_moderate',
  source_id TEXT NOT NULL DEFAULT 'PROJECT_SCHEMA' REFERENCES source(source_id),
  source_locator TEXT,
  safety_notes TEXT
);

CREATE TABLE profile_variable_value (
  value_id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profile_snapshot(profile_id) ON DELETE CASCADE,
  variable_id TEXT NOT NULL REFERENCES disposition_variable(variable_id),
  value_json TEXT,
  uncertainty_low REAL,
  uncertainty_high REAL,
  uncertainty_unit TEXT,
  estimate_type TEXT NOT NULL CHECK (estimate_type IN (
    'reported',
    'estimated_range',
    'model_parameter',
    'qualitative_assessment',
    'unknown'
  )),
  confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  as_of_date TEXT NOT NULL,
  public_sensitivity TEXT NOT NULL CHECK (public_sensitivity IN (
    'public_low',
    'public_low_to_moderate',
    'public_moderate',
    'exclude_operational_sensitive'
  )),
  source_note TEXT,
  UNIQUE (profile_id, variable_id)
);

CREATE TABLE value_source (
  value_id TEXT NOT NULL REFERENCES profile_variable_value(value_id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES source(source_id),
  locator TEXT,
  PRIMARY KEY (value_id, source_id)
);

CREATE TABLE simulation_process (
  process_id TEXT PRIMARY KEY,
  model_area_id TEXT NOT NULL REFERENCES model_area(model_area_id),
  name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  inputs_json TEXT NOT NULL DEFAULT '[]',
  outputs_json TEXT NOT NULL DEFAULT '[]',
  source_id TEXT NOT NULL DEFAULT 'PROJECT_SCHEMA' REFERENCES source(source_id),
  source_locator TEXT,
  safety_boundary TEXT NOT NULL
);

CREATE TABLE scenario_overlay (
  overlay_id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entity(entity_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  starts_on TEXT,
  ends_on TEXT,
  assumptions_json TEXT NOT NULL DEFAULT '{}',
  source_ids_json TEXT NOT NULL DEFAULT '[]',
  source_note TEXT,
  confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  public_sensitivity TEXT NOT NULL DEFAULT 'public_low_to_moderate'
);
