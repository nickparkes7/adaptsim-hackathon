import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbDir = path.join(rootDir, "military_disposition_db", "data");
const exportManifestPath = path.join(rootDir, "military_disposition_db", "exports", "manifest.json");
const outPath = path.join(rootDir, "apps/web/public/data", "military-disposition-index.json");

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(dbDir, relativePath), "utf8"));
}

function titleCase(value) {
  const raw = String(value ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const acronyms = new Set(["AA", "APC", "C4ISR", "EW", "GBAD", "IFV", "MLRS", "MRAP", "SAM", "UAV"]);
  return raw
    .split(" ")
    .map((word) => {
      const upper = word.toUpperCase();
      return acronyms.has(upper) ? upper : `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`;
    })
    .join(" ");
}

function unique(items, limit = Number.POSITIVE_INFINITY) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const safe = String(item ?? "").trim();
    const key = safe.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(safe);
    if (output.length >= limit) break;
  }
  return output;
}

function equipmentLabel(row) {
  return [row.system_name, row.variant]
    .filter(Boolean)
    .join(" ")
    .replace(/\[\[|\]\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function summarizeEquipment(rows) {
  const byCategory = new Map();
  const confidenceCounts = {};
  const sourcePages = [];

  for (const row of rows) {
    const category = row.category || "other_public_system";
    if (!byCategory.has(category)) {
      byCategory.set(category, {
        category,
        label: titleCase(category),
        count: 0,
        examples: [],
        branches: new Set(),
        confidence: new Set()
      });
    }

    const bucket = byCategory.get(category);
    bucket.count += 1;
    const label = equipmentLabel(row);
    if (label) bucket.examples.push(label);
    if (row.service_branch) bucket.branches.add(row.service_branch);
    if (row.confidence) bucket.confidence.add(row.confidence);
    if (row.source_locator && String(row.source_locator).startsWith("http")) sourcePages.push(row.source_locator);
    const confidence = row.confidence || "unknown";
    confidenceCounts[confidence] = (confidenceCounts[confidence] || 0) + 1;
  }

  const categories = [...byCategory.values()]
    .map((bucket) => ({
      category: bucket.category,
      label: bucket.label,
      count: bucket.count,
      examples: unique(bucket.examples, 8),
      branches: [...bucket.branches].sort(),
      confidence: [...bucket.confidence].sort()
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));

  return {
    totalRows: rows.length,
    confidenceCounts,
    categories,
    topSystems: unique(rows.map(equipmentLabel), 18),
    sourcePages: unique(sourcePages, 8)
  };
}

function summarizeCoverage(rows) {
  const statusCounts = {};
  const layerCounts = {};
  const seeded = [];

  for (const row of rows) {
    statusCounts[row.status] = (statusCounts[row.status] || 0) + 1;
    layerCounts[row.layer] = (layerCounts[row.layer] || 0) + 1;
    if (row.status === "seeded_partial") {
      seeded.push({
        layer: row.layer,
        categoryId: row.category_id,
        recordCount: row.record_count,
        confidence: row.confidence
      });
    }
  }

  return {
    statusCounts,
    layerCounts,
    seededPartial: seeded.slice(0, 20)
  };
}

function sourceTitle(sourceMap, sourceId) {
  const source = sourceMap.get(sourceId);
  return source ? `${source.publisher}: ${source.title}` : sourceId;
}

const [
  entitiesPayload,
  referencesPayload,
  seedProfilesPayload,
  equipmentPayload,
  stagingPayload,
  coveragePayload,
  modelPayload,
  capabilityPayload,
  sourcesPayload
] = await Promise.all([
  readJson("entities.json"),
  readJson("entity_public_references.json"),
  readJson("seed_profiles.json"),
  readJson("equipment_inventory.json"),
  readJson("equipment_inventory_wikipedia_staging.json"),
  readJson("exhaustive_coverage_matrix.json"),
  readJson("model_catalog.json"),
  readJson("capability_catalog.json"),
  readJson("sources.json")
]);

let manifest = {};
try {
  manifest = JSON.parse(await fs.readFile(exportManifestPath, "utf8"));
} catch {
  manifest = {};
}

const sourceMap = new Map((sourcesPayload.sources ?? []).map((source) => [source.source_id, source]));
const equipmentByEntityRows = new Map();
for (const row of [...(equipmentPayload.equipment ?? []), ...(stagingPayload.equipment ?? [])]) {
  if (!row.entity_id) continue;
  if (!equipmentByEntityRows.has(row.entity_id)) equipmentByEntityRows.set(row.entity_id, []);
  equipmentByEntityRows.get(row.entity_id).push(row);
}

const referencesByEntity = {};
for (const reference of referencesPayload.references ?? []) {
  if (!referencesByEntity[reference.entity_id]) referencesByEntity[reference.entity_id] = [];
  referencesByEntity[reference.entity_id].push({
    title: sourceTitle(sourceMap, reference.source_id),
    url: reference.url,
    referenceType: reference.reference_type,
    sourceId: reference.source_id,
    confidence: reference.confidence,
    asOfDate: reference.as_of_date,
    notes: reference.notes
  });
}

const coverageRowsByEntity = new Map();
for (const row of coveragePayload.coverage ?? []) {
  if (!coverageRowsByEntity.has(row.entity_id)) coverageRowsByEntity.set(row.entity_id, []);
  coverageRowsByEntity.get(row.entity_id).push(row);
}

const seedProfilesByEntity = Object.fromEntries(
  (seedProfilesPayload.profiles ?? []).map((profile) => [
    profile.entity_id,
    {
      profileId: profile.profile_id,
      asOfDate: profile.as_of_date,
      confidence: profile.confidence,
      summary: profile.summary,
      sourceNotes: profile.source_notes,
      sourceIds: profile.sources ?? [],
      variables: profile.variables ?? {}
    }
  ])
);

const entities = (entitiesPayload.entities ?? []).map((entity) => ({
  entityId: entity.entity_id,
  name: entity.name,
  officialName: entity.official_name,
  iso3: entity.iso3,
  iso2: entity.iso2,
  entityStatus: entity.entity_status,
  unMembership: entity.un_membership,
  sovereigntyContext: entity.sovereignty_context,
  region: entity.region,
  subregion: entity.subregion,
  includedReason: entity.included_reason,
  publicMilitaryDataAvailable: Boolean(entity.public_military_data_available),
  coverageTier: entity.coverage_tier,
  profileSeeded: Boolean(entity.profile_seeded),
  asOfDate: entity.as_of_date,
  confidence: entity.confidence,
  notes: entity.notes,
  sourceIds: entity.source_ids ?? []
}));

const equipmentByEntity = {};
for (const [entityId, rows] of equipmentByEntityRows.entries()) {
  equipmentByEntity[entityId] = summarizeEquipment(rows);
}

const coverageByEntity = {};
for (const [entityId, rows] of coverageRowsByEntity.entries()) {
  coverageByEntity[entityId] = summarizeCoverage(rows);
}

const payload = {
  metadata: {
    title: "AdaptSim Military Disposition App Index",
    generatedAt: new Date().toISOString(),
    sourceGeneratedAt: manifest.generated_at || entitiesPayload.metadata?.generated_at || null,
    sourceTableCounts: manifest.table_counts ?? {},
    entityCount: entities.length,
    equipmentRows: (equipmentPayload.equipment ?? []).length + (stagingPayload.equipment ?? []).length,
    publicReferenceRows: referencesPayload.references?.length ?? 0,
    safetyNote: manifest.safety_note || seedProfilesPayload.metadata?.safety_note || modelPayload.metadata?.safety_note
  },
  entities,
  seedProfilesByEntity,
  equipmentByEntity,
  coverageByEntity,
  publicReferencesByEntity: referencesByEntity,
  modelCatalog: {
    modelAreas: modelPayload.model_areas ?? [],
    variables: modelPayload.variables ?? [],
    processes: modelPayload.processes ?? []
  },
  capabilityCatalog: {
    capabilities: capabilityPayload.capability_definitions ?? [],
    softwareInventory: capabilityPayload.software_inventory ?? [],
    actionTypes: capabilityPayload.injection_action_types ?? []
  },
  sources: sourcesPayload.sources ?? []
};

await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${path.relative(rootDir, outPath)} with ${entities.length} entities and ${payload.metadata.equipmentRows} equipment rows.`);
