const dataUrl = "/data/snapshot-profiles.json";
const publicSitesUrl = "/data/public-reference-sites.json";
const worldCapitalsUrl = "/data/world-capitals.json";
const trainingVariablesUrl = "/data/training-variable-taxonomy.json";
const dispositionIndexUrl = "/data/military-disposition-index.json";
const storageKey = "adaptsim-v1";
const legacyStorageKey = "geo-snapshot-workbench-v1";
const mapPrefsStorageKey = "adaptsim-map-prefs-v1";
const legacyMapPrefsStorageKey = "geo-snapshot-map-prefs-v1";
const mapTokenStorageKey = "adaptsim-map-tokens-v1";
const legacyMapTokenStorageKey = "geo-snapshot-map-tokens-v1";
const customMapProvidersStorageKey = "adaptsim-custom-map-providers-v1";
const maxSnapshots = 100;
const maxActionLogEntries = 12;
const maxAnalystNoteLength = 1200;
const arcGisGeocoderUrl = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer";
const countryBordersGeoJsonUrl = "https://cdn.jsdelivr.net/gh/johan/world.geo.json@master/countries.geo.json";
const wikipediaApiUrl = "https://en.wikipedia.org/w/api.php";
const wikipediaPageBaseUrl = "https://en.wikipedia.org/wiki/";
const wikidataSparqlUrl = "https://query.wikidata.org/sparql";
const restCountriesApiUrl = "https://restcountries.com/v3.1";
const locationSearchDebounceMs = 220;
const hoverGeocodeDebounceMs = 140;
const publicSiteQueryLimit = 30;
const publicSiteResultLimit = 12;
const publicSiteMarkerLimit = 500;
const publicSiteFetchTimeoutMs = 4500;
const countryBorderFetchTimeoutMs = 5500;
const wikidataFacilityLimit = 500;
const publicSiteZoomBands = [
  { id: "city", maxHeightMeters: 18000, radiusKm: 45, maxSites: 18, label: "city" },
  { id: "metro", maxHeightMeters: 65000, radiusKm: 130, maxSites: 36, label: "metro" },
  { id: "region", maxHeightMeters: 240000, radiusKm: 420, maxSites: 72, label: "region" },
  { id: "theater", maxHeightMeters: 900000, radiusKm: 950, maxSites: 115, label: "theater" },
  { id: "country", maxHeightMeters: Number.POSITIVE_INFINITY, radiusKm: Number.POSITIVE_INFINITY, maxSites: publicSiteMarkerLimit, label: "country" }
];
const defaultSourceNote =
  "Static public, country-level baseline. No live unit disposition, vulnerabilities, targets, tactical routing, or readiness inference.";
const allowedStatusClasses = new Set(["neutral", "ready", "caution", "restricted"]);
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const mapScaleMaxWidthPx = 150;
const searchCameraHeightMeters = 9000;
const coordinateStorageDecimals = 7;
const coordinateDisplayDecimals = 6;
const coordinatePinPrecisionMeters = 1;
const defaultGlobeView = {
  lon: 15,
  lat: 52,
  heightMeters: 22500000
};
const defaultCapitalSiteSnapshotId = "default-major-capitals";
const defaultCapitalSiteAnchor = {
  id: defaultCapitalSiteSnapshotId,
  lat: defaultGlobeView.lat,
  lon: defaultGlobeView.lon
};
const majorCapitalCitySeeds = [
  { iso3: "USA", country: "United States", name: "Washington, DC", lat: 38.9072, lon: -77.0369 },
  { iso3: "CAN", country: "Canada", name: "Ottawa", lat: 45.4215, lon: -75.6972 },
  { iso3: "MEX", country: "Mexico", name: "Mexico City", lat: 19.4326, lon: -99.1332 },
  { iso3: "BRA", country: "Brazil", name: "Brasilia", lat: -15.7939, lon: -47.8828 },
  { iso3: "ARG", country: "Argentina", name: "Buenos Aires", lat: -34.6037, lon: -58.3816 },
  { iso3: "CHL", country: "Chile", name: "Santiago", lat: -33.4489, lon: -70.6693 },
  { iso3: "COL", country: "Colombia", name: "Bogota", lat: 4.711, lon: -74.0721 },
  { iso3: "PER", country: "Peru", name: "Lima", lat: -12.0464, lon: -77.0428 },
  { iso3: "GBR", country: "United Kingdom", name: "London", lat: 51.5074, lon: -0.1278 },
  { iso3: "FRA", country: "France", name: "Paris", lat: 48.8566, lon: 2.3522 },
  { iso3: "DEU", country: "Germany", name: "Berlin", lat: 52.52, lon: 13.405 },
  { iso3: "ITA", country: "Italy", name: "Rome", lat: 41.9028, lon: 12.4964 },
  { iso3: "ESP", country: "Spain", name: "Madrid", lat: 40.4168, lon: -3.7038 },
  { iso3: "BEL", country: "Belgium", name: "Brussels", lat: 50.8503, lon: 4.3517 },
  { iso3: "NLD", country: "Netherlands", name: "Amsterdam", lat: 52.3676, lon: 4.9041 },
  { iso3: "POL", country: "Poland", name: "Warsaw", lat: 52.2297, lon: 21.0122 },
  { iso3: "UKR", country: "Ukraine", name: "Kyiv", lat: 50.4501, lon: 30.5234 },
  { iso3: "RUS", country: "Russia", name: "Moscow", lat: 55.7558, lon: 37.6173 },
  { iso3: "TUR", country: "Turkey", name: "Ankara", lat: 39.9334, lon: 32.8597 },
  { iso3: "EGY", country: "Egypt", name: "Cairo", lat: 30.0444, lon: 31.2357 },
  { iso3: "SAU", country: "Saudi Arabia", name: "Riyadh", lat: 24.7136, lon: 46.6753 },
  { iso3: "ARE", country: "United Arab Emirates", name: "Abu Dhabi", lat: 24.4539, lon: 54.3773 },
  { iso3: "IRN", country: "Iran", name: "Tehran", lat: 35.6892, lon: 51.389 },
  { iso3: "IRQ", country: "Iraq", name: "Baghdad", lat: 33.3152, lon: 44.3661 },
  { iso3: "PAK", country: "Pakistan", name: "Islamabad", lat: 33.6844, lon: 73.0479 },
  { iso3: "IND", country: "India", name: "New Delhi", lat: 28.6139, lon: 77.209 },
  { iso3: "CHN", country: "China", name: "Beijing", lat: 39.9042, lon: 116.4074 },
  { iso3: "JPN", country: "Japan", name: "Tokyo", lat: 35.6762, lon: 139.6503 },
  { iso3: "KOR", country: "South Korea", name: "Seoul", lat: 37.5665, lon: 126.978 },
  { iso3: "IDN", country: "Indonesia", name: "Jakarta", lat: -6.2088, lon: 106.8456 },
  { iso3: "THA", country: "Thailand", name: "Bangkok", lat: 13.7563, lon: 100.5018 },
  { iso3: "VNM", country: "Vietnam", name: "Hanoi", lat: 21.0278, lon: 105.8342 },
  { iso3: "PHL", country: "Philippines", name: "Manila", lat: 14.5995, lon: 120.9842 },
  { iso3: "SGP", country: "Singapore", name: "Singapore", lat: 1.3521, lon: 103.8198 },
  { iso3: "AUS", country: "Australia", name: "Canberra", lat: -35.2809, lon: 149.13 },
  { iso3: "NZL", country: "New Zealand", name: "Wellington", lat: -41.2865, lon: 174.7762 },
  { iso3: "ZAF", country: "South Africa", name: "Pretoria", lat: -25.7479, lon: 28.2293 },
  { iso3: "KEN", country: "Kenya", name: "Nairobi", lat: -1.2921, lon: 36.8219 },
  { iso3: "ETH", country: "Ethiopia", name: "Addis Ababa", lat: 8.9806, lon: 38.7578 },
  { iso3: "NGA", country: "Nigeria", name: "Abuja", lat: 9.0765, lon: 7.3986 }
];
const devAutoRefreshIntervalMs = 1500;
const devAutoRefreshTimeoutMs = 2500;
const devAutoRefreshResources = [
  "/src/App.jsx",
  "/src/lib/adaptsimWorkbench.js",
  "/src/styles.css",
  "/data/snapshot-profiles.json",
  "/data/public-reference-sites.json",
  "/data/world-capitals.json",
  "/data/military-disposition-index.json"
];

const defaultMapProvider = "arcgis";

const mapProviderCatalog = [
  { id: "arcgis", label: "ArcGIS satellite", group: "Standard", kind: "arcgis" },
  { id: "terrain", label: "Cesium World Terrain", group: "Built-in", kind: "terrain" },
  { id: "google", label: "Google photorealistic 3D tiles", group: "Built-in", kind: "google" },
  { id: "osm", label: "OpenStreetMap standard", group: "Open source", kind: "raster", url: "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png", credit: "OpenStreetMap contributors" },
  { id: "opentopo", label: "OpenTopoMap", group: "Open source", kind: "raster", url: "https://a.tile.opentopomap.org/{z}/{x}/{y}.png", credit: "OpenTopoMap contributors" },
  { id: "carto-light", label: "CARTO Positron", group: "Open source", kind: "raster", url: "https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", credit: "CARTO, OpenStreetMap contributors" },
  { id: "carto-dark", label: "CARTO Dark Matter", group: "Open source", kind: "raster", url: "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", credit: "CARTO, OpenStreetMap contributors" }
];

const publicSiteTypeStyles = {
  air_force_base: { label: "Air Force Base", color: "#f0b44d" },
  naval_base: { label: "Naval Base", color: "#4cc9f0" },
  army_base: { label: "Army Base", color: "#89fff4" },
  national_guard: { label: "National Guard Facility", color: "#7bd88f" },
  supply_depot: { label: "Supply Depot", color: "#ff8f3d" },
  national_capital: { label: "National Capital", color: "#ff5f57" },
  port: { label: "Port", color: "#2a9d8f" },
  airport: { label: "Airport", color: "#8ecae6" },
  other: { label: "Other", color: "#f5f7fa" }
};

const countryIso3ToIso2 = {
  AUS: "AU",
  AZE: "AZ",
  BRA: "BR",
  DEU: "DE",
  FRA: "FR",
  GBR: "GB",
  IND: "IN",
  IRN: "IR",
  JPN: "JP",
  POL: "PL",
  SOM: "SO",
  USA: "US",
  ZAF: "ZA"
};

const dispositionModelAreaMap = {
  orderOfBattle: "orbat",
  c4i: "c4i",
  logisticsSustainment: "logistics_sustainment",
  personnelMorale: "personnel_morale",
  geographyEnvironment: "geography_environment",
  combatPowerModeling: "combat_power",
  doctrineBehavior: "doctrine_behavior",
  mobilizationStrategicMovement: "mobilization_movement",
  economicIndustrialInterface: "economic_industrial",
  politicalLegalConstraints: "political_legal",
  intelligenceDeception: "intelligence_deception",
  injectionInterface: "injection_interface",
  metricsLogging: "metrics_logging"
};

const weaponEquipmentCategories = new Set([
  "small_arms_family",
  "crew_served_weapons",
  "artillery",
  "mlrs",
  "tactical_missile",
  "sam_gbad",
  "radar_sensor",
  "ew_system",
  "uav"
]);

const modelFieldDefinitions = [
  ["orderOfBattle", "Order of Battle", "Unit hierarchy, force composition, equipment, basing, reserves."],
  ["c4i", "C4I", "Command hierarchy, latency, communications, C2 degradation, intelligence cycle."],
  ["logisticsSustainment", "Logistics", "Supply classes, depots, transport, maintenance, medical evacuation."],
  ["personnelMorale", "Personnel", "Manning, experience, morale, fatigue, discipline risk."],
  ["geographyEnvironment", "Geography", "Terrain, infrastructure, weather, climate, disease constraints."],
  ["combatPowerModeling", "Combat Power", "Sensors, engagement envelopes, attrition abstractions, air/naval superiority."],
  ["doctrineBehavior", "Doctrine", "Offensive, defensive, ROE, operational art, strategic guidance."],
  ["mobilizationStrategicMovement", "Mobilization", "Mobilization stages, strategic movement, reinforcement timing."],
  ["economicIndustrialInterface", "Industry", "Defense production, manpower pool, fuel, budget, reconstitution."],
  ["politicalLegalConstraints", "Political/Legal", "Casualty tolerance, LOAC, alliance obligations, escalation rules."],
  ["intelligenceDeception", "Intel/Deception", "Estimates, fog of war, deception, EW, signals intelligence."],
  ["injectionInterface", "Injection Interface", "Allowed actions, delays, friction, preconditions, propagation."],
  ["metricsLogging", "Metrics", "Loss exchange, tempo, consumption, readiness decay, reconstitution."]
];

const modelDomainKeyMap = {
  order_of_battle: "orderOfBattle",
  c4i: "c4i",
  logistics_and_sustainment: "logisticsSustainment",
  personnel_and_morale: "personnelMorale",
  geographic_and_environmental_constraints: "geographyEnvironment",
  combat_power_and_engagement_modeling: "combatPowerModeling",
  doctrinal_behavior: "doctrineBehavior",
  mobilization_and_strategic_movement: "mobilizationStrategicMovement",
  economic_and_industrial_interface: "economicIndustrialInterface",
  political_and_legal_constraints: "politicalLegalConstraints",
  intelligence_and_deception: "intelligenceDeception",
  injection_interface: "injectionInterface",
  metrics_and_logging_for_calibration: "metricsLogging"
};

const modelKeyToDomainKeyMap = Object.fromEntries(
  Object.entries(modelDomainKeyMap).map(([domainKey, modelKey]) => [modelKey, domainKey])
);

const domainOpenSourceTemplates = {
  order_of_battle: ["{country} Armed Forces", "{country} Army", "{country} military organization"],
  c4i: ["{country} Ministry of Defence", "{country} military communications", "{country} intelligence agency"],
  logistics_and_sustainment: ["{country} military logistics", "{country} military bases", "Transport in {country}"],
  personnel_and_morale: ["{country} military ranks", "Conscription in {country}", "{country} armed forces personnel"],
  geographic_and_environmental_constraints: ["Geography of {country}", "Transport in {country}", "Climate of {country}"],
  combat_power_and_engagement_modeling: [
    "List of equipment of the {country} Armed Forces",
    "{country} Air Force",
    "{country} Navy"
  ],
  doctrinal_behavior: ["Military history of {country}", "{country} defense policy", "{country} military doctrine"],
  mobilization_and_strategic_movement: ["{country} military reserves", "Conscription in {country}", "Rail transport in {country}"],
  economic_and_industrial_interface: ["Defense industry of {country}", "Economy of {country}", "{country} military budget"],
  political_and_legal_constraints: ["Foreign relations of {country}", "{country} constitution armed forces", "{country} military law"],
  intelligence_and_deception: ["{country} intelligence agency", "{country} cyber security", "{country} electronic warfare"],
  injection_interface: ["Crisis management in {country}", "{country} emergency management", "Civil defense in {country}"],
  metrics_and_logging_for_calibration: ["{country} military budget", "{country} armed forces", "Military expenditure of {country}"]
};

const openSourceTopicWords = new Set([
  "armed",
  "forces",
  "force",
  "military",
  "army",
  "navy",
  "air",
  "ministry",
  "communications",
  "intelligence",
  "logistics",
  "bases",
  "ranks",
  "conscription",
  "geography",
  "transport",
  "climate",
  "equipment",
  "history",
  "policy",
  "doctrine",
  "reserves",
  "rail",
  "defense",
  "defence",
  "industry",
  "economy",
  "budget",
  "foreign",
  "relations",
  "constitution",
  "law",
  "cyber",
  "security",
  "electronic",
  "warfare",
  "crisis",
  "management",
  "emergency",
  "civil",
  "expenditure",
  "government",
  "infrastructure"
]);

const state = {
  profiles: [],
  publicSites: [],
  worldCapitalSites: [],
  publicSiteSourceNote: "",
  publicSiteMetadataCache: new Map(),
  publicSiteSearchCache: new Map(),
  countryIso2Cache: new Map(),
  countryIso2Pending: new Set(),
  dispositionIndex: {
    metadata: null,
    entities: [],
    entitiesById: new Map(),
    entitiesByIso3: new Map(),
    entitiesByIso2: new Map(),
    entitiesByName: new Map(),
    seedProfilesByEntity: {},
    equipmentByEntity: {},
    coverageByEntity: {},
    publicReferencesByEntity: {},
    modelAreasById: new Map(),
    actionTypes: [],
    capabilities: [],
    processes: []
  },
  trainingDomains: [],
  trainingCategories: [],
  trainingVariables: [],
  selectedModelSectionKey: "",
  selectedModelParameterGroups: {},
  customMapProviders: [],
  sourceNote: "",
  sourceFiles: [],
  sourceFileBlobs: new Map(),
  snapshots: [],
  selectedSnapshotId: "",
  actionLog: [],
  searchIndex: [],
  locationResults: [],
  locationSearchTimer: null,
  locationSearchSerial: 0,
  coordinateAutoTimer: null,
  pendingCoordinateSnaps: new Set(),
  resetSerial: 0,
  workflow: {
    mapConfirmed: false,
    step3SnapshotGenerated: false
  },
  intakeAgent: {
    status: "idle",
    current: "Waiting for source input.",
    startedAt: "",
    updatedAt: "",
    fileCount: 0,
    tasks: []
  },
  hoverCountryCache: new Map(),
  hoverTimer: null,
  hoverSerial: 0,
  siteHoverTimer: null,
  siteHoverSerial: 0,
  pinnedPublicSiteId: "",
  mapSnapTimer: 0,
  globe: null,
  mapConfig: {
    provider: defaultMapProvider,
    googleApiKey: "",
    cesiumIonToken: "",
    activeProvider: "loading",
    status: "Loading Cesium."
  }
};

const selectors = {
  mapContainer: "#earth-canvas",
  sourceDropzone: "#source-dropzone",
  sourceFileInput: "#source-file-input",
  clearWorkflow: "#clear-workflow",
  sourceAgentStatus: "#source-agent-status",
  sourceFileList: "#source-file-list",
  sourceFileCount: "#source-file-count",
  mapProvider: "#map-provider",
  addMapProvider: "#add-map-provider",
  customMapSource: "#custom-map-source",
  customProviderName: "#custom-provider-name",
  customProviderType: "#custom-provider-type",
  customProviderUrl: "#custom-provider-url",
  saveCustomProvider: "#save-custom-provider",
  cancelCustomProvider: "#cancel-custom-provider",
  mapSourcePill: "#map-source-pill",
  mapSourceStatus: "#map-source-status",
  confirmMapStep: "#confirm-map-step",
  centerSelected: "#center-selected",
  zoomInMap: "#zoom-in-map",
  zoomOutMap: "#zoom-out-map",
  countryHover: "#country-hover",
  publicSiteHover: "#public-site-hover",
  siteLegend: "#site-legend",
  siteLegendItems: "#site-legend-items",
  mapScale: "#map-scale",
  scaleMetric: "#scale-metric",
  scaleFeet: "#scale-feet",
  scaleBar: "#scale-bar",
  locationSearch: "#location-search",
  searchResults: "#search-results",
  latInput: "#lat-input",
  lonInput: "#lon-input",
  selectedPlace: "#selected-place",
  selectedCoordinates: "#selected-coordinates",
  resolutionStatus: "#resolution-status",
  dataBoundary: "#data-boundary",
  selectedLocationTitle: "#selected-location-title",
  summaryCountry: "#summary-country",
  summaryForces: "#summary-forces",
  summaryHardware: "#summary-hardware",
  summarySnapshots: "#summary-snapshots",
  snapshotTitle: "#snapshot-title",
  snapshotDetail: "#snapshot-detail",
  snapshotTable: "#snapshot-table",
  modelFields: "#model-fields",
  analystNote: "#analyst-note",
  reasoningOutput: "#reasoning-output",
  actionType: "#action-type",
  actionObjective: "#action-objective",
  actionLog: "#action-log"
};

function $(selector) {
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`Missing required UI element: ${selector}`);
  }
  return element;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function titleCase(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function toText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function clampText(value, maxLength, fallback = "") {
  const text = toText(value, fallback);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}\u2026`;
}

function toTextList(value, fallback = []) {
  const list = Array.isArray(value) ? value : fallback;
  return list.map((item) => clampText(item, 320)).filter(Boolean);
}

function normalizeSourceEntry(source) {
  if (typeof source === "string") {
    return {
      title: clampText(source, 140),
      url: "",
      summary: "",
      domainKey: "",
      domainLabel: "",
      query: ""
    };
  }

  return {
    title: clampText(source?.title, 140, "Open-source reference"),
    url: clampText(source?.url, 360, ""),
    summary: clampText(source?.summary, 360, ""),
    domainKey: clampText(source?.domainKey, 100, ""),
    domainLabel: clampText(source?.domainLabel, 140, ""),
    query: clampText(source?.query, 220, "")
  };
}

function toSourceList(value) {
  const list = Array.isArray(value) ? value : [];
  return list.map(normalizeSourceEntry).filter((entry) => entry.title || entry.url).slice(0, 80);
}

function cleanDispositionText(value, fallback = "") {
  return clampText(
    String(value ?? fallback)
      .replace(/\[\[|\]\]/g, "")
      .replace(/\s+/g, " ")
      .trim(),
    360,
    fallback
  );
}

function dispositionLookupKey(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeDispositionIndex(payload = {}) {
  const entities = Array.isArray(payload.entities) ? payload.entities : [];
  const modelAreas = Array.isArray(payload.modelCatalog?.modelAreas) ? payload.modelCatalog.modelAreas : [];
  const actionTypes = Array.isArray(payload.capabilityCatalog?.actionTypes) ? payload.capabilityCatalog.actionTypes : [];
  const capabilities = Array.isArray(payload.capabilityCatalog?.capabilities) ? payload.capabilityCatalog.capabilities : [];
  const processes = Array.isArray(payload.modelCatalog?.processes) ? payload.modelCatalog.processes : [];
  const index = {
    metadata: payload.metadata ?? null,
    entities,
    entitiesById: new Map(),
    entitiesByIso3: new Map(),
    entitiesByIso2: new Map(),
    entitiesByName: new Map(),
    seedProfilesByEntity: payload.seedProfilesByEntity ?? {},
    equipmentByEntity: payload.equipmentByEntity ?? {},
    coverageByEntity: payload.coverageByEntity ?? {},
    publicReferencesByEntity: payload.publicReferencesByEntity ?? {},
    modelAreasById: new Map(modelAreas.map((area) => [area.model_area_id, area])),
    actionTypes,
    capabilities,
    processes
  };

  entities.forEach((entity) => {
    if (entity.entityId) index.entitiesById.set(normalize(entity.entityId), entity);
    if (entity.iso3) index.entitiesByIso3.set(normalize(entity.iso3), entity);
    if (entity.iso2) index.entitiesByIso2.set(normalize(entity.iso2), entity);
    [entity.name, entity.officialName, entity.entityId, entity.iso3, entity.iso2]
      .filter(Boolean)
      .forEach((term) => index.entitiesByName.set(dispositionLookupKey(term), entity));
  });

  return index;
}

function findDispositionEntity(countryName = "", countryCode = "") {
  const index = state.dispositionIndex;
  if (!index?.entities?.length) return null;
  const rawCode = clampText(countryCode, 12, "").toUpperCase();
  const normalizedCode = normalize(rawCode);
  const normalizedName = dispositionLookupKey(countryName);

  if (normalizedCode) {
    const codeMatch = index.entitiesById.get(normalizedCode)
      ?? index.entitiesByIso3.get(normalizedCode)
      ?? index.entitiesByIso2.get(normalizedCode)
      ?? index.entitiesByIso2.get(normalize(countryIso3ToIso2[rawCode]))
      ?? null;
    if (codeMatch) return codeMatch;
  }

  return index.entitiesByName.get(normalizedName) ?? null;
}

function getDispositionEntityForSnapshot(snapshot) {
  if (!snapshot) return null;
  return findDispositionEntity(snapshot.country, snapshot.iso3);
}

function formatDispositionList(items, limit = 5) {
  return toTextList(items)
    .map((item) => cleanDispositionText(item, ""))
    .filter(Boolean)
    .slice(0, limit)
    .join(", ");
}

function formatCoverageSummary(coverage) {
  const statusCounts = coverage?.statusCounts ?? {};
  const seeded = Number(statusCounts.seeded_partial ?? 0);
  const notStarted = Number(statusCounts.not_started ?? 0);
  if (!seeded && !notStarted) return "Coverage matrix present; no populated category counts yet.";
  return `${seeded} seeded partial categories; ${notStarted} acknowledged research gaps.`;
}

function getDispositionReferences(entityId, limit = 8) {
  return toSourceList((state.dispositionIndex.publicReferencesByEntity?.[entityId] ?? []).map((reference) => ({
    title: `Disposition DB: ${reference.title}`,
    url: reference.url,
    summary: [reference.referenceType, reference.confidence, reference.notes].filter(Boolean).join(" / "),
    domainKey: reference.referenceType?.includes("equipment")
      ? "combat_power_and_engagement_modeling"
      : "order_of_battle",
    domainLabel: reference.referenceType?.includes("equipment") ? "Combat Power" : "Order of Battle",
    query: reference.sourceId
  }))).slice(0, limit);
}

function getDispositionEquipmentSources(equipment, limit = 5) {
  return toSourceList((equipment?.sourcePages ?? []).map((url) => ({
    title: "Disposition DB: public equipment staging source",
    url,
    summary: "Low-confidence public equipment discovery source; review against official/IISS/SIPRI/UNROCA sources before analytical use.",
    domainKey: "combat_power_and_engagement_modeling",
    domainLabel: "Combat Power",
    query: "WIKIPEDIA_LOW_CONF"
  }))).slice(0, limit);
}

function buildDispositionSourcesForEntity(entity) {
  if (!entity) return [];
  const equipment = state.dispositionIndex.equipmentByEntity?.[entity.entityId];
  return dedupeSources([
    ...getDispositionReferences(entity.entityId, 8),
    ...getDispositionEquipmentSources(equipment, 5)
  ]).slice(0, 12);
}

function buildDispositionModel(entity, seedProfile, equipment, coverage) {
  const coverageText = formatCoverageSummary(coverage);
  const equipmentText = equipment?.totalRows
    ? `${equipment.totalRows} public equipment candidate rows across ${equipment.categories.length} categories.`
    : "No reviewed equipment rows are attached yet.";

  return normalizeModel(Object.fromEntries(modelFieldDefinitions.map(([modelKey, label, fallback]) => {
    const areaId = dispositionModelAreaMap[modelKey];
    const area = state.dispositionIndex.modelAreasById.get(areaId);
    const seedNote = seedProfile?.variables?.[areaId] ? ` Seed variable: ${cleanDispositionText(seedProfile.variables[areaId].label || seedProfile.variables[areaId].ordinal || "")}.` : "";
    return [
      modelKey,
      `Disposition DB ${area?.name || label}: ${area?.description || fallback} ${coverageText} ${equipmentText}${seedNote} Public, non-operational abstraction only.`
    ];
  })));
}

function createDispositionProfile(location) {
  const entity = findDispositionEntity(location?.countryName, location?.countryCode);
  if (!entity) return null;
  const seedProfile = state.dispositionIndex.seedProfilesByEntity?.[entity.entityId];
  const equipment = state.dispositionIndex.equipmentByEntity?.[entity.entityId];
  const coverage = state.dispositionIndex.coverageByEntity?.[entity.entityId];
  const region = [entity.region, entity.subregion].filter(Boolean).join(" / ") || clampText(location?.region, 90, inferRegion(location.lat, location.lon));
  const entityCode = entity.iso3 || (/^[A-Z0-9]{2,6}$/.test(entity.entityId) ? entity.entityId : "UNK");
  const categorySummary = equipment?.categories?.length
    ? equipment.categories.slice(0, 8).map((category) => `${category.label} (${category.count})`).join(", ")
    : "";
  const weaponCategories = equipment?.categories?.filter((category) => weaponEquipmentCategories.has(category.category)) ?? [];
  const weaponExamples = formatDispositionList(weaponCategories.flatMap((category) => category.examples), 12);
  const hardwareExamples = formatDispositionList(equipment?.topSystems, 12);
  const forceComponents = seedProfile?.variables?.force_structure_summary?.components;
  const forceLabel = cleanDispositionText(seedProfile?.variables?.force_structure_summary?.label || seedProfile?.summary || "");

  return {
    id: `disposition-${entity.entityId}`,
    country: entity.name,
    iso3: entityCode,
    region,
    center: { lat: location.lat, lon: location.lon },
    bbox: null,
    locations: [],
    dispositionEntityId: entity.entityId,
    militaryForces: [
      seedProfile?.summary || `${entity.name} is indexed in the public military disposition database as ${entity.entityStatus || "an entity"} with ${entity.coverageTier || "index"} coverage.`,
      forceLabel ? `Force structure seed: ${forceLabel}.` : `Public military data availability: ${entity.publicMilitaryDataAvailable ? "indexed" : "not yet indexed"}.`
    ],
    forceDisposition: [
      `${entity.name} baseline is country/entity-level only: ${entity.unMembership || "status unknown"}; ${entity.sovereigntyContext || entity.includedReason || "public coverage index entry"}.`,
      `${formatCoverageSummary(coverage)} No live unit disposition, readiness, routes, targets, or vulnerabilities are inferred.`
    ],
    hardware: equipment?.totalRows
      ? [
          `Disposition DB equipment index: ${equipment.totalRows} public candidate rows; ${categorySummary}.`,
          hardwareExamples ? `Representative public system names: ${hardwareExamples}.` : "System names require source review."
        ]
      : ["No reviewed equipment inventory rows are attached yet; use public references and mark unknown counts as null."],
    personnelFormations: [
      Array.isArray(forceComponents) && forceComponents.length
        ? `Seed force components: ${forceComponents.map(titleCase).join(", ")}.`
        : "Personnel and formation details require source-upgraded profile values; do not infer live structure.",
      seedProfile?.variables?.reserve_mobilization_summary?.label
        ? `Reserve/mobilization seed: ${cleanDispositionText(seedProfile.variables.reserve_mobilization_summary.label)}.`
        : "Reserve and mobilization fields remain abstract unless publicly sourced."
    ],
    weaponsSystems: weaponCategories.length
      ? [
          `Weapons/system categories represented in public staging: ${weaponCategories.map((category) => `${category.label} (${category.count})`).join(", ")}.`,
          weaponExamples ? `Representative public system names: ${weaponExamples}.` : "Specific systems require source review."
        ]
      : ["Weapons-system coverage is not yet source-upgraded for this entity."],
    model: buildDispositionModel(entity, seedProfile, equipment, coverage)
  };
}

function enrichProfileWithDisposition(profile) {
  const entity = findDispositionEntity(profile.country, profile.iso3);
  if (!entity) return profile;
  const dispositionProfile = createDispositionProfile({
    countryName: entity.name,
    countryCode: entity.iso3 || entity.iso2 || entity.entityId,
    region: profile.region,
    lat: profile.center.lat,
    lon: profile.center.lon
  });
  if (!dispositionProfile) return profile;

  return {
    ...profile,
    dispositionEntityId: entity.entityId,
    forceDisposition: [...profile.forceDisposition, ...dispositionProfile.forceDisposition].slice(0, 8),
    hardware: [...profile.hardware, ...dispositionProfile.hardware].slice(0, 10),
    personnelFormations: [...profile.personnelFormations, ...dispositionProfile.personnelFormations].slice(0, 10),
    weaponsSystems: [...profile.weaponsSystems, ...dispositionProfile.weaponsSystems].slice(0, 10),
    model: normalizeModel({ ...dispositionProfile.model, ...profile.model })
  };
}

function buildDispositionSnapshotContext(profile) {
  const entity = findDispositionEntity(profile?.country, profile?.iso3);
  if (!entity) {
    return {
      sources: [],
      queries: [],
      status: "Open-source enrichment queued.",
      sourceNote: state.sourceNote || defaultSourceNote
    };
  }
  const equipment = state.dispositionIndex.equipmentByEntity?.[entity.entityId];
  const sources = buildDispositionSourcesForEntity(entity);
  const queries = [
    `${entity.name} armed forces`,
    `${entity.name} military equipment`,
    `${entity.name} public defense profile`
  ];
  const status = equipment?.totalRows
    ? `Disposition DB attached: ${entity.name}; ${equipment.totalRows} public equipment candidates.`
    : `Disposition DB attached: ${entity.name}; public references indexed.`;

  return {
    sources,
    queries,
    status,
    sourceNote: `${state.dispositionIndex.metadata?.safetyNote || defaultSourceNote} Country/entity-level public baseline only.`
  };
}

function toFiniteNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isValidLatLon(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function normalizeCoordinate(value) {
  const number = toFiniteNumber(value);
  return Number.isFinite(number) ? Number(number.toFixed(coordinateStorageDecimals)) : number;
}

function formatCoordinate(value) {
  const number = toFiniteNumber(value);
  return Number.isFinite(number) ? number.toFixed(coordinateDisplayDecimals) : "";
}

function coordinateDistanceMeters(leftLat, leftLon, rightLat, rightLon) {
  if (![leftLat, leftLon, rightLat, rightLon].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  return haversineKm(leftLat, leftLon, rightLat, rightLon) * 1000;
}

function sanitizeStatusClass(value, fallback = "neutral") {
  const statusClass = String(value ?? "").trim();
  return allowedStatusClasses.has(statusClass) ? statusClass : fallback;
}

function confidenceStatusClass(confidence) {
  const normalizedConfidence = normalize(confidence);
  if (normalizedConfidence === "high") return "ready";
  if (normalizedConfidence === "medium") return "caution";
  if (normalizedConfidence === "low") return "restricted";
  return "neutral";
}

function normalizeModel(model = {}) {
  return Object.fromEntries(
    modelFieldDefinitions.map(([key, , description]) => [key, clampText(model?.[key], 520, description)])
  );
}

function normalizeTrainingDomain(domain) {
  const key = clampText(domain?.key, 120, "");
  const label = clampText(domain?.label, 140, "");
  if (!key || !label) return null;
  return {
    key,
    label,
    role: clampText(domain?.role, 120, "model_section"),
    primaryUse: clampText(domain?.primaryUse, 260, ""),
    exampleParameterGroups: clampText(domain?.exampleParameterGroups, 360, "")
  };
}

function normalizeTrainingVariable(variable) {
  return {
    id: clampText(variable?.id, 80, ""),
    category: clampText(variable?.category, 120, ""),
    subcategory: clampText(variable?.subcategory, 120, ""),
    training_variable_inject: clampText(variable?.training_variable_inject, 260, ""),
    decision_focus: clampText(variable?.decision_focus, 180, ""),
    controller_action: clampText(variable?.controller_action, 320, ""),
    source_basis: clampText(variable?.source_basis, 120, ""),
    world_model_domain: clampText(variable?.world_model_domain, 160, ""),
    world_model_role: clampText(variable?.world_model_role, 120, ""),
    parameter_group: clampText(variable?.parameter_group, 120, ""),
    parameter_detail: clampText(variable?.parameter_detail, 220, "")
  };
}

function fallbackTrainingDomains() {
  return modelFieldDefinitions.map(([modelKey, label, description]) => ({
    key: modelKeyToDomainKeyMap[modelKey] ?? modelKey,
    label,
    role: "csv_field",
    primaryUse: description,
    exampleParameterGroups: description
  }));
}

function getModelDomains() {
  return state.trainingDomains.length ? state.trainingDomains : fallbackTrainingDomains();
}

function getModelKeyForDomain(domain) {
  if (!domain) return "";
  if (modelDomainKeyMap[domain.key]) return modelDomainKeyMap[domain.key];
  const normalizedLabel = normalize(domain.label);
  const match = modelFieldDefinitions.find(([, label]) => normalize(label) === normalizedLabel);
  return match?.[0] ?? "";
}

function getVariablesForDomain(domain) {
  if (!domain) return [];
  const domainLabel = normalize(domain.label);
  const domainKey = normalize(domain.key).replaceAll("_", " ");
  return state.trainingVariables.filter((variable) => {
    const variableDomain = normalize(variable.world_model_domain);
    return variableDomain === domainLabel || variableDomain === domainKey;
  });
}

function uniqueItems(items, limit = 8) {
  const seen = new Set();
  return items
    .map((item) => clampText(item, 120, ""))
    .filter((item) => {
      const key = normalize(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function getParameterGroupsForDomain(domain, variables = getVariablesForDomain(domain)) {
  const domainGroups = String(domain?.exampleParameterGroups ?? "")
    .split(",")
    .map((group) => group.trim());
  const variableGroups = variables.map((variable) => variable.parameter_group);
  return uniqueItems([...domainGroups, ...variableGroups], 10);
}

function normalizeParameterGroup(value) {
  return normalize(value).replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function formatParameterGroupLabel(value) {
  const raw = String(value ?? "").trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (!raw) return "Parameter Group";
  const preserve = new Set(["AA", "AAR", "C2", "C4I", "CBRN", "COA", "EW", "LOAC", "MDMP", "PIR", "ROE", "SAM", "UAS"]);
  return raw
    .split(" ")
    .map((word) => {
      const upper = word.toUpperCase();
      if (preserve.has(upper) || /\d/.test(word)) return upper;
      return `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`;
    })
    .join(" ");
}

function getVariablesForParameterGroup(variables, group) {
  const groupKey = normalizeParameterGroup(group);
  if (!groupKey) return [];
  return variables.filter((variable) =>
    [variable.parameter_group, variable.subcategory].some((value) => normalizeParameterGroup(value) === groupKey)
  );
}

function getSelectedParameterGroupForDomain(domain, section) {
  const groups = section?.parameterGroups ?? [];
  if (!groups.length) return "";
  const savedGroup = state.selectedModelParameterGroups?.[domain.key];
  const selectedGroup = groups.find((group) => normalizeParameterGroup(group) === normalizeParameterGroup(savedGroup));
  if (selectedGroup) return selectedGroup;
  const firstMappedGroup = groups.find((group) => getVariablesForParameterGroup(section.variables, group).length);
  return firstMappedGroup || groups[0];
}

function getSourcesForDomain(snapshot, domain) {
  const domainKey = normalize(domain?.key);
  return toSourceList(snapshot?.openSourceSources).filter((source) => normalize(source.domainKey) === domainKey);
}

function buildModelSectionSummary(snapshot, domain) {
  const modelKey = getModelKeyForDomain(domain);
  const variables = getVariablesForDomain(domain);
  const sources = getSourcesForDomain(snapshot, domain);
  const parameterGroups = getParameterGroupsForDomain(domain, variables);
  const fallback = domain?.primaryUse || modelFieldDefinitions.find(([key]) => key === modelKey)?.[2] || "Awaiting model generation.";
  const summary = snapshot?.model?.[modelKey] || (snapshot ? fallback : `Select a location to generate ${domain?.label ?? "this section"}.`);

  return {
    modelKey,
    variables,
    sources,
    parameterGroups,
    summary
  };
}

function sourceTitlesForText(sources, limit = 4) {
  return sources
    .map((source) => source.title)
    .filter(Boolean)
    .slice(0, limit)
    .join(", ");
}

function buildGeneratedModelText(snapshot, domain, sources) {
  const variables = getVariablesForDomain(domain);
  const parameterGroups = getParameterGroupsForDomain(domain, variables).slice(0, 6);
  const sourceTitles = sourceTitlesForText(sources, 4);
  const variableExamples = variables
    .map((variable) => variable.training_variable_inject)
    .filter(Boolean)
    .slice(0, 3)
    .join("; ");
  const sourcePhrase = sources.length
    ? `OSINT candidates include ${sourceTitles}.`
    : "No direct Wikipedia candidates returned for this section yet; retain baseline and analyst review.";
  const groupPhrase = parameterGroups.length
    ? `Extractable groups: ${parameterGroups.join(", ")}.`
    : "Extractable groups need analyst confirmation.";
  const injectPhrase = variableExamples ? `Training-variable coverage: ${variableExamples}.` : "";

  return clampText(
    `Generated ${domain.label} brief for ${snapshot.selectedLocation}: ${domain.primaryUse || "section-level model coverage"}. ${sourcePhrase} ${groupPhrase} ${injectPhrase}`,
    520,
    domain.primaryUse
  );
}

function normalizeLocation(location) {
  const lat = toFiniteNumber(location?.lat);
  const lon = toFiniteNumber(location?.lon);
  if (!isValidLatLon(lat, lon)) return null;
  return {
    label: clampText(location?.label, 90, formatCoordinates(lat, lon)),
    lat: normalizeCoordinate(lat),
    lon: normalizeCoordinate(normalizeLongitude(lon))
  };
}

function normalizeBbox(bbox) {
  if (!bbox) return null;
  const minLat = toFiniteNumber(bbox.minLat);
  const maxLat = toFiniteNumber(bbox.maxLat);
  const minLon = toFiniteNumber(bbox.minLon);
  const maxLon = toFiniteNumber(bbox.maxLon);
  if (![minLat, maxLat, minLon, maxLon].every(Number.isFinite)) return null;
  return {
    minLat: Math.max(-90, Math.min(minLat, maxLat)),
    maxLat: Math.min(90, Math.max(minLat, maxLat)),
    minLon: Math.max(-180, Math.min(minLon, maxLon)),
    maxLon: Math.min(180, Math.max(minLon, maxLon))
  };
}

function normalizeExtent(extent) {
  if (!extent) return null;
  const west = toFiniteNumber(extent.west ?? extent.xmin ?? extent.minLon);
  const east = toFiniteNumber(extent.east ?? extent.xmax ?? extent.maxLon);
  const south = toFiniteNumber(extent.south ?? extent.ymin ?? extent.minLat);
  const north = toFiniteNumber(extent.north ?? extent.ymax ?? extent.maxLat);
  if (![west, east, south, north].every(Number.isFinite)) return null;

  const normalized = {
    west: normalizeLongitude(west),
    east: normalizeLongitude(east),
    south: Math.max(-90, Math.min(south, north)),
    north: Math.min(90, Math.max(south, north))
  };

  if (normalized.north <= normalized.south || normalized.east === normalized.west) return null;
  return normalized;
}

function bboxToExtent(bbox) {
  return normalizeExtent(bbox);
}

function pointToExtent(lat, lon, radiusDegrees = 0.08) {
  return normalizeExtent({
    west: normalizeLongitude(lon - radiusDegrees),
    east: normalizeLongitude(lon + radiusDegrees),
    south: Math.max(-90, lat - radiusDegrees),
    north: Math.min(90, lat + radiusDegrees)
  });
}

function normalizeProfile(profile) {
  const center = normalizeLocation({ label: profile?.country, ...profile?.center });
  if (!center) return null;

  return {
    id: clampText(profile?.id, 80, normalize(profile?.country) || "profile"),
    country: clampText(profile?.country, 90, "Unknown country"),
    iso3: clampText(profile?.iso3, 6, "UNK").toUpperCase(),
    region: clampText(profile?.region, 90, "Unspecified region"),
    aliases: toTextList(profile?.aliases).slice(0, 12),
    center: { lat: center.lat, lon: center.lon },
    bbox: normalizeBbox(profile?.bbox),
    locations: (Array.isArray(profile?.locations) ? profile.locations : []).map(normalizeLocation).filter(Boolean),
    militaryForces: toTextList(profile?.militaryForces, ["Profile unavailable"]),
    forceDisposition: toTextList(profile?.forceDisposition, ["Country-level posture only."]),
    hardware: toTextList(profile?.hardware, ["Profile unavailable"]),
    personnelFormations: toTextList(profile?.personnelFormations, ["Profile unavailable"]),
    weaponsSystems: toTextList(profile?.weaponsSystems, ["Profile unavailable"]),
    model: normalizeModel(profile?.model)
  };
}

function normalizeSnapshot(snapshot) {
  const lat = toFiniteNumber(snapshot?.lat);
  const lon = toFiniteNumber(snapshot?.lon);
  if (!isValidLatLon(lat, lon)) return null;

  const timestamp = new Date(snapshot?.timestamp);
  return {
    id: clampText(snapshot?.id, 120, `snapshot-${Date.now()}`),
    timestamp: Number.isNaN(timestamp.getTime()) ? new Date().toISOString() : timestamp.toISOString(),
    selectedLocation: clampText(snapshot?.selectedLocation, 100, formatCoordinates(lat, lon)),
    placeKind: clampText(snapshot?.placeKind, 60, "Location"),
    adminArea: clampText(snapshot?.adminArea, 120, ""),
    lat: normalizeCoordinate(lat),
    lon: normalizeCoordinate(normalizeLongitude(lon)),
    locationExtent: normalizeExtent(snapshot?.locationExtent),
    countryExtent: normalizeExtent(snapshot?.countryExtent),
    source: clampText(snapshot?.source, 80, "saved state"),
    confidence: clampText(snapshot?.confidence, 40, "Low"),
    resolutionStatus: clampText(snapshot?.resolutionStatus, 160, "Loaded from saved state"),
    statusClass: sanitizeStatusClass(snapshot?.statusClass, "neutral"),
    country: clampText(snapshot?.country, 90, "Unresolved country"),
    iso3: clampText(snapshot?.iso3, 6, "UNK").toUpperCase(),
    region: clampText(snapshot?.region, 90, "Unspecified region"),
    militaryForces: toTextList(snapshot?.militaryForces, ["Profile unavailable"]),
    forceDisposition: toTextList(snapshot?.forceDisposition, ["Country-level posture only."]),
    hardware: toTextList(snapshot?.hardware, ["Profile unavailable"]),
    personnelFormations: toTextList(snapshot?.personnelFormations, ["Profile unavailable"]),
    weaponsSystems: toTextList(snapshot?.weaponsSystems, ["Profile unavailable"]),
    model: normalizeModel(snapshot?.model),
    sourceNote: clampText(snapshot?.sourceNote, 360, defaultSourceNote),
    openSourceStatus: clampText(snapshot?.openSourceStatus, 220, "Open-source enrichment queued."),
    openSourceQueries: toTextList(snapshot?.openSourceQueries).slice(0, 80),
    openSourceSources: toSourceList(snapshot?.openSourceSources),
    humanInputs: toTextList(snapshot?.humanInputs).slice(0, 10),
    reasonedAdjustments: toTextList(snapshot?.reasonedAdjustments).slice(0, 10)
  };
}

function normalizeActionEntry(entry) {
  const timestamp = new Date(entry?.at);
  return {
    id: clampText(entry?.id, 120, `action-${Date.now()}`),
    at: Number.isNaN(timestamp.getTime()) ? new Date().toISOString() : timestamp.toISOString(),
    country: clampText(entry?.country, 90, "No selected country"),
    location: clampText(entry?.location, 100, "No selected location"),
    action: clampText(entry?.action, 90, "Action"),
    status: clampText(entry?.status, 80, "Queued"),
    statusClass: sanitizeStatusClass(entry?.statusClass, "neutral"),
    objective: clampText(entry?.objective, 180, "No objective entered"),
    summary: clampText(entry?.summary, 280, "Logged for scenario review."),
    preconditions: toTextList(entry?.preconditions, ["Human review"]).slice(0, 8)
  };
}

function normalizePublicSite(site) {
  const lat = toFiniteNumber(site?.lat);
  const lon = toFiniteNumber(site?.lon);
  if (!isValidLatLon(lat, lon)) return null;
  const type = normalizePublicSiteType(site?.type);
  const pageTitle = clampText(site?.pageTitle, 180, site?.name || "Military site");
  const url = clampText(site?.url, 600, wikipediaPageUrl(pageTitle));
  const geoJsonIds = toTextList(site?.geoJsonIds)
    .map((id) => clampText(id, 20, "").toUpperCase())
    .filter(Boolean);
  const countryNames = toTextList(site?.countryNames)
    .map((name) => clampText(name, 120, ""))
    .filter(Boolean);
  return {
    id: clampText(site?.id, 120, `site-${pageTitle}`),
    countryIso3: clampText(site?.countryIso3, 6, "").toUpperCase(),
    name: clampText(site?.name, 140, pageTitle),
    type,
    lat: normalizeCoordinate(lat),
    lon: normalizeCoordinate(normalizeLongitude(lon)),
    pageTitle,
    url,
    summary: clampText(site?.summary, 360, ""),
    thumbnail: clampText(site?.thumbnail, 600, ""),
    source: clampText(site?.source, 80, "Static public reference"),
    query: clampText(site?.query, 180, ""),
    geoJsonIds,
    countryNames,
    dynamic: Boolean(site?.dynamic)
  };
}

function worldCapitalToPublicSite(entry) {
  const iso3 = clampText(entry?.iso3, 24, "").toUpperCase();
  const country = clampText(entry?.country, 120, "");
  const officialName = clampText(entry?.officialName, 160, "");
  const capital = clampText(entry?.capital, 120, "");
  const lat = toFiniteNumber(entry?.lat);
  const lon = toFiniteNumber(entry?.lon);
  if (!country || !capital || !isValidLatLon(lat, lon)) return null;

  return normalizePublicSite({
    id: `capital-${normalize(iso3 || country).replace(/[^a-z0-9]+/g, "-")}`,
    countryIso3: iso3,
    name: `${capital}, ${country}`,
    type: "national_capital",
    lat,
    lon,
    pageTitle: capital,
    summary: `${capital} is the national capital matched to ${country}.`,
    source: "World capital catalog",
    geoJsonIds: [iso3, ...toTextList(entry?.geoJsonIds)].filter((id) => id && id !== "UNK"),
    countryNames: [country, officialName, ...toTextList(entry?.countryNames)].filter(Boolean)
  });
}

function normalizePublicSiteType(type) {
  const normalized = normalize(type);
  const legacyMap = {
    air: "air_force_base",
    airbase: "air_force_base",
    air_base: "air_force_base",
    naval: "naval_base",
    navy: "naval_base",
    base: "army_base",
    headquarters: "army_base",
    training: "army_base",
    academy: "army_base",
    logistics: "supply_depot",
    depot: "supply_depot",
    capital: "national_capital",
    history: "other"
  };
  if (publicSiteTypeStyles[normalized]) return normalized;
  return legacyMap[normalized] ?? "other";
}

function publicSiteReferenceLabel(site) {
  if (site?.type === "national_capital") return "Country profile";
  if (normalize(site?.source).includes("wikidata")) return "Wikidata reference";
  return "Wikipedia reference";
}

function classifyPublicSiteType(title, summary = "") {
  const text = normalize(`${title} ${summary}`);
  if (/\b(national guard|air national guard|army national guard|guard base|guard station|reserve center|reserve centre|armory|armoury)\b/.test(text)) return "national_guard";
  if (/\b(depot|arsenal|logistics?|ordnance|materiel|supply|maintenance|warehouse|storage facility|ammunition dump)\b/.test(text)) return "supply_depot";
  if (/\b(naval|navy|fleet|marine base|naval station|naval base|submarine base|dockyard)\b/.test(text)) return "naval_base";
  if (/\b(airbase|air base|air force base|air force station|air station|military airfield|military aerodrome|raf |air wing)\b/.test(text)) return "air_force_base";
  if (/\b(civilian airport|civil airport|international airport|regional airport|airport|aerodrome)\b/.test(text)) return "airport";
  if (/\b(seaport|harbo[u]?r|port|shipyard)\b/.test(text)) return "port";
  if (/\b(army|military|armed forces|headquarters|general staff|joint staff|ministry of defen[cs]e|command|academy|college|school|university|training|range|proving ground|exercise area|maneuver area|base|garrison|barracks|fort|camp|station|installation)\b/.test(text)) return "army_base";
  return "other";
}

function looksLikePublicMilitarySite(title, summary = "") {
  const text = normalize(`${title} ${summary}`);
  return /\b(military|armed forces|army|national guard|reserve center|reserve centre|armory|armoury|naval|navy|air force|airbase|air base|military airfield|marine|defen[cs]e|base|garrison|barracks|fort|camp|arsenal|depot|supply|logistics?|ordnance|materiel|academy|training|dockyard|shipyard|headquarters|general staff|ministry of defen[cs]e|civilian airport|civil airport|international airport|regional airport|airport|aerodrome|seaport|harbo[u]?r|port)\b/.test(text);
}

function looksLikePastMilitaryEvent(title, summary = "") {
  const text = normalize(`${title} ${summary}`);
  const hasEventTerm = /\b(battle|siege|campaign|invasion|offensive|uprising|revolt|rebellion|war|conflict|military operation|operation|front|raid|occupation)\b/.test(text);
  const hasMilitaryContext = /\b(military|army|naval|navy|air force|armed forces|troops|soldiers|regiment|campaign|world war|civil war|battle|siege|invasion|offensive)\b/.test(text);
  return hasEventTerm && hasMilitaryContext;
}

function parseWikidataPoint(value) {
  const match = String(value ?? "").match(/Point\((-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\)/);
  if (!match) return null;
  const lon = Number(match[1]);
  const lat = Number(match[2]);
  return isValidLatLon(lat, lon) ? { lat, lon: normalizeLongitude(lon) } : null;
}

function classifyWikidataFacilityType(label, typeLabel) {
  const text = normalize(`${label} ${typeLabel}`);
  if (/\b(national guard|air national guard|army national guard|reserve center|reserve centre|armory|armoury)\b/.test(text)) return "national_guard";
  if (/\b(depot|arsenal|ordnance|materiel|maintenance|logistics?|supply|warehouse|storage facility|ammunition dump)\b/.test(text)) return "supply_depot";
  if (/\b(naval|navy|fleet|naval base|naval station|submarine)\b/.test(text)) return "naval_base";
  if (/\b(airbase|air base|air force base|air force station|military airfield|military aerodrome)\b/.test(text)) return "air_force_base";
  if (/\b(civilian airport|civil airport|international airport|regional airport|airport|aerodrome)\b/.test(text)) return "airport";
  if (/\b(seaport|harbo[u]?r|port|dockyard|shipyard)\b/.test(text)) return "port";
  return "army_base";
}

function getSnapshotPublicSiteScope(snapshot) {
  const placeKind = normalize(snapshot?.placeKind);
  if (snapshot?.source === "country search" || placeKind === "country") return "country";
  if (/\b(region|state|province|territory|administrative)\b/.test(placeKind)) return "region";
  if (/\b(city|locality|town|village|place|location)\b/.test(placeKind)) return "local";
  return "country";
}

function publicSiteSearchCacheKey(snapshot) {
  if (!snapshot) return "";
  const lat = Math.round(snapshot.lat * 10) / 10;
  const lon = Math.round(snapshot.lon * 10) / 10;
  return [snapshot.iso3, getSnapshotPublicSiteScope(snapshot), normalize(snapshot.selectedLocation), lat, lon].join("|");
}

function publicSitePageKey(site) {
  if (site?.type === "national_capital") {
    const countryKey = normalize(site.countryNames?.[0] || site.countryIso3 || site.name);
    const capitalKey = normalize(site.pageTitle || site.name || site.url);
    return [countryKey, capitalKey].filter(Boolean).join(":");
  }
  return normalize(site.pageTitle || site.name || site.url);
}

function dedupePublicSites(sites) {
  const seen = new Set();
  return sites.filter((site) => {
    const pageKey = publicSitePageKey(site);
    const nearKey = `${formatCoordinate(site.lat)},${formatCoordinate(site.lon)},${site.type}`;
    const key = pageKey || nearKey;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatFileSize(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = size / (1024 ** exponent);
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

function classifySourceFile(file) {
  const name = normalize(file?.name);
  const type = normalize(file?.type);
  if (type.startsWith("image/") || /\.(jpe?g|png|webp|gif|heic|heif)$/.test(name)) return "Photo";
  if (type.includes("pdf") || /\.pdf$/.test(name)) return "Report";
  if (/\.(docx?|txt|rtf|md)$/.test(name)) return "Document";
  if (/\.(csv|xlsx?|tsv|json)$/.test(name)) return "Data";
  if (/\.(pptx?|key)$/.test(name)) return "Brief";
  return "Source";
}

function isImageFileLike(file) {
  const name = normalize(file?.name);
  const type = normalize(file?.type);
  return type.startsWith("image/") || /\.(jpe?g|png|webp|gif|heic|heif)$/.test(name);
}

function getImageMimeType(file) {
  const type = normalize(file?.type);
  if (/^image\/(png|jpe?g|webp|gif|heic|heif)$/.test(type)) return type.replace("image/jpg", "image/jpeg");
  const name = normalize(file?.name);
  if (/\.png$/.test(name)) return "image/png";
  if (/\.jpe?g$/.test(name)) return "image/jpeg";
  if (/\.webp$/.test(name)) return "image/webp";
  if (/\.gif$/.test(name)) return "image/gif";
  if (/\.heic$/.test(name)) return "image/heic";
  if (/\.heif$/.test(name)) return "image/heif";
  return type;
}

function normalizeGps(gps) {
  const lat = gps?.lat == null ? null : toFiniteNumber(gps.lat);
  const lon = gps?.lon == null ? null : toFiniteNumber(gps.lon);
  if (!isValidLatLon(lat, lon)) return null;
  return {
    lat: normalizeCoordinate(lat),
    lon: normalizeCoordinate(normalizeLongitude(lon)),
    source: clampText(gps?.source, 80, "EXIF GPS")
  };
}

function normalizeVisionAnalysis(analysis) {
  if (!analysis || typeof analysis !== "object") return null;
  const possibleLocations = Array.isArray(analysis.possibleLocations) ? analysis.possibleLocations : [];
  const geoEvidence = Array.isArray(analysis.geoEvidence) ? analysis.geoEvidence : [];
  return {
    summary: clampText(analysis.summary, 420, ""),
    what: clampText(analysis.what, 180, ""),
    facilityType: clampText(analysis.facilityType, 120, ""),
    visualClues: toTextList(analysis.visualClues).slice(0, 8),
    possibleLocations: possibleLocations
      .map((location) => ({
        name: clampText(location?.name, 140, ""),
        country: clampText(location?.country, 90, ""),
        lat: location?.lat == null ? null : toFiniteNumber(location.lat),
        lon: location?.lon == null ? null : toFiniteNumber(location.lon),
        confidence: clampText(location?.confidence, 30, "low"),
        reason: clampText(location?.reason, 300, ""),
        source: clampText(location?.source, 90, ""),
        url: clampText(location?.url, 500, "")
      }))
      .slice(0, 8),
    geoEvidence: geoEvidence
      .map((item) => ({
        source: clampText(item?.source, 90, ""),
        database: clampText(item?.database, 120, ""),
        title: clampText(item?.title, 160, ""),
        url: clampText(item?.url, 500, ""),
        thumbnailUrl: clampText(item?.thumbnailUrl, 500, ""),
        lat: item?.lat == null ? null : toFiniteNumber(item.lat),
        lon: item?.lon == null ? null : toFiniteNumber(item.lon),
        confidence: clampText(item?.confidence, 30, "low"),
        score: item?.score == null ? null : toFiniteNumber(item.score),
        reason: clampText(item?.reason, 300, ""),
        matchedQuery: clampText(item?.matchedQuery, 140, ""),
        license: clampText(item?.license, 90, "")
      }))
      .filter((item) => item.title || isValidLatLon(item.lat, item.lon))
      .slice(0, 8),
    confidence: clampText(analysis.confidence, 30, "low"),
    cautions: toTextList(analysis.cautions).slice(0, 5)
  };
}

function normalizeSourceFile(file) {
  const name = clampText(file?.name, 180, "");
  if (!name) return null;
  return {
    id: clampText(file?.id, 120, `source-${Date.now()}`),
    name,
    type: clampText(file?.type, 120, ""),
    kind: clampText(file?.kind, 40, classifySourceFile(file)),
    size: Math.max(0, toFiniteNumber(file?.size, 0)),
    lastModified: Math.max(0, toFiniteNumber(file?.lastModified, 0)),
    addedAt: clampText(file?.addedAt, 40, new Date().toISOString()),
    gps: normalizeGps(file?.gps),
    visionStatus: clampText(file?.visionStatus, 80, ""),
    vision: normalizeVisionAnalysis(file?.vision),
    visionError: clampText(file?.visionError, 220, "")
  };
}

function sanitizeState() {
  state.snapshots = state.snapshots.map(normalizeSnapshot).filter(Boolean).slice(0, maxSnapshots);
  if (!state.snapshots.some((snapshot) => snapshot.id === state.selectedSnapshotId)) {
    state.selectedSnapshotId = state.snapshots[0]?.id ?? "";
  }
  state.actionLog = state.actionLog.map(normalizeActionEntry).slice(0, maxActionLogEntries);
  state.sourceFiles = state.sourceFiles.map(normalizeSourceFile).filter(Boolean).slice(0, 24);
  state.workflow = {
    mapConfirmed: Boolean(state.workflow?.mapConfirmed),
    step3SnapshotGenerated: Boolean(state.workflow?.step3SnapshotGenerated && state.snapshots.length)
  };
  if (!state.sourceFiles.length && !state.snapshots.length) {
    state.workflow.mapConfirmed = false;
    state.workflow.step3SnapshotGenerated = false;
  }
}

function saveState() {
  sanitizeState();
  localStorage.setItem(
    storageKey,
    JSON.stringify({
      snapshots: state.snapshots,
      selectedSnapshotId: state.selectedSnapshotId,
      actionLog: state.actionLog,
      sourceFiles: state.sourceFiles,
      workflow: state.workflow
    })
  );
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? localStorage.getItem(legacyStorageKey) ?? "null");
    if (!saved) return;
    state.snapshots = Array.isArray(saved.snapshots) ? saved.snapshots : [];
    state.selectedSnapshotId = saved.selectedSnapshotId ?? "";
    state.actionLog = Array.isArray(saved.actionLog) ? saved.actionLog : [];
    state.sourceFiles = Array.isArray(saved.sourceFiles) ? saved.sourceFiles : [];
    state.workflow = {
      mapConfirmed: Boolean(saved.workflow?.mapConfirmed),
      step3SnapshotGenerated: Boolean(saved.workflow?.step3SnapshotGenerated)
    };
    sanitizeState();
  } catch {
    state.snapshots = [];
    state.selectedSnapshotId = "";
    state.actionLog = [];
    state.sourceFiles = [];
    state.workflow = { mapConfirmed: false, step3SnapshotGenerated: false };
  }
}

async function loadTrainingTaxonomy() {
  try {
    const response = await fetch(trainingVariablesUrl);
    if (!response.ok) throw new Error(`Training taxonomy returned ${response.status}`);
    const payload = await response.json();
    state.trainingDomains = (Array.isArray(payload.domains) ? payload.domains : [])
      .map(normalizeTrainingDomain)
      .filter(Boolean);
    state.trainingCategories = Array.isArray(payload.categories) ? payload.categories.slice(0, 100) : [];
    state.trainingVariables = (Array.isArray(payload.variables) ? payload.variables : [])
      .map(normalizeTrainingVariable)
      .filter((variable) => variable.id || variable.training_variable_inject);
    state.selectedModelSectionKey = state.selectedModelSectionKey || state.trainingDomains[0]?.key || "";
  } catch {
    state.trainingDomains = [];
    state.trainingCategories = [];
    state.trainingVariables = [];
  }
}

async function loadPublicSites() {
  try {
    const response = await fetch(publicSitesUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Public sites returned ${response.status}`);
    const payload = await response.json();
    state.publicSites = (Array.isArray(payload.sites) ? payload.sites : []).map(normalizePublicSite).filter(Boolean);
    state.publicSiteSourceNote = clampText(payload.sourceNote, 360, "");
  } catch {
    state.publicSites = [];
    state.publicSiteSourceNote = "Public reference site layer unavailable.";
  }
}

async function loadWorldCapitals() {
  try {
    const response = await fetch(worldCapitalsUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`World capitals returned ${response.status}`);
    const payload = await response.json();
    state.worldCapitalSites = (Array.isArray(payload.capitals) ? payload.capitals : [])
      .map(worldCapitalToPublicSite)
      .filter(Boolean);
  } catch {
    state.worldCapitalSites = majorCapitalCitySeeds.map(majorCapitalSeedToSite).filter(Boolean);
  }
}

function renderDispositionDatalists() {
  const actionList = document.querySelector("#action-options");
  const objectiveList = document.querySelector("#objective-options");
  if (actionList) {
    const existing = new Set([...actionList.querySelectorAll("option")].map((option) => normalize(option.value)));
    state.dispositionIndex.actionTypes.forEach((action) => {
      const value = clampText(action.name, 120, "");
      if (!value || existing.has(normalize(value))) return;
      const option = document.createElement("option");
      option.value = value;
      actionList.appendChild(option);
      existing.add(normalize(value));
    });
  }
  if (objectiveList) {
    const existing = new Set([...objectiveList.querySelectorAll("option")].map((option) => normalize(option.value)));
    [...state.dispositionIndex.capabilities, ...state.dispositionIndex.processes].forEach((entry) => {
      const value = clampText(entry.name, 140, "");
      if (!value || existing.has(normalize(value))) return;
      const option = document.createElement("option");
      option.value = value;
      objectiveList.appendChild(option);
      existing.add(normalize(value));
    });
  }
}

async function loadDispositionIndex() {
  try {
    const response = await fetch(dispositionIndexUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Disposition index returned ${response.status}`);
    const payload = await response.json();
    state.dispositionIndex = normalizeDispositionIndex(payload);
    renderDispositionDatalists();
  } catch {
    state.dispositionIndex = normalizeDispositionIndex({});
  }
}

function getAllMapProviders() {
  return [...mapProviderCatalog, ...state.customMapProviders];
}

function getMapProvider(providerId = state.mapConfig.provider) {
  return getAllMapProviders().find((provider) => provider.id === providerId) ?? mapProviderCatalog[0];
}

function normalizeCustomMapProvider(provider) {
  const name = clampText(provider?.label ?? provider?.name, 80, "");
  const kind = ["raster", "arcgis", "3dtiles"].includes(provider?.kind) ? provider.kind : "raster";
  const url = clampText(provider?.url, 1000, "");
  if (!name || !url) return null;
  return {
    id: clampText(provider?.id, 120, `custom-${Date.now()}`),
    label: name,
    group: "Custom",
    kind,
    url,
    credit: clampText(provider?.credit, 160, "Custom map source")
  };
}

function loadCustomMapProviders() {
  try {
    const saved = JSON.parse(localStorage.getItem(customMapProvidersStorageKey) ?? "[]");
    state.customMapProviders = (Array.isArray(saved) ? saved : []).map(normalizeCustomMapProvider).filter(Boolean).slice(0, 20);
  } catch {
    state.customMapProviders = [];
  }
}

function saveCustomMapProviders() {
  localStorage.setItem(customMapProvidersStorageKey, JSON.stringify(state.customMapProviders));
}

function loadMapConfig() {
  loadCustomMapProviders();
  try {
    const prefs = JSON.parse(localStorage.getItem(mapPrefsStorageKey) ?? localStorage.getItem(legacyMapPrefsStorageKey) ?? "null");
    const tokens = JSON.parse(sessionStorage.getItem(mapTokenStorageKey) ?? sessionStorage.getItem(legacyMapTokenStorageKey) ?? "null");
    const providerIds = new Set(getAllMapProviders().map((provider) => provider.id));
    const savedProvider = providerIds.has(prefs?.provider) ? prefs.provider : "";
    const savedCustomProvider = state.customMapProviders.some((provider) => provider.id === savedProvider);
    state.mapConfig.provider = savedCustomProvider ? savedProvider : defaultMapProvider;
    state.mapConfig.googleApiKey = clampText(tokens?.googleApiKey, 240, "");
    state.mapConfig.cesiumIonToken = clampText(tokens?.cesiumIonToken, 1200, "");
    if (state.mapConfig.provider === "terrain" && !state.mapConfig.cesiumIonToken.trim()) {
      state.mapConfig.provider = defaultMapProvider;
    }
  } catch {
    state.mapConfig.provider = defaultMapProvider;
    state.mapConfig.googleApiKey = "";
    state.mapConfig.cesiumIonToken = "";
  }
}

function saveMapConfig() {
  localStorage.setItem(mapPrefsStorageKey, JSON.stringify({ provider: state.mapConfig.provider }));
  sessionStorage.setItem(
    mapTokenStorageKey,
    JSON.stringify({
      googleApiKey: state.mapConfig.googleApiKey,
      cesiumIonToken: state.mapConfig.cesiumIonToken
    })
  );
}

function getSelectedSnapshot() {
  return state.snapshots.find((snapshot) => snapshot.id === state.selectedSnapshotId) ?? state.snapshots[0] ?? null;
}

function getSnapshotFocusExtent(snapshot) {
  const locationExtent = normalizeExtent(snapshot?.locationExtent);
  const profileExtent = snapshot ? bboxToExtent(findProfileByCountry(snapshot.country, snapshot.iso3)?.bbox) : null;
  const countryExtent = normalizeExtent(snapshot?.countryExtent) ?? profileExtent;
  if (snapshot?.source === "country search" || normalize(snapshot?.placeKind).includes("country")) {
    return countryExtent ?? locationExtent ?? null;
  }
  return locationExtent ?? countryExtent ?? null;
}

function getProfileCapital(profile) {
  const capital = profile?.locations?.[0] ?? null;
  if (!capital || !isValidLatLon(capital.lat, capital.lon)) return null;
  return capital;
}

function createCapitalSnapLocation(profile, fallback = {}) {
  const capital = getProfileCapital(profile) ?? {
    label: profile?.country || fallback.label || "Capital",
    lat: fallback.lat ?? profile?.center?.lat,
    lon: fallback.lon ?? profile?.center?.lon
  };
  const lat = toFiniteNumber(capital.lat);
  const lon = toFiniteNumber(capital.lon);
  if (!isValidLatLon(lat, lon)) return fallback;
  return {
    ...fallback,
    label: clampText(capital.label, 100, profile.country),
    lat,
    lon: normalizeLongitude(lon),
    extent: pointToExtent(lat, lon),
    locationExtent: pointToExtent(lat, lon),
    countryExtent: fallback.countryExtent ?? bboxToExtent(profile.bbox),
    placeKind: "Country capital",
    adminArea: `${profile.country} capital`,
    source: "country search",
    cameraHeightMeters: searchCameraHeightMeters
  };
}

function buildSearchIndex() {
  state.searchIndex = state.profiles.flatMap((profile) => {
    const countryEntry = {
      type: "country",
      label: profile.country,
      subtitle: `${profile.region} | ${profile.iso3}`,
      profile,
      lat: profile.center.lat,
      lon: profile.center.lon,
      extent: bboxToExtent(profile.bbox),
      countryExtent: bboxToExtent(profile.bbox),
      terms: [profile.country, profile.iso3, profile.region, ...(profile.aliases ?? [])]
    };

    const locationEntries = (profile.locations ?? []).map((location) => ({
      type: "place",
      label: location.label,
      subtitle: `${profile.country} | ${formatCoordinates(location.lat, location.lon)}`,
      profile,
      lat: location.lat,
      lon: location.lon,
      extent: pointToExtent(location.lat, location.lon),
      countryExtent: bboxToExtent(profile.bbox),
      terms: [location.label, profile.country, profile.iso3, ...(profile.aliases ?? [])]
    }));

    return [countryEntry, ...locationEntries];
  });
}

function scoreSearchEntry(entry, query) {
  const terms = entry.terms.map(normalize);
  const label = normalize(entry.label);
  if (label === query) return 100;
  if (label.startsWith(query)) return 80;
  if (terms.some((term) => term === query)) return 70;
  if (terms.some((term) => term.startsWith(query))) return 55;
  if (terms.some((term) => term.includes(query))) return 35;
  return 0;
}

function buildLocalSearchResults(query) {
  const normalizedQuery = normalize(query);
  return state.searchIndex
    .map((entry) => ({ ...entry, score: scoreSearchEntry(entry, normalizedQuery), sourceType: "local" }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4);
}

function buildDispositionSearchResults(query) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery || !state.dispositionIndex.entities.length) return [];
  return state.dispositionIndex.entities
    .map((entity) => {
      const terms = [entity.name, entity.officialName, entity.iso3, entity.iso2, entity.entityId, entity.region, entity.subregion]
        .filter(Boolean)
        .map(normalize);
      const label = normalize(entity.name);
      let score = 0;
      if (label === normalizedQuery) score = 96;
      else if (label.startsWith(normalizedQuery)) score = 84;
      else if (terms.some((term) => term === normalizedQuery)) score = 76;
      else if (terms.some((term) => term.startsWith(normalizedQuery))) score = 58;
      else if (terms.some((term) => term.includes(normalizedQuery))) score = 36;
      return {
        sourceType: "disposition",
        type: "country",
        label: entity.name,
        subtitle: [entity.region || "Public entity index", entity.iso3 || entity.entityId].filter(Boolean).join(" | "),
        badge: entity.coverageTier || "military disposition db",
        score,
        entity
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);
}

function renderSearchResults(query) {
  const target = $(selectors.searchResults);
  const normalizedQuery = normalize(query);
  window.clearTimeout(state.locationSearchTimer);

  if (normalizedQuery.length < 2) {
    clearLocationSearchState();
    syncControls(getSelectedSnapshot());
    return;
  }

  target.innerHTML = '<p class="empty-state compact">Searching global places\u2026</p>';
  $(selectors.locationSearch).setAttribute("aria-expanded", "true");
  $(selectors.locationSearch).setAttribute("aria-busy", "true");
  state.locationSearchTimer = window.setTimeout(() => updateLocationSearchResults(query), locationSearchDebounceMs);
  syncControls(getSelectedSnapshot());
}

async function updateLocationSearchResults(query) {
  const target = $(selectors.searchResults);
  const serial = (state.locationSearchSerial += 1);
  const localResults = buildLocalSearchResults(query);
  const dispositionResults = buildDispositionSearchResults(query);
  let globalResults = [];

  try {
    globalResults = await searchArcGisSuggestions(query);
  } catch {
    globalResults = [];
  }

  if (serial !== state.locationSearchSerial) return;

  const results = dedupeLocationResults([...dispositionResults, ...globalResults, ...localResults])
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
    .slice(0, 9);
  state.locationResults = results;
  $(selectors.locationSearch).removeAttribute("aria-busy");
  $(selectors.locationSearch).setAttribute("aria-expanded", results.length ? "true" : "false");
  syncControls(getSelectedSnapshot());

  if (!results.length) {
    target.innerHTML = '<p class="empty-state compact">No global location suggestions.</p>';
    return;
  }

  target.innerHTML = results
    .map(
      (entry, index) => `
        <button class="result-button" type="button" role="option" data-search-index="${index}">
          <span class="result-kicker">${escapeHtml(entry.sourceType === "local" ? "Profile match" : entry.sourceType === "disposition" ? "Disposition DB" : "Global geocoder")}</span>
          <strong>${escapeHtml(entry.label)}</strong>
          <small>${escapeHtml(entry.subtitle)}${entry.badge ? ` / ${escapeHtml(entry.badge)}` : ""}</small>
        </button>
      `
    )
    .join("");

  target.querySelectorAll("[data-search-index]").forEach((button) => {
    button.addEventListener("click", () => selectLocationSearchResult(Number(button.dataset.searchIndex)));
  });
}

function clearLocationSearchState({ clearInput = false } = {}) {
  window.clearTimeout(state.locationSearchTimer);
  state.locationSearchSerial += 1;
  state.locationResults = [];
  $(selectors.searchResults).innerHTML = "";
  const input = $(selectors.locationSearch);
  if (clearInput) input.value = "";
  input.setAttribute("aria-expanded", "false");
  input.removeAttribute("aria-busy");
}

function dedupeLocationResults(results) {
  const seen = new Set();
  return results.filter((result) => {
    const key = `${normalize(result.label)}|${normalize(result.subtitle)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function classifyArcGisPlaceKind(attributes = {}) {
  const raw = normalize(`${attributes.Type ?? ""} ${attributes.Addr_type ?? ""}`);
  if (raw.includes("country")) return "Country";
  if (raw.includes("state") || raw.includes("province") || raw.includes("region") || raw.includes("subregion")) return "Region";
  if (raw.includes("city") || raw.includes("locality") || raw.includes("populated")) return "City";
  if (attributes.City) return "City";
  if (attributes.Region) return "Region";
  return "Location";
}

function formatAdminArea(attributes = {}, countryName = "") {
  const parts = [attributes.City, attributes.Region, attributes.Country || countryName]
    .map((part) => clampText(part, 80, ""))
    .filter(Boolean);
  return parts.filter((part, index) => parts.indexOf(part) === index).join(", ");
}

function formatPlaceHierarchy(parts, fallback = "") {
  const seen = new Set();
  const label = parts
    .map((part) => clampText(part, 90, ""))
    .filter(Boolean)
    .filter((part) => {
      const key = normalize(part);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(", ");
  return clampText(label, 140, fallback);
}

function formatResolvedLocationLabel(location, fallback = "") {
  return formatPlaceHierarchy([
    location?.city,
    location?.region,
    location?.countryName || location?.country
  ], location?.adminArea || location?.label || fallback);
}

function populateLocationSearchFromResolvedLocation(location, fallback = "") {
  const label = formatResolvedLocationLabel(location, fallback);
  if (!label) return "";
  const input = $(selectors.locationSearch);
  input.value = label;
  input.setAttribute("aria-expanded", "false");
  return label;
}

function isArcGisWaterBody(attributes = {}) {
  const raw = normalize(`${attributes.Type ?? ""} ${attributes.Addr_type ?? ""}`);
  return /\b(ocean|sea|lake|gulf|bay|strait|channel|sound|fjord|river|reservoir|water)\b/.test(raw);
}

function getArcGisWaterName(attributes = {}) {
  if (!isArcGisWaterBody(attributes)) return "";
  const name = clampText(attributes.PlaceName || attributes.LongLabel || attributes.Match_addr, 120, "");
  return normalize(name).includes("unresolved") ? "" : name;
}

function getReverseGeocodeHoverLabel(location) {
  const label = location?.waterName || location?.countryName || location?.countryCode || "";
  return normalize(label).includes("unresolved") ? "" : label;
}

function scoreArcGisSuggestion(suggestion, query) {
  const normalizedQuery = normalize(query);
  const text = normalize(suggestion.text);
  const primary = normalize(String(suggestion.text ?? "").split(",")[0]);
  if (primary === normalizedQuery) return 92;
  if (text === normalizedQuery) return 90;
  if (primary.startsWith(normalizedQuery)) return 82;
  if (text.startsWith(normalizedQuery)) return 72;
  if (text.includes(normalizedQuery)) return 46;
  return 25;
}

async function searchArcGisSuggestions(query) {
  const url = new URL(`${arcGisGeocoderUrl}/suggest`);
  url.searchParams.set("f", "json");
  url.searchParams.set("text", query);
  url.searchParams.set("maxSuggestions", "8");

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Geocoder returned ${response.status}`);
  const payload = await response.json();
  return (payload.suggestions ?? [])
    .filter((suggestion) => suggestion.text && suggestion.magicKey)
    .map((suggestion) => ({
      sourceType: "arcgis",
      type: "global",
      label: suggestion.text,
      subtitle: "Global geocoder",
      badge: "city/region/country",
      score: scoreArcGisSuggestion(suggestion, query),
      text: suggestion.text,
      magicKey: suggestion.magicKey
    }));
}

async function selectLocationSearchResult(index) {
  const entry = state.locationResults[index];
  if (!entry) return;

  const target = $(selectors.searchResults);
  target.innerHTML = "";
  $(selectors.locationSearch).value = entry.label;
  $(selectors.locationSearch).setAttribute("aria-expanded", "false");

  if (entry.sourceType === "local") {
    const baseLocation = {
      label: entry.label,
      lat: entry.lat,
      lon: entry.lon,
      extent: entry.extent,
      countryExtent: entry.countryExtent,
      placeKind: entry.type === "country" ? "Country" : "City",
      adminArea: entry.type === "country" ? entry.profile.region : `${entry.label}, ${entry.profile.country}`,
      source: entry.type === "country" ? "country search" : "place search",
      cameraHeightMeters: searchCameraHeightMeters
    };
    selectKnownLocation(
      entry.profile,
      entry.type === "country" ? createCapitalSnapLocation(entry.profile, baseLocation) : baseLocation
    );
    return;
  }

  if (entry.sourceType === "disposition") {
    try {
      const suggestions = await searchArcGisSuggestions(entry.entity.officialName || entry.entity.name);
      const best = suggestions[0];
      if (!best) throw new Error("No geocoder match for disposition entity");
      const location = await resolveArcGisSuggestion(best);
      location.countryName = entry.entity.name;
      location.countryCode = entry.entity.iso3 || entry.entity.iso2 || entry.entity.entityId;
      location.placeKind = "Country";
      location.source = "military disposition database";
      await selectGeocodedLocation(location);
    } catch (error) {
      updateResolution(`Disposition DB match found, but map lookup failed: ${error.message}`, "caution");
    }
    return;
  }

  try {
    const location = await resolveArcGisSuggestion(entry);
    await selectGeocodedLocation(location);
  } catch (error) {
    updateResolution(`Location lookup failed: ${error.message}`, "caution");
  }
}

async function resolveArcGisSuggestion(entry) {
  const url = new URL(`${arcGisGeocoderUrl}/findAddressCandidates`);
  url.searchParams.set("f", "json");
  url.searchParams.set("singleLine", entry.text);
  url.searchParams.set("magicKey", entry.magicKey);
  url.searchParams.set("outFields", "Match_addr,LongLabel,ShortLabel,Addr_type,Type,PlaceName,City,Region,Country,CntryName");
  url.searchParams.set("maxLocations", "1");
  url.searchParams.set("langCode", "en");

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Geocoder returned ${response.status}`);
  const payload = await response.json();
  const candidate = payload.candidates?.[0];
  const lat = toFiniteNumber(candidate?.location?.y);
  const lon = toFiniteNumber(candidate?.location?.x);
  if (!candidate || !isValidLatLon(lat, lon)) {
    throw new Error("No coordinate candidate found");
  }

  const attributes = candidate.attributes ?? {};
  const countryName = clampText(attributes.CntryName, 90, attributes.Country || "Unresolved country");
  const city = clampText(attributes.City || attributes.PlaceName, 90, "");
  const region = clampText(attributes.Region, 90, inferRegion(lat, lon));
  const label = formatPlaceHierarchy([city, region, countryName], attributes.LongLabel || candidate.address || entry.text);
  const placeType = clampText(attributes.Type || attributes.Addr_type, 80, "Place");
  const placeKind = classifyArcGisPlaceKind(attributes);
  const extent = normalizeExtent(candidate.extent ?? {
    west: attributes.Xmin,
    east: attributes.Xmax,
    south: attributes.Ymin,
    north: attributes.Ymax
  });
  const isCountryResult = placeKind === "Country";
  return {
    label,
    lat,
    lon: normalizeLongitude(lon),
    countryName,
    countryCode: clampText(attributes.Country, 6, "").toUpperCase(),
    city,
    region,
    placeType,
    placeKind,
    adminArea: formatPlaceHierarchy([city, region, countryName], formatAdminArea(attributes, countryName)),
    locationExtent: isCountryResult ? null : extent,
    countryExtent: isCountryResult ? extent : null
  };
}

function formatCoordinates(lat, lon) {
  return `${formatCoordinate(lat)}, ${formatCoordinate(normalizeLongitude(lon))}`;
}

function getCountryFlagCacheKey(snapshot) {
  const iso3 = clampText(snapshot?.iso3, 6, "").toUpperCase();
  if (iso3 && iso3 !== "UNK") return iso3;
  return normalize(snapshot?.country);
}

function getCountryIso2(snapshot) {
  const iso = clampText(snapshot?.iso3, 6, "").toUpperCase();
  if (/^[A-Z]{2}$/.test(iso)) return iso;
  if (countryIso3ToIso2[iso]) return countryIso3ToIso2[iso];
  const cacheKey = getCountryFlagCacheKey(snapshot);
  return clampText(state.countryIso2Cache.get(cacheKey), 2, "").toUpperCase();
}

function flagEmojiFromIso2(iso2) {
  const code = clampText(iso2, 2, "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code].map((letter) => 127397 + letter.charCodeAt(0)));
}

function getCountryFlag(snapshot) {
  return flagEmojiFromIso2(getCountryIso2(snapshot));
}

async function ensureCountryFlag(snapshot) {
  const cacheKey = getCountryFlagCacheKey(snapshot);
  if (!cacheKey || getCountryIso2(snapshot) || state.countryIso2Pending.has(cacheKey)) return;

  state.countryIso2Pending.add(cacheKey);
  try {
    const iso3 = clampText(snapshot?.iso3, 6, "").toUpperCase();
    const countryName = clampText(snapshot?.country, 90, "");
    const endpoint = iso3 && iso3 !== "UNK"
      ? `${restCountriesApiUrl}/alpha/${encodeURIComponent(iso3)}`
      : `${restCountriesApiUrl}/name/${encodeURIComponent(countryName)}?fullText=true`;
    const separator = endpoint.includes("?") ? "&" : "?";
    const response = await fetch(`${endpoint}${separator}fields=cca2`);
    if (!response.ok) return;
    const payload = await response.json();
    const record = Array.isArray(payload) ? payload[0] : payload;
    const iso2 = clampText(record?.cca2, 2, "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(iso2)) return;
    state.countryIso2Cache.set(cacheKey, iso2);
    if (snapshot.id === state.selectedSnapshotId) renderApp();
  } catch {
    // The flag is decorative; keep the dossier usable if lookup fails.
  } finally {
    state.countryIso2Pending.delete(cacheKey);
  }
}

function normalizeLongitude(lon) {
  let value = Number(lon);
  while (value > 180) value -= 360;
  while (value < -180) value += 360;
  return value;
}

function isInsideBbox(lat, lon, bbox) {
  if (!bbox) return false;
  return lat >= bbox.minLat && lat <= bbox.maxLat && lon >= bbox.minLon && lon <= bbox.maxLon;
}

function haversineKm(leftLat, leftLon, rightLat, rightLon) {
  const radiusKm = 6371;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(rightLat - leftLat);
  const dLon = toRad(rightLon - leftLon);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(leftLat)) * Math.cos(toRad(rightLat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * radiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function resolveProfileByCoordinates(lat, lon) {
  const normalizedLon = normalizeLongitude(lon);
  const direct = state.profiles.find((profile) => isInsideBbox(lat, normalizedLon, profile.bbox));
  if (direct) {
    return {
      profile: direct,
      confidence: "High",
      status: "Resolved inside country bounds",
      statusClass: "ready"
    };
  }

  const nearest = state.profiles
    .map((profile) => {
      const candidates = [profile.center, ...(profile.locations ?? [])];
      const distanceKm = Math.min(...candidates.map((point) => haversineKm(lat, normalizedLon, point.lat, point.lon)));
      return { profile, distanceKm };
    })
    .sort((left, right) => left.distanceKm - right.distanceKm)[0];

  if (nearest?.distanceKm <= 650) {
    return {
      profile: nearest.profile,
      confidence: "Medium",
      status: `Nearest public profile within ${Math.round(nearest.distanceKm)} km`,
      statusClass: "caution"
    };
  }

  return {
    profile: createUnresolvedProfile(lat, normalizedLon, nearest?.profile),
    confidence: "Low",
    status: nearest ? `No country profile matched; nearest sample is ${nearest.profile.country}` : "No profile matched",
    statusClass: "caution"
  };
}

function inferRegion(lat, lon) {
  if (lat > 35 && lon > -20 && lon < 45) return "Europe";
  if (lat > 5 && lon > 45 && lon < 105) return "South or Central Asia";
  if (lat > -10 && lat < 50 && lon > 95 && lon < 155) return "Indo-Pacific";
  if (lat > -35 && lon > -85 && lon < -30) return "South America";
  if (lat > -35 && lat < 38 && lon > -20 && lon < 55) return "Africa";
  if (lat > 15 && lon > -170 && lon < -50) return "North America";
  return lat >= 0 ? "Northern Hemisphere" : "Southern Hemisphere";
}

function createUnresolvedProfile(lat, lon, nearestProfile) {
  const region = inferRegion(lat, lon);
  const nearest = nearestProfile ? ` Nearest sample profile: ${nearestProfile.country}.` : "";
  return {
    id: "unresolved",
    country: "Unresolved country",
    iso3: "UNK",
    region,
    center: { lat, lon },
    militaryForces: ["Profile unavailable"],
    forceDisposition: [`No country-level profile is attached to this coordinate.${nearest}`],
    hardware: ["Profile unavailable"],
    personnelFormations: ["Profile unavailable"],
    weaponsSystems: ["Profile unavailable"],
    model: Object.fromEntries(modelFieldDefinitions.map(([key]) => [key, "Requires a verified country profile or an imported source file."]))
  };
}

function findProfileByCountry(countryName, countryCode = "") {
  const normalizedCountry = normalize(countryName);
  const normalizedCode = normalize(countryCode);
  return state.profiles.find((profile) => {
    if (normalizedCode && normalize(profile.iso3) === normalizedCode) return true;
    if (normalize(profile.country) === normalizedCountry) return true;
    return (profile.aliases ?? []).some((alias) => normalize(alias) === normalizedCountry);
  });
}

function createGeocoderFallbackProfile(location) {
  const countryName = clampText(location.countryName, 90, "Unresolved country");
  const iso3 = clampText(location.countryCode, 6, "UNK").toUpperCase();
  const region = clampText(location.region, 90, inferRegion(location.lat, location.lon));
  return {
    id: `geocoder-${normalize(countryName).replace(/[^a-z0-9]+/g, "-") || "unknown"}`,
    country: countryName,
    iso3,
    region,
    center: { lat: location.lat, lon: location.lon },
    militaryForces: ["Profile unavailable"],
    forceDisposition: [`Global geocoder resolved this location, but AdaptSim does not have a country-level military baseline for ${countryName}.`],
    hardware: ["Profile unavailable"],
    personnelFormations: ["Profile unavailable"],
    weaponsSystems: ["Profile unavailable"],
    model: Object.fromEntries(modelFieldDefinitions.map(([key]) => [key, "Requires a verified country profile or imported source file."]))
  };
}

async function fetchCountryCapitalLocation(countryName, countryCode = "") {
  try {
    const code = clampText(countryCode, 6, "").toLowerCase();
    const endpoint = code
      ? `https://restcountries.com/v3.1/alpha/${encodeURIComponent(code)}`
      : `https://restcountries.com/v3.1/name/${encodeURIComponent(countryName)}?fullText=true`;
    const separator = endpoint.includes("?") ? "&" : "?";
    const response = await fetch(`${endpoint}${separator}fields=name,capital,capitalInfo,cca3`);
    if (!response.ok) return null;
    const payload = await response.json();
    const record = Array.isArray(payload) ? payload[0] : payload;
    const [lat, lon] = record?.capitalInfo?.latlng ?? [];
    const label = Array.isArray(record?.capital) ? record.capital[0] : "";
    if (!label || !isValidLatLon(Number(lat), Number(lon))) return null;
    return {
      label: clampText(label, 100, `${countryName} capital`),
      lat: Number(lat),
      lon: normalizeLongitude(Number(lon)),
      locationExtent: pointToExtent(Number(lat), Number(lon)),
      placeKind: "Country capital",
      adminArea: `${countryName} capital`
    };
  } catch {
    return null;
  }
}

async function applyCountryCapitalRule(location, profile) {
  if (location?.placeKind !== "Country") return location;
  const profileCapital = profile?.iso3 !== "UNK" ? createCapitalSnapLocation(profile, location) : null;
  if (profileCapital?.placeKind === "Country capital") return profileCapital;

  const capital = await fetchCountryCapitalLocation(location.countryName, location.countryCode);
  if (!capital) return location;
  return {
    ...location,
    ...capital,
    countryExtent: location.countryExtent,
    source: "country search",
    cameraHeightMeters: searchCameraHeightMeters
  };
}

async function selectGeocodedLocation(location) {
  const profile = findProfileByCountry(location.countryName, location.countryCode)
    ?? createDispositionProfile(location)
    ?? createGeocoderFallbackProfile(location);
  const snapLocation = await applyCountryCapitalRule(location, profile);
  const confidence = profile.iso3 === "UNK" || profile.militaryForces.includes("Profile unavailable") ? "Medium" : "High";
  createSnapshot(profile, {
    label: snapLocation.label,
    lat: snapLocation.lat,
    lon: snapLocation.lon,
    placeKind: snapLocation.placeKind,
    adminArea: snapLocation.adminArea,
    locationExtent: snapLocation.locationExtent,
    countryExtent: snapLocation.countryExtent,
    source: snapLocation.source || "global geocoder",
    cameraHeightMeters: searchCameraHeightMeters
  }, {
    confidence,
    status: location.placeKind === "Country"
      ? "Resolved country to capital by rule."
      : `Resolved by global geocoder: ${location.placeType}`,
    statusClass: confidence === "High" ? "ready" : "caution"
  });
}

function createSnapshot(profile, location, resolution, options = {}) {
  const lat = toFiniteNumber(location?.lat);
  const lon = toFiniteNumber(location?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !isValidLatLon(lat, normalizeLongitude(lon))) {
    updateResolution("Snapshot location is outside valid latitude/longitude bounds.", "restricted");
    return;
  }

  const now = new Date();
  const dispositionContext = buildDispositionSnapshotContext(profile);
  const snapshot = normalizeSnapshot({
    id: `snapshot-${now.getTime()}`,
    timestamp: now.toISOString(),
    selectedLocation: location.label,
    placeKind: location.placeKind,
    adminArea: location.adminArea,
    lat,
    lon: normalizeLongitude(lon),
    locationExtent: normalizeExtent(location.locationExtent ?? location.extent),
    countryExtent: normalizeExtent(location.countryExtent) ?? bboxToExtent(profile.bbox),
    source: location.source,
    confidence: resolution.confidence,
    resolutionStatus: resolution.status,
    statusClass: resolution.statusClass,
    country: profile.country,
    iso3: profile.iso3,
    region: profile.region,
    militaryForces: [...(profile.militaryForces ?? [])],
    forceDisposition: [...(profile.forceDisposition ?? [])],
    hardware: [...(profile.hardware ?? [])],
    personnelFormations: [...(profile.personnelFormations ?? [])],
    weaponsSystems: [...(profile.weaponsSystems ?? [])],
    model: { ...(profile.model ?? {}) },
    sourceNote: dispositionContext.sourceNote || state.sourceNote || defaultSourceNote,
    openSourceStatus: dispositionContext.status,
    openSourceQueries: dispositionContext.queries,
    openSourceSources: dispositionContext.sources,
    humanInputs: [],
    reasonedAdjustments: []
  });

  if (!snapshot) {
    updateResolution("Snapshot could not be created from the selected profile.", "restricted");
    return null;
  }

  state.snapshots = [snapshot, ...state.snapshots].slice(0, maxSnapshots);
  state.selectedSnapshotId = snapshot.id;
  state.workflow.step3SnapshotGenerated = Boolean(options.markStep3Complete && state.workflow.mapConfirmed);
  setCoordinateInputs(snapshot.lat, snapshot.lon);
  saveState();
  setIntakeAgentTask("locate", "complete", `Step 02 centered on ${snapshot.selectedLocation}.`, "Location resolved; filling the model.");
  setIntakeAgentTask("snapshot", "complete", `${snapshot.country} snapshot generated from public baseline data.`);
  setIntakeAgentTask("sources", "running", "Searching open-source context for the generated snapshot.", "Open-source enrichment is running in the background.");
  placePin(snapshot.lat, snapshot.lon);
  drawSelectedOutlines(snapshot);
  renderPublicSitesForSnapshot(snapshot);
  if (location.centerMap !== false) {
    const cameraHeight = toFiniteNumber(location.cameraHeightMeters, getAutoCameraHeight(snapshot));
    triggerMapSnapFeedback({ revealMap: location.revealMap !== false });
    orientGlobeToLocation(snapshot.lat, snapshot.lon, getSnapshotFocusExtent(snapshot), {
      heightMeters: cameraHeight
    });
  }
  renderApp();
  if (options.focusStepAfterRender) {
    focusWorkflowStep(options.focusStepAfterRender, {
      focusSelector: options.focusSelectorAfterRender
    });
  }
  enrichSnapshotFromOpenSources(snapshot.id);
  return snapshot;
}

function selectKnownLocation(profile, location) {
  createSnapshot(profile, location, {
    confidence: "High",
    status: "Resolved from profile search",
    statusClass: "ready"
  });
}

async function createCoordinateSnapshot(lat, lon, source = "gps coordinates", centerMap = true, options = {}) {
  const normalizedLon = normalizeLongitude(lon);
  const coordinateLabel = formatCoordinates(lat, normalizedLon);
  const geocodedLocation = await reverseGeocodeLocation(lat, normalizedLon);

  if (Number.isFinite(options.resetSerial) && options.resetSerial !== state.resetSerial) {
    return null;
  }

  if (geocodedLocation?.countryName && !normalize(geocodedLocation.countryName).includes("unresolved")) {
    const profile = findProfileByCountry(geocodedLocation.countryName, geocodedLocation.countryCode)
      ?? createDispositionProfile(geocodedLocation)
      ?? createGeocoderFallbackProfile(geocodedLocation);
    const hasBaseline = profile.iso3 !== "UNK" && !profile.militaryForces.includes("Profile unavailable");
    const resolvedLabel = populateLocationSearchFromResolvedLocation(geocodedLocation, coordinateLabel);
    return createSnapshot(profile, {
      label: resolvedLabel || coordinateLabel,
      lat,
      lon: normalizedLon,
      placeKind: geocodedLocation.placeKind || "Coordinates",
      adminArea: geocodedLocation.adminArea || resolvedLabel || geocodedLocation.countryName,
      source,
      centerMap,
      revealMap: options.revealMap
    }, {
      confidence: hasBaseline ? "High" : "Medium",
      status: `Resolved by reverse geocoder: ${geocodedLocation.placeKind || geocodedLocation.placeType || "Coordinates"}.`,
      statusClass: hasBaseline ? "ready" : "caution"
    }, {
      markStep3Complete: options.markStep3Complete,
      focusStepAfterRender: options.focusStepAfterRender,
      focusSelectorAfterRender: options.focusSelectorAfterRender
    });
  }

  const resolution = resolveProfileByCoordinates(lat, normalizedLon);
  return createSnapshot(resolution.profile, {
    label: coordinateLabel,
    lat,
    lon: normalizedLon,
    placeKind: "Coordinates",
    adminArea: resolution.profile.country,
    source,
    centerMap,
    revealMap: options.revealMap
  }, resolution, {
    markStep3Complete: options.markStep3Complete,
    focusStepAfterRender: options.focusStepAfterRender,
    focusSelectorAfterRender: options.focusSelectorAfterRender
  });
}

async function resolveCoordinatesFromInputs() {
  const search = $(selectors.locationSearch).value.trim();
  const latValue = $(selectors.latInput).value.trim();
  const lonValue = $(selectors.lonInput).value.trim();

  if (!search && !latValue && !lonValue) {
    clearLocationSearchState();
    updateResolution("Enter a location or coordinates before generating a snapshot.", "neutral");
    return;
  }

  const lat = Number(latValue);
  const lon = Number(lonValue);

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    updateResolution("Enter latitude -90 to 90 and longitude -180 to 180.", "restricted");
    return;
  }

  await activateCoordinates({ lat, lon: normalizeLongitude(lon), source: "gps coordinates" }, {
    label: "entered coordinates",
    source: "gps coordinates",
    centerMap: true,
    revealMap: false,
    forceNew: true,
    markStep3Complete: true,
    focusStepAfterRender: "04",
    focusSelectorAfterRender: selectors.analystNote
  });
}

function updateResolution(message, className = "neutral") {
  const target = $(selectors.resolutionStatus);
  target.className = `status-pill ${sanitizeStatusClass(className)}`;
  target.textContent = message;
}

function buildIntakeAgentTasks(files) {
  const imageCount = files.filter((file) => file.kind === "Photo").length;
  const gpsCount = files.filter((file) => file.gps).length;
  return [
    {
      id: "intake",
      label: "File intake",
      status: "complete",
      detail: `${files.length} source file${files.length === 1 ? "" : "s"} registered.`
    },
    {
      id: "metadata",
      label: "Metadata + EXIF",
      status: "complete",
      detail: gpsCount
        ? `${gpsCount} coordinate fix${gpsCount === 1 ? "" : "es"} found.`
        : "No embedded GPS found yet."
    },
    {
      id: "locate",
      label: "Map snap",
      status: gpsCount ? "running" : imageCount ? "queued" : "blocked",
      detail: gpsCount
        ? "Promoting coordinates into Step 02."
        : imageCount
          ? "Waiting for coordinates or visual cues."
          : "No coordinate-bearing source found."
    },
    {
      id: "vision",
      label: "Image forensics",
      status: imageCount ? "running" : "skipped",
      detail: imageCount ? `Scanning ${imageCount} image${imageCount === 1 ? "" : "s"} for location cues.` : "No image source queued."
    },
    {
      id: "geoimage",
      label: "Open location evidence",
      status: gpsCount ? "skipped" : imageCount ? "queued" : "skipped",
      detail: gpsCount
        ? "Skipped because embedded GPS was found."
        : imageCount
          ? "Will compare interpreted cues with open place and geotagged image evidence."
          : "No image source queued."
    },
    {
      id: "snapshot",
      label: "Snapshot fill",
      status: gpsCount ? "queued" : imageCount ? "waiting" : "blocked",
      detail: gpsCount || imageCount
        ? "Country profile and extractable model will fill as soon as location resolves."
        : "Needs usable coordinates or a geocoded visual cue."
    },
    {
      id: "sources",
      label: "Open-source enrichment",
      status: gpsCount || imageCount ? "waiting" : "blocked",
      detail: gpsCount || imageCount
        ? "Wikipedia/Wikidata lookups start after a location snapshot exists."
        : "Waiting on a generated snapshot."
    }
  ];
}

function startIntakeAgent(files) {
  const now = new Date().toISOString();
  state.intakeAgent = {
    status: "running",
    current: "Reading source data and looking for a fast location fix.",
    startedAt: now,
    updatedAt: now,
    fileCount: files.length,
    tasks: buildIntakeAgentTasks(files)
  };
}

function setIntakeAgentTask(taskId, status, detail = "", current = "") {
  if (!state.intakeAgent || state.intakeAgent.status === "idle") return;
  const task = state.intakeAgent.tasks.find((entry) => entry.id === taskId);
  if (!task) return;
  task.status = status;
  if (detail) task.detail = detail;
  state.intakeAgent.updatedAt = new Date().toISOString();
  if (current) state.intakeAgent.current = current;

  const activeStatuses = new Set(["running", "queued", "waiting"]);
  const hasActiveTask = state.intakeAgent.tasks.some((entry) => activeStatuses.has(entry.status));
  const hasFailure = state.intakeAgent.tasks.some((entry) => entry.status === "blocked");
  if (!hasActiveTask) {
    state.intakeAgent.status = hasFailure ? "blocked" : "complete";
    state.intakeAgent.current = hasFailure ? "Needs review before the next step." : "Initial intake complete.";
  } else {
    state.intakeAgent.status = "running";
  }
}

function renderIntakeAgent() {
  const target = $(selectors.sourceAgentStatus);
  const agent = state.intakeAgent;
  if (!target || !agent?.tasks?.length) {
    target.innerHTML = "";
    target.hidden = true;
    return;
  }

  const completeCount = agent.tasks.filter((task) => ["complete", "skipped"].includes(task.status)).length;
  const progress = Math.round((completeCount / agent.tasks.length) * 100);
  target.hidden = false;
  target.dataset.agentStatus = agent.status;
  target.innerHTML = `
    <div class="agent-status-head">
      <div>
        <p class="eyebrow">Intake Agent</p>
        <strong>${escapeHtml(agent.current || "Working source intake.")}</strong>
      </div>
      <span>${escapeHtml(String(progress))}%</span>
    </div>
    <div class="agent-progress" aria-hidden="true"><span style="width: ${progress}%"></span></div>
    <div class="agent-task-list">
      ${agent.tasks.map((task) => `
        <article class="agent-task" data-agent-task-status="${escapeHtml(task.status)}">
          <span>${escapeHtml(task.status)}</span>
          <strong>${escapeHtml(task.label)}</strong>
          <small>${escapeHtml(task.detail)}</small>
        </article>
      `).join("")}
    </div>
  `;
}

function gpsMatchesSnapshot(gps, snapshot) {
  if (!gps || !snapshot) return false;
  return coordinateDistanceMeters(
    normalizeCoordinate(gps.lat),
    normalizeCoordinate(normalizeLongitude(gps.lon)),
    snapshot.lat,
    snapshot.lon
  ) <= coordinatePinPrecisionMeters;
}

function coordinateSnapshotKey(lat, lon) {
  return `${normalizeCoordinate(lat).toFixed(coordinateStorageDecimals)},${normalizeCoordinate(normalizeLongitude(lon)).toFixed(coordinateStorageDecimals)}`;
}

function findSnapshotAtCoordinates(lat, lon) {
  const normalizedLat = normalizeCoordinate(lat);
  const normalizedLon = normalizeCoordinate(normalizeLongitude(lon));
  return state.snapshots.find((snapshot) =>
    coordinateDistanceMeters(normalizedLat, normalizedLon, snapshot.lat, snapshot.lon) <= coordinatePinPrecisionMeters
  ) ?? null;
}

function setCoordinateInputs(lat, lon) {
  $(selectors.latInput).value = formatCoordinate(lat);
  $(selectors.lonInput).value = formatCoordinate(normalizeLongitude(lon));
}

function triggerMapSnapFeedback({ revealMap = true } = {}) {
  const stage = document.querySelector(".map-stage-shell");
  if (!stage) return;

  if (revealMap) {
    stage.scrollIntoView({
      behavior: reducedMotionQuery.matches ? "auto" : "smooth",
      block: "nearest"
    });
  }

  stage.classList.remove("is-snapping");
  void stage.offsetWidth;
  stage.classList.add("is-snapping");
  window.clearTimeout(state.mapSnapTimer);
  state.mapSnapTimer = window.setTimeout(() => {
    stage.classList.remove("is-snapping");
  }, 1150);
}

function focusSnapshotOnMap(snapshot, { centerMap = true, snap = true, revealMap = true, heightMeters = null } = {}) {
  if (!snapshot) return;

  placePin(snapshot.lat, snapshot.lon);
  drawSelectedOutlines(snapshot);
  renderPublicSitesForSnapshot(snapshot);
  if (snap && centerMap) triggerMapSnapFeedback({ revealMap });
  if (centerMap) {
    orientGlobeToLocation(snapshot.lat, snapshot.lon, getSnapshotFocusExtent(snapshot), {
      heightMeters: toFiniteNumber(heightMeters, getAutoCameraHeight(snapshot))
    });
  }
}

async function activateCoordinates(gps, {
  label = "coordinates",
  source = "gps coordinates",
  centerMap = true,
  revealMap = true,
  forceNew = false,
  markStep3Complete = false,
  focusStepAfterRender = "",
  focusSelectorAfterRender = ""
} = {}) {
  const normalizedGps = normalizeGps(gps);
  if (!normalizedGps) return null;

  setCoordinateInputs(normalizedGps.lat, normalizedGps.lon);
  clearLocationSearchState();
  updateResolution(`Snapping Step 2 map to ${label}.`, "ready");
  syncControls(getSelectedSnapshot());

  const resetSerial = state.resetSerial;
  const key = coordinateSnapshotKey(normalizedGps.lat, normalizedGps.lon);
  const existingSnapshot = forceNew ? null : findSnapshotAtCoordinates(normalizedGps.lat, normalizedGps.lon);
  if (existingSnapshot) {
    state.selectedSnapshotId = existingSnapshot.id;
    if (markStep3Complete && state.workflow.mapConfirmed) {
      state.workflow.step3SnapshotGenerated = true;
    }
    $(selectors.locationSearch).value = existingSnapshot.selectedLocation;
    $(selectors.locationSearch).setAttribute("aria-expanded", "false");
    setIntakeAgentTask("locate", "complete", `Step 02 centered on ${existingSnapshot.selectedLocation}.`, "Location resolved; lower panels are available.");
    setIntakeAgentTask("snapshot", "complete", `${existingSnapshot.country} snapshot opened from history.`);
    setIntakeAgentTask("sources", existingSnapshot.openSourceSources.length ? "complete" : "running", existingSnapshot.openSourceStatus || "Open-source enrichment queued.");
    saveState();
    focusSnapshotOnMap(existingSnapshot, { centerMap, snap: true, revealMap });
    renderApp();
    if (focusStepAfterRender) {
      focusWorkflowStep(focusStepAfterRender, { focusSelector: focusSelectorAfterRender });
    }
    return existingSnapshot;
  }
  if (!forceNew && state.pendingCoordinateSnaps.has(key)) return null;

  state.pendingCoordinateSnaps.add(key);
  try {
    return await createCoordinateSnapshot(normalizedGps.lat, normalizedGps.lon, source, centerMap, {
      revealMap,
      markStep3Complete,
      resetSerial,
      focusStepAfterRender,
      focusSelectorAfterRender
    });
  } finally {
    state.pendingCoordinateSnaps.delete(key);
  }
}

function renderSourceFiles() {
  const count = $(selectors.sourceFileCount);
  const list = $(selectors.sourceFileList);
  const selectedSnapshot = getSelectedSnapshot();
  count.textContent = `${state.sourceFiles.length} attached`;

  if (!state.sourceFiles.length) {
    list.innerHTML = '<p class="source-file-empty">No source files attached.</p>';
    return;
  }

  list.innerHTML = state.sourceFiles
    .map((file) => {
      const isMapped = gpsMatchesSnapshot(file.gps, selectedSnapshot);
      const gpsMarkup = file.gps
        ? `
          <button class="source-file-gps ${isMapped ? "is-selected" : ""}" type="button" data-use-source-gps-id="${escapeHtml(file.id)}" title="Load this GPS fix into Step 02">
            <span>${isMapped ? "Loaded" : "Load GPS"}</span>
            <strong>${escapeHtml(formatCoordinates(file.gps.lat, file.gps.lon))}</strong>
            <small>${escapeHtml(file.gps.source || "Photo GPS")}</small>
          </button>
        `
        : '<span class="source-file-muted">No GPS metadata</span>';
      const suggestedLocation = file.vision?.possibleLocations?.find((location) => location.name || location.country);
      const locationMarkup = suggestedLocation
        ? `
          <div class="source-file-location">
            <span>${escapeHtml([suggestedLocation.name, suggestedLocation.country].filter(Boolean).join(", "))}</span>
            <small>${escapeHtml(suggestedLocation.reason || `${suggestedLocation.confidence} confidence visual location clue.`)}</small>
          </div>
        `
        : "";
      const geoEvidenceMarkup = file.vision?.geoEvidence?.length
        ? `
          <div class="source-file-evidence">
            <strong>Open location evidence</strong>
            ${file.vision.geoEvidence.slice(0, 3).map((item) => `
              <a class="${item.thumbnailUrl ? "" : "has-no-thumb"}" href="${escapeHtml(item.url || "#")}" target="_blank" rel="noreferrer">
                ${item.thumbnailUrl ? `<img src="${escapeHtml(item.thumbnailUrl)}" alt="" loading="lazy" />` : ""}
                <span>
                  <b>${escapeHtml(item.title || item.database || "Known-location image")}</b>
                  <small>${escapeHtml([
                    item.confidence ? `${item.confidence} confidence` : "",
                    isValidLatLon(item.lat, item.lon) ? formatCoordinates(item.lat, item.lon) : "",
                    item.source || ""
                  ].filter(Boolean).join(" | "))}</small>
                </span>
              </a>
            `).join("")}
          </div>
        `
        : "";
      const vision = file.vision
        ? `
          <div class="source-file-vision">
            <strong>${escapeHtml(file.vision.what || file.vision.facilityType || "Visual analysis")}</strong>
            <span>${escapeHtml(file.vision.summary || "Analysis complete.")}</span>
            ${locationMarkup}
            ${geoEvidenceMarkup}
          </div>
        `
        : file.visionStatus
          ? `<p class="source-file-muted">${escapeHtml(file.visionStatus)}</p>`
          : file.visionError
            ? `<p class="source-file-error">${escapeHtml(file.visionError)}</p>`
            : "";
      return `
        <article class="source-file-item">
          <div class="source-file-main">
            <span class="source-file-kind">${escapeHtml(file.kind)}</span>
            <strong>${escapeHtml(file.name)}</strong>
            <small>${escapeHtml(formatFileSize(file.size))}</small>
            ${vision}
          </div>
          <div class="source-file-actions">
            ${gpsMarkup}
            <button class="source-file-remove" type="button" data-remove-source-file-id="${escapeHtml(file.id)}" aria-label="Remove ${escapeHtml(file.name)}">Remove</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function setSourceFileGps(file) {
  if (!file?.gps) return null;
  setCoordinateInputs(file.gps.lat, file.gps.lon);
  updateResolution(`GPS metadata loaded from ${file.name}.`, "ready");
  syncControls(getSelectedSnapshot());
  return file.gps;
}

function stageSourceFileGps(file, { revealMap = true } = {}) {
  if (!file?.gps) return null;
  const gps = setSourceFileGps(file);
  state.workflow.mapConfirmed = false;
  state.workflow.step3SnapshotGenerated = false;
  clearSelectedOutlines();
  renderPublicSitesForSnapshot(null);
  placePin(gps.lat, gps.lon);
  if (state.globe?.viewer) {
    if (revealMap) triggerMapSnapFeedback({ revealMap });
    orientGlobeToLocation(gps.lat, normalizeLongitude(gps.lon), pointToExtent(gps.lat, normalizeLongitude(gps.lon)), {
      heightMeters: searchCameraHeightMeters
    });
  }
  return gps;
}

async function activateSourceFileGps(file, { revealMap = true } = {}) {
  const gps = stageSourceFileGps(file, { revealMap });
  if (!gps) return null;
  setIntakeAgentTask(
    "locate",
    "waiting",
    `GPS ready from ${file.name}.`,
    "Confirm Step 02 before generating the snapshot."
  );
  updateResolution(`GPS loaded from ${file.name}. Confirm Step 02 before continuing.`, "ready");
  saveState();
  renderApp();
  focusWorkflowStep("02", { focusSelector: selectors.confirmMapStep });
  return gps;
}

function sourceFileKey(file) {
  return [normalize(file.name), file.size, file.lastModified].join("|");
}

async function addSourceFiles(files) {
  const incoming = Array.from(files ?? []);
  if (!incoming.length) return;

  updateResolution(`Inspecting ${incoming.length} source file${incoming.length === 1 ? "" : "s"}…`, "neutral");
  const existingKeys = new Set(state.sourceFiles.map(sourceFileKey));
  const added = [];

  const inspectedFiles = await Promise.all(incoming.map(async (file) => {
    const sourceFile = normalizeSourceFile({
      id: `source-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.name,
      type: file.type,
      kind: classifySourceFile(file),
      size: file.size,
      lastModified: file.lastModified,
      addedAt: new Date().toISOString(),
      gps: await extractImageGps(file),
      visionStatus: isImageFileLike(file) ? "Visual analysis queued." : ""
    });
    return { file, sourceFile };
  }));

  for (const { file, sourceFile } of inspectedFiles) {
    if (!sourceFile || existingKeys.has(sourceFileKey(sourceFile))) continue;
    existingKeys.add(sourceFileKey(sourceFile));
    state.sourceFileBlobs.set(sourceFile.id, file);
    added.push(sourceFile);
  }

  state.sourceFiles = [...added, ...state.sourceFiles].slice(0, 24);
  const hasImageDrop = added.some((file) => file.kind === "Photo");
  if (added.length) {
    state.workflow.mapConfirmed = false;
    state.workflow.step3SnapshotGenerated = false;
    startIntakeAgent(added);
  }
  const firstGpsFile = added.find((file) => file.gps);
  if (firstGpsFile) {
    stageSourceFileGps(firstGpsFile, { revealMap: false });
    updateResolution(`Photo GPS loaded from ${firstGpsFile.name}. Confirm Step 02 before continuing.`, "ready");
  } else {
    updateResolution(
      hasImageDrop
        ? "Photo source attached. Continue to Step 02 while image analysis runs."
        : `${added.length || 0} source file${added.length === 1 ? "" : "s"} attached.`,
      added.length ? "ready" : "neutral"
    );
  }
  saveState();
  renderApp();
  if (added.length) {
    focusWorkflowStep("02", { focusSelector: selectors.confirmMapStep });
  }
  added.filter(isImageFileLike).forEach((file) => {
    void analyzeSourceImage(file.id);
  });
}

function removeSourceFile(fileId) {
  if (!state.sourceFiles.some((file) => file.id === fileId)) return;
  resetAppToStartingPoint({
    statusMessage: "Source removed. Workflow reset to starting point."
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}

async function postVisionRequest(body) {
  const endpoints = [new URL("/api/vision/photo", window.location.origin).href];
  if (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") {
    const backendHost = window.location.hostname === "localhost" ? "localhost" : "127.0.0.1";
    endpoints.push(`http://${backendHost}:8787/api/vision/photo`);
  }

  let lastPayload = {};
  let lastStatus = 0;
  for (const endpoint of [...new Set(endpoints)]) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const contentType = response.headers.get("content-type") || "";
      const payload = contentType.includes("application/json") ? await response.json().catch(() => ({})) : {};
      lastPayload = payload;
      lastStatus = response.status;
      if (response.ok || response.status !== 404 && response.status !== 405 && response.status !== 501) {
        return { response, payload };
      }
    } catch (error) {
      lastPayload = { error: error.message };
    }
  }

  return {
    response: { ok: false, status: lastStatus },
    payload: lastPayload
  };
}

function extractPrintableStringsFromBuffer(buffer, minLength = 5, maxStrings = 160) {
  const bytes = new Uint8Array(buffer);
  const strings = [];
  let current = "";
  for (const byte of bytes) {
    if (byte >= 32 && byte <= 126) {
      current += String.fromCharCode(byte);
      continue;
    }
    if (current.length >= minLength) strings.push(current);
    current = "";
    if (strings.length >= maxStrings) break;
  }
  if (current.length >= minLength && strings.length < maxStrings) strings.push(current);
  return strings;
}

function getBrowserFileSignature(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "JPEG image";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "PNG image";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF") return "WEBP/RIFF image";
  if (String.fromCharCode(...bytes.slice(0, 3)) === "GIF") return "GIF image";
  return "Image file";
}

function buildBrowserLocationGazetteer() {
  const entries = [];
  state.profiles.forEach((profile) => {
    entries.push({ name: profile.country, country: profile.country, lat: profile.center.lat, lon: profile.center.lon });
    (profile.locations ?? []).forEach((location) => {
      entries.push({ name: location.label, country: profile.country, lat: location.lat, lon: location.lon });
    });
  });
  (state.dispositionIndex.entities ?? []).forEach((entity) => {
    entries.push({ name: entity.name, country: entity.name, lat: null, lon: null });
  });
  return entries.filter((entry) => entry.name);
}

function extractBrowserLocationCandidates(text, gps = null) {
  const normalizedText = normalize(text);
  const gazetteer = buildBrowserLocationGazetteer();
  const candidates = [];
  const seen = new Set();
  const addCandidate = (candidate) => {
    const key = normalize(`${candidate.name} ${candidate.country} ${candidate.lat} ${candidate.lon}`);
    if (!key || seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  };

  if (gps && isValidLatLon(gps.lat, gps.lon)) {
    addCandidate({
      name: "Image GPS coordinate",
      country: "",
      lat: gps.lat,
      lon: gps.lon,
      confidence: "high",
      reason: `${gps.source || "EXIF GPS"} metadata was present.`
    });
  }

  gazetteer
    .filter((entry) => normalize(entry.name).length >= 3 && normalizedText.includes(normalize(entry.name)))
    .slice(0, 8)
    .forEach((entry) => addCandidate({
      name: entry.name,
      country: entry.country,
      lat: Number.isFinite(Number(entry.lat)) ? Number(entry.lat) : null,
      lon: Number.isFinite(Number(entry.lon)) ? Number(entry.lon) : null,
      confidence: entry.lat != null && entry.lon != null ? "medium" : "low",
      reason: `Matched local text cue: ${entry.name}.`
    }));

  const country = candidates.find((candidate) => candidate.country)?.country || "";
  const blocked = new Set(["Exif", "JFIF", "JPEG", "TIFF", "Image", "Mock", "GPS", "Data", "Standard", "ASCII"]);
  for (const match of text.matchAll(/\b[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’-]{2,}(?:[\s,_-]+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’-]{2,}){0,2}\b/g)) {
    const phrase = match[0].replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    if (!phrase || phrase.split(/\s+/).some((part) => blocked.has(part))) continue;
    addCandidate({
      name: phrase.replace(/^Mock\s+/i, ""),
      country,
      lat: null,
      lon: null,
      confidence: "low",
      reason: "Capitalized text cue found in image bytes; geocode or analyst review required."
    });
  }

  return candidates.slice(0, 5);
}

async function analyzeImageInBrowserFallback(browserFile, file) {
  const buffer = await browserFile.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const strings = extractPrintableStringsFromBuffer(buffer);
  const text = [browserFile.name, file?.name, ...strings].filter(Boolean).join("\n");
  const possibleLocations = extractBrowserLocationCandidates(text, file?.gps);
  return {
    summary: `Browser forensic fallback scanned metadata, file signature, and ${strings.length} printable string cue${strings.length === 1 ? "" : "s"}.`,
    what: "Browser-side forensic image intake",
    facilityType: "",
    visualClues: [
      `File signature: ${getBrowserFileSignature(bytes)}`,
      strings.find((item) => /[A-Z][a-z]+/.test(item)) ? `String cue: ${strings.find((item) => /[A-Z][a-z]+/.test(item)).slice(0, 160)}` : ""
    ].filter(Boolean),
    possibleLocations,
    confidence: file?.gps ? "high" : possibleLocations.length ? "medium" : "low",
    cautions: [
      "Browser fallback cannot run OCR, binwalk, stegdetect, or local vision models; start the Node backend for full forensic tooling.",
      "Text cues are hints, not proof."
    ]
  };
}

function visionConfidenceRank(confidence) {
  const normalized = normalize(confidence);
  if (normalized === "high") return 3;
  if (normalized === "medium") return 2;
  if (normalized === "low") return 1;
  return 0;
}

function getBestVisionCoordinateCandidate(vision) {
  const candidates = (vision?.possibleLocations ?? [])
    .filter((location) => isValidLatLon(location.lat, location.lon))
    .map((location, index) => ({
      ...location,
      index,
      rank: visionConfidenceRank(location.confidence),
      evidenceBonus: /open place evidence|wikimedia commons|geotagged/i.test(`${location.source || ""} ${location.reason || ""}`) ? 0.3 : 0
    }))
    .filter((location) => location.rank >= 2);
  candidates.sort((left, right) =>
    (right.rank + right.evidenceBonus) - (left.rank + left.evidenceBonus)
    || left.index - right.index
  );
  return candidates[0] ?? null;
}

async function analyzeSourceImage(fileId) {
  const file = state.sourceFiles.find((entry) => entry.id === fileId);
  const input = $(selectors.sourceFileInput);
  const browserFile = state.sourceFileBlobs.get(fileId)
    ?? Array.from(input.files ?? []).find((entry) => sourceFileKey(entry) === sourceFileKey(file));
  if (!file || !browserFile || !isImageFileLike(browserFile)) return;

  setIntakeAgentTask("vision", "running", `Analyzing ${file.name} for metadata, text strings, and visual location clues.`, "Image forensics are running.");
  if (!file.gps) {
      setIntakeAgentTask("geoimage", "running", "Comparing interpreted cues with open location evidence.");
  }
  renderApp();

  try {
    const imageDataUrl = await fileToDataUrl(browserFile);
    const mimeType = getImageMimeType(browserFile) || file.type;
    const normalizedImageDataUrl = imageDataUrl.startsWith("data:image/")
      ? imageDataUrl
      : imageDataUrl.replace(/^data:[^;,]*;base64,/i, `data:${mimeType};base64,`);
    const { response, payload } = await postVisionRequest({
      fileName: file.name,
      mimeType,
      imageDataUrl: normalizedImageDataUrl,
      gps: file.gps
    });
    const target = state.sourceFiles.find((entry) => entry.id === fileId);
    if (!target) return;
    if (!response.ok) {
      target.visionStatus = "";
      target.visionError = "";
      target.vision = normalizeVisionAnalysis(await analyzeImageInBrowserFallback(browserFile, file));
    } else {
      target.visionStatus = "";
      target.visionError = "";
      target.vision = normalizeVisionAnalysis(payload.analysis);
    }
    const visualLocation = getBestVisionCoordinateCandidate(target.vision);
    if (visualLocation && !target.gps) {
      target.gps = normalizeGps({
        lat: visualLocation.lat,
        lon: visualLocation.lon,
        source: /open place evidence/i.test(`${visualLocation.source || ""} ${visualLocation.reason || ""}`)
          ? "Open place evidence estimate"
          : /wikimedia commons|geotagged/i.test(`${visualLocation.source || ""} ${visualLocation.reason || ""}`)
            ? "Open geotagged image estimate"
          : "Vision estimate"
      });
    } else if (!target.gps) {
      const cueLocation = target.vision?.possibleLocations?.find((location) => location.name || location.country);
      const geocodedGps = await geocodeVisionLocationCue(cueLocation);
      if (geocodedGps) target.gps = geocodedGps;
    }
    const cueCount = target.vision?.possibleLocations?.length ?? 0;
    const evidenceCount = target.vision?.geoEvidence?.length ?? 0;
    if (!file.gps) {
      setIntakeAgentTask(
        "geoimage",
        "complete",
        evidenceCount
          ? `${evidenceCount} open location evidence record${evidenceCount === 1 ? "" : "s"} checked.`
          : "Open location evidence returned no coordinate-bearing match."
      );
    }
    setIntakeAgentTask(
      "vision",
      "complete",
      cueCount
        ? `${cueCount} location cue${cueCount === 1 ? "" : "s"} extracted from ${file.name}.`
        : `Forensic pass complete for ${file.name}; no reliable visual location cue found.`
    );
    saveState();
    renderApp();
    const updatedTarget = state.sourceFiles.find((entry) => entry.id === fileId);
    const gpsKey = updatedTarget?.gps ? coordinateSnapshotKey(updatedTarget.gps.lat, updatedTarget.gps.lon) : "";
    if (updatedTarget?.gps && !findSnapshotAtCoordinates(updatedTarget.gps.lat, updatedTarget.gps.lon) && !state.pendingCoordinateSnaps.has(gpsKey)) {
      stageSourceFileGps(updatedTarget, { revealMap: false });
      setIntakeAgentTask("locate", "waiting", "Image-derived coordinates are ready in Step 02.", "Confirm the map before generating the snapshot.");
      updateResolution(`Image location loaded from ${updatedTarget.name}. Confirm Step 02 before continuing.`, "ready");
      saveState();
      renderApp();
      focusWorkflowStep("02", { focusSelector: selectors.confirmMapStep });
    } else if (!updatedTarget?.gps) {
      setIntakeAgentTask("locate", "blocked", "No usable GPS or geocoded visual cue was found.");
      setIntakeAgentTask("snapshot", "blocked", "Snapshot needs usable coordinates.");
      setIntakeAgentTask("sources", "blocked", "Open-source enrichment needs a generated snapshot.");
      renderApp();
    }
  } catch (error) {
    const target = state.sourceFiles.find((entry) => entry.id === fileId);
    if (!target) return;
    target.visionStatus = "";
    target.visionError = error.message || "Vision analysis failed.";
    setIntakeAgentTask("vision", "blocked", target.visionError, "Image forensics need review.");
    if (!file.gps) {
      setIntakeAgentTask("geoimage", "blocked", "Open location evidence lookup could not complete.");
    }
    saveState();
    renderApp();
  }
}

async function geocodeVisionLocationCue(location) {
  const name = clampText(location?.name, 120, "");
  const country = clampText(location?.country, 90, "");
  const queries = [
    [name, country].filter(Boolean).join(", "),
    name
  ].filter(Boolean);
  if (!queries.length) return null;
  const countryMatches = (resolved) => {
    if (!country) return true;
    const expected = normalize(country);
    const actual = normalize(`${resolved.countryName} ${resolved.countryCode}`);
    return Boolean(actual && expected && (actual.includes(expected) || expected.includes(actual)));
  };
  try {
    for (const query of queries) {
      const suggestions = await searchArcGisSuggestions(query);
      for (const suggestion of suggestions.slice(0, 4)) {
        const resolved = await resolveArcGisSuggestion(suggestion);
        if (!isValidLatLon(resolved.lat, resolved.lon) || !countryMatches(resolved)) continue;
        return normalizeGps({
          lat: resolved.lat,
          lon: resolved.lon,
          source: "Vision/geocoder estimate"
        });
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function extractImageGps(file) {
  if (!isImageFileLike(file)) return null;
  try {
    const buffer = await file.arrayBuffer();
    return parseExifGps(buffer);
  } catch {
    return null;
  }
}

function readAscii(view, offset, length) {
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(view.getUint8(offset + index));
  }
  return value.replace(/\0/g, "");
}

function parseExifGps(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 12 || view.getUint16(0) !== 0xffd8) return null;

  let offset = 2;
  while (offset + 4 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break;
    const marker = view.getUint8(offset + 1);
    const segmentLength = view.getUint16(offset + 2);
    const segmentStart = offset + 4;
    if (marker === 0xe1 && readAscii(view, segmentStart, 6) === "Exif") {
      return parseExifTiffGps(view, segmentStart + 6);
    }
    offset += 2 + segmentLength;
  }
  return null;
}

function parseExifTiffGps(view, tiffStart) {
  const endian = readAscii(view, tiffStart, 2);
  const littleEndian = endian === "II";
  if (!littleEndian && endian !== "MM") return null;
  const get16 = (offset) => view.getUint16(offset, littleEndian);
  const get32 = (offset) => view.getUint32(offset, littleEndian);
  const firstIfdOffset = get32(tiffStart + 4);
  const gpsIfdOffset = findIfdTagValue(view, tiffStart, tiffStart + firstIfdOffset, 0x8825, get16, get32);
  if (!gpsIfdOffset) return null;

  const gpsIfdStart = tiffStart + gpsIfdOffset;
  const latRef = findIfdTagValue(view, tiffStart, gpsIfdStart, 0x0001, get16, get32);
  const lat = findIfdTagValue(view, tiffStart, gpsIfdStart, 0x0002, get16, get32);
  const lonRef = findIfdTagValue(view, tiffStart, gpsIfdStart, 0x0003, get16, get32);
  const lon = findIfdTagValue(view, tiffStart, gpsIfdStart, 0x0004, get16, get32);
  if (!Array.isArray(lat) || !Array.isArray(lon)) return null;

  const latDecimal = gpsDmsToDecimal(lat, latRef);
  const lonDecimal = gpsDmsToDecimal(lon, lonRef);
  return normalizeGps({ lat: latDecimal, lon: lonDecimal, source: "EXIF GPS" });
}

function findIfdTagValue(view, tiffStart, ifdStart, tag, get16, get32) {
  if (ifdStart < 0 || ifdStart + 2 > view.byteLength) return null;
  const entryCount = get16(ifdStart);
  for (let index = 0; index < entryCount; index += 1) {
    const entry = ifdStart + 2 + index * 12;
    if (entry + 12 > view.byteLength || get16(entry) !== tag) continue;
    return readExifTagValue(view, tiffStart, entry, get16, get32);
  }
  return null;
}

function readExifTagValue(view, tiffStart, entry, get16, get32) {
  const type = get16(entry + 2);
  const count = get32(entry + 4);
  const valueOffset = entry + 8;
  const typeSizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  const byteLength = (typeSizes[type] ?? 1) * count;
  const dataOffset = byteLength <= 4 ? valueOffset : tiffStart + get32(valueOffset);
  if (dataOffset < 0 || dataOffset + byteLength > view.byteLength) return null;
  if (type === 2) return readAscii(view, dataOffset, count);
  if (type === 3) return count === 1 ? get16(dataOffset) : Array.from({ length: count }, (_, index) => get16(dataOffset + index * 2));
  if (type === 4) return count === 1 ? get32(dataOffset) : Array.from({ length: count }, (_, index) => get32(dataOffset + index * 4));
  if (type === 5) {
    return Array.from({ length: count }, (_, index) => {
      const numerator = get32(dataOffset + index * 8);
      const denominator = get32(dataOffset + index * 8 + 4);
      return denominator ? numerator / denominator : 0;
    });
  }
  return null;
}

function gpsDmsToDecimal(parts, ref) {
  const degrees = Number(parts[0] ?? 0);
  const minutes = Number(parts[1] ?? 0);
  const seconds = Number(parts[2] ?? 0);
  const sign = /^[SW]/i.test(String(ref ?? "")) ? -1 : 1;
  return sign * (degrees + minutes / 60 + seconds / 3600);
}

function renderWorkflowProgress(snapshot) {
  const hasMapReady = Boolean(state.globe?.viewer);
  const hasSnapshot = Boolean(snapshot);
  const hasWorkflowStart = state.sourceFiles.length > 0 || hasSnapshot;
  const hasMapSource = hasSnapshot && state.mapConfig.activeProvider && !/loading|unavailable/i.test(state.mapConfig.activeProvider);
  const hasMapConfirmed = Boolean(state.workflow.mapConfirmed);
  const hasStep3Generated = Boolean(hasSnapshot && state.workflow.step3SnapshotGenerated);
  const hasReasonedInput = Boolean(snapshot?.reasonedAdjustments?.length);
  const hasAction = state.actionLog.length > 0;
  const canLocate = hasWorkflowStart && hasMapReady && hasMapConfirmed;
  const canReason = hasStep3Generated && hasMapSource;
  const canInject = hasReasonedInput;
  const steps = {
    "01": hasWorkflowStart
      ? { state: "complete", label: "Complete" }
      : { state: "active", label: "Start" },
    "02": hasWorkflowStart
      ? { state: hasMapConfirmed ? "complete" : "active", label: hasMapConfirmed ? "Complete" : hasMapReady ? "Confirm" : "Loading" }
      : { state: "locked", label: "Locked" },
    "03": canLocate
      ? { state: hasStep3Generated ? "complete" : "active", label: hasStep3Generated ? "Complete" : "Next" }
      : { state: "locked", label: "Locked" },
    "04": canReason
      ? { state: hasReasonedInput ? "complete" : "active", label: hasReasonedInput ? "Complete" : "Next" }
      : { state: "locked", label: "Locked" },
    "05": canInject
      ? { state: hasAction ? "complete" : "active", label: hasAction ? "Complete" : "Next" }
      : { state: "locked", label: "Locked" }
  };

  document.querySelectorAll(".workflow-stage[data-step], .workflow-panel[data-step]").forEach((step) => {
    const progress = steps[step.dataset.step] ?? { state: "locked", label: "Locked" };
    const isLocked = progress.state === "locked";
    step.dataset.workflowState = progress.state;
    step.setAttribute("aria-disabled", String(isLocked));

    const heading = step.querySelector(".stage-heading, .panel-heading");
    if (heading) {
      let pill = heading.querySelector(".workflow-state-pill");
      if (!pill) {
        pill = document.createElement("span");
        pill.className = "workflow-state-pill";
        heading.append(pill);
      }
      pill.textContent = progress.label;
    }

    step.querySelectorAll("input, select, textarea, button").forEach((control) => {
      if (isLocked) {
        control.dataset.workflowLocked = "true";
        control.disabled = true;
        return;
      }
      if (control.dataset.workflowLocked === "true") {
        control.disabled = false;
        delete control.dataset.workflowLocked;
      }
    });
  });
}

function renderApp() {
  const snapshot = getSelectedSnapshot();
  $(selectors.summarySnapshots).textContent = String(state.snapshots.length);
  $(selectors.dataBoundary).textContent = state.mapConfig.activeProvider || "No live force disposition";

  renderIntakeAgent();
  renderSourceFiles();
  renderSnapshotSummary(snapshot);
  renderSnapshotDetail(snapshot);
  renderSnapshotTable();
  renderModelFields(snapshot);
  renderActionLog();
  renderMapControls();
  renderWorkflowProgress(snapshot);
  syncControls(snapshot);
}

function renderMapControls() {
  const providerSelect = $(selectors.mapProvider);
  const providers = getAllMapProviders();
  const groups = providers.reduce((accumulator, provider) => {
    const group = provider.group || "Other";
    accumulator[group] = [...(accumulator[group] ?? []), provider];
    return accumulator;
  }, {});

  providerSelect.innerHTML = Object.entries(groups)
    .map(([group, groupProviders]) => `
      <optgroup label="${escapeHtml(group)}">
        ${groupProviders.map((provider) => `<option value="${escapeHtml(provider.id)}">${escapeHtml(provider.label)}</option>`).join("")}
      </optgroup>
    `)
    .join("");

  if (!providers.some((provider) => provider.id === state.mapConfig.provider)) {
    state.mapConfig.provider = defaultMapProvider;
  }
  providerSelect.value = state.mapConfig.provider;
  $(selectors.mapSourcePill).textContent = state.mapConfig.activeProvider || "Cesium";
  $(selectors.mapSourceStatus).textContent = state.mapConfig.status || "";
}

function toggleCustomProviderForm(show) {
  const panel = $(selectors.customMapSource);
  const button = $(selectors.addMapProvider);
  panel.hidden = !show;
  button.setAttribute("aria-expanded", String(show));
  if (show) {
    $(selectors.customProviderName).focus();
  }
}

function saveCustomProviderFromForm() {
  const provider = normalizeCustomMapProvider({
    id: `custom-${Date.now()}`,
    label: $(selectors.customProviderName).value,
    kind: $(selectors.customProviderType).value,
    url: $(selectors.customProviderUrl).value
  });

  if (!provider) {
    updateMapStatus("Add a source name and URL before saving.", state.mapConfig.activeProvider);
    return;
  }

  state.customMapProviders = [provider, ...state.customMapProviders].slice(0, 20);
  state.mapConfig.provider = provider.id;
  saveCustomMapProviders();
  saveMapConfig();
  $(selectors.customProviderName).value = "";
  $(selectors.customProviderUrl).value = "";
  toggleCustomProviderForm(false);
  renderMapControls();
  updateMapStatus(`Saved custom map source: ${provider.label}.`, provider.label);
  void applyMapProvider().then(() => {
    void loadCountryBorders();
  });
}

function syncControls(snapshot) {
  const hasSnapshots = state.snapshots.length > 0;
  const hasLocationPanelValues = Boolean(
    $(selectors.locationSearch).value.trim()
      || $(selectors.latInput).value.trim()
      || $(selectors.lonInput).value.trim()
      || state.locationResults.length
      || state.globe?.pin
  );
  $("#clear-snapshots").disabled = !hasSnapshots && !hasLocationPanelValues;
  $("#reason-note").disabled = !snapshot;
  const confirmMap = $(selectors.confirmMapStep);
  if (confirmMap) {
    const mapStageLocked = document.querySelector(".map-stage-shell")?.dataset.workflowState === "locked";
    confirmMap.disabled = mapStageLocked || !state.globe?.viewer || state.workflow.mapConfirmed;
  }
}

function focusWorkflowStep(stepNumber, { focusSelector = "" } = {}) {
  const step = document.querySelector(`[data-step="${stepNumber}"]`);
  if (!step) return;
  const scrollToStep = () => {
    const targetTop = Math.max(0, step.getBoundingClientRect().top + window.scrollY - 12);
    window.scrollTo({
      top: targetTop,
      behavior: reducedMotionQuery.matches ? "auto" : "smooth",
    });
  };
  window.requestAnimationFrame(scrollToStep);
  window.setTimeout(scrollToStep, reducedMotionQuery.matches ? 0 : 180);
  window.setTimeout(scrollToStep, reducedMotionQuery.matches ? 0 : 620);
  if (!focusSelector) return;
  window.setTimeout(() => {
    const control = document.querySelector(focusSelector);
    if (control && !control.disabled) {
      control.focus();
    }
  }, reducedMotionQuery.matches ? 0 : 220);
}

function confirmMapStep() {
  if (!state.globe?.viewer) {
    updateResolution("Step 02 map is still loading.", "neutral");
    return;
  }

  state.workflow.mapConfirmed = true;
  saveState();
  renderApp();
  updateResolution("Step 02 confirmed. Continue to Step 03.", "ready");
  focusWorkflowStep("03", { focusSelector: selectors.locationSearch });
}

function renderSnapshotSummary(snapshot) {
  if (!snapshot) {
    $(selectors.selectedLocationTitle).textContent = "Location";
    $(selectors.selectedPlace).textContent = "No location selected";
    $(selectors.selectedCoordinates).textContent = "Awaiting geospatial input.";
    $(selectors.snapshotTitle).textContent = "Select a Location";
    $(selectors.summaryCountry).textContent = "--";
    $(selectors.summaryForces).textContent = "--";
    $(selectors.summaryHardware).textContent = "--";
    updateResolution("Awaiting input", "neutral");
    return;
  }

  $(selectors.selectedLocationTitle).textContent = formatOverlayLocationTitle(snapshot);
  $(selectors.selectedPlace).textContent = snapshot.selectedLocation;
  const locationContext = [snapshot.placeKind, snapshot.adminArea || snapshot.country, formatCoordinates(snapshot.lat, snapshot.lon)]
    .filter(Boolean)
    .join(" | ");
  $(selectors.selectedCoordinates).textContent = locationContext;
  $(selectors.snapshotTitle).textContent = `${snapshot.country} Snapshot`;
  $(selectors.summaryCountry).textContent = snapshot.country;
  $(selectors.summaryForces).textContent = String(snapshot.militaryForces.length);
  $(selectors.summaryHardware).textContent = String(snapshot.hardware.length);
  updateResolution(snapshot.resolutionStatus, snapshot.statusClass);
}

function formatOverlayLocationTitle(snapshot) {
  const coordinateLabel = formatCoordinates(snapshot.lat, snapshot.lon);
  const selected = clampText(snapshot.selectedLocation, 120, "");
  if (selected && normalize(selected) !== normalize(coordinateLabel)) return selected;
  const adminParts = String(snapshot.adminArea || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return adminParts[0] || snapshot.country || "Location";
}

function renderList(items) {
  const safeItems = toTextList(items, ["No data available."]);
  return `<ul class="list-stack">${safeItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderSourceList(sources) {
  const safeSources = toSourceList(sources);
  if (!safeSources.length) return renderList(["Open-source references are still loading."]);

  return `
    <ul class="list-stack source-list">
      ${safeSources
        .map((source) => {
          const title = escapeHtml(source.title);
          const url = escapeHtml(source.url);
          const summary = source.summary ? `<small>${escapeHtml(source.summary)}</small>` : "";
          const label = url ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${title}</a>` : `<span>${title}</span>`;
          return `<li>${label}${summary}</li>`;
        })
        .join("")}
    </ul>
  `;
}

function renderSnapshotPreview(items, mode) {
  if (mode === "sources") {
    const safeSources = toSourceList(items);
    if (!safeSources.length) return "Open-source references are loading.";
    return `${safeSources.length} source candidates`;
  }

  const safeItems = toTextList(items, ["No data available."]);
  return clampText(safeItems[0], 118, "No data available.");
}

function renderSnapshotSection(title, items, mode) {
  const itemCount = mode === "sources" ? toSourceList(items).length : toTextList(items, []).length;
  return `
    <details class="detail-section compact-detail">
      <summary>
        <span>
          <strong>${escapeHtml(title)}</strong>
          <small>${escapeHtml(renderSnapshotPreview(items, mode))}</small>
        </span>
        <em>${itemCount || 1}</em>
      </summary>
      <div class="detail-section-body">
        ${mode === "sources" ? renderSourceList(items) : renderList(items)}
      </div>
    </details>
  `;
}

function getSnapshotDispositionMeta(snapshot) {
  const entity = getDispositionEntityForSnapshot(snapshot);
  const equipment = entity ? state.dispositionIndex.equipmentByEntity?.[entity.entityId] : null;
  const coverage = entity ? state.dispositionIndex.coverageByEntity?.[entity.entityId] : null;
  const referenceCount = entity ? (state.dispositionIndex.publicReferencesByEntity?.[entity.entityId] ?? []).length : 0;
  const databaseMeta = state.dispositionIndex.metadata ?? {};
  const entityLabel = entity
    ? `${entity.name}${entity.iso3 ? ` (${entity.iso3})` : ""}`
    : "No military disposition database match";
  const equipmentLabel = equipment?.totalRows
    ? `${equipment.totalRows} public equipment rows`
    : "No reviewed equipment rows";
  const coverageLabel = entity ? formatCoverageSummary(coverage) : "No country/entity coverage matrix attached.";
  const databaseLabel = databaseMeta.entityCount && databaseMeta.equipmentRows
    ? `${databaseMeta.entityCount} entities / ${databaseMeta.equipmentRows} public equipment rows`
    : "Military disposition database";

  return {
    entity,
    entityLabel,
    equipmentLabel,
    coverageLabel,
    referenceCount,
    databaseLabel
  };
}

function buildSnapshotDatabaseCorrelation(snapshot, meta) {
  if (!meta.entity) {
    return [
      "No country/entity record matched in the military disposition database for this snapshot.",
      "Military fields remain unresolved until a database-backed country or entity match is available."
    ];
  }

  return [
    `Matched database entity: ${meta.entityLabel}.`,
    `Database corpus: ${meta.databaseLabel}.`,
    `Coverage: ${meta.coverageLabel}`,
    `Equipment correlation: ${meta.equipmentLabel}; ${meta.referenceCount} public reference link${meta.referenceCount === 1 ? "" : "s"} indexed.`,
    "All military fields below are public, country/entity-level abstractions from the disposition database and linked references."
  ];
}

function renderSnapshotDetail(snapshot) {
  const target = $(selectors.snapshotDetail);
  if (!snapshot) {
    target.className = "detail-grid empty-state";
    target.innerHTML = `
      <div class="empty-dossier">
        <span>NO SNAPSHOT</span>
        <strong>Generate a location snapshot to populate the dossier.</strong>
      </div>
    `;
    return;
  }

  const dispositionMeta = getSnapshotDispositionMeta(snapshot);
  const sections = [
    ["Database Match", buildSnapshotDatabaseCorrelation(snapshot, dispositionMeta)],
    ["Location", [snapshot.selectedLocation, snapshot.placeKind, snapshot.adminArea || snapshot.region, `${snapshot.country} (${snapshot.iso3})`]],
    ["Military Forces", snapshot.militaryForces],
    ["Force Disposition", snapshot.forceDisposition],
    ["Physical Hardware", snapshot.hardware],
    ["Personnel Formations", snapshot.personnelFormations],
    ["Weapons Systems", snapshot.weaponsSystems],
    ["Reasoned Inputs", snapshot.reasonedAdjustments.length ? snapshot.reasonedAdjustments : ["No analyst or LLM-derived adjustments yet."]],
    ["Open-Source Queries", snapshot.openSourceQueries.length ? snapshot.openSourceQueries : [snapshot.openSourceStatus]],
    ["Open-Source Sources", snapshot.openSourceSources, "sources"],
    ["Data Boundary", [snapshot.sourceNote]]
  ];
  const countryFlag = getCountryFlag(snapshot);
  const matchedCountryLabel = snapshot.country && !normalize(snapshot.country).includes("unresolved")
    ? snapshot.country
    : snapshot.selectedLocation;
  const sourceCount = snapshot.openSourceSources.length;
  const previousDisclosure = target.querySelector(".snapshot-database-disclosure");
  const preserveOpen = previousDisclosure?.open && previousDisclosure.dataset.snapshotId === snapshot.id;
  const openAttribute = preserveOpen ? " open" : "";
  if (!countryFlag) void ensureCountryFlag(snapshot);

  target.className = "snapshot-detail-shell";
  target.innerHTML = `
    <details class="snapshot-database-disclosure" data-snapshot-id="${escapeHtml(snapshot.id)}"${openAttribute}>
      <summary class="snapshot-database-summary">
        <span class="snapshot-database-title">
          <span class="snapshot-database-kicker">Military Disposition DB</span>
          <strong>${escapeHtml(dispositionMeta.entityLabel)}</strong>
          <small>${escapeHtml(`${dispositionMeta.equipmentLabel} / ${sourceCount} linked source${sourceCount === 1 ? "" : "s"}`)}</small>
        </span>
        <span class="snapshot-database-toggle" aria-hidden="true">
          <span class="toggle-open">Expand</span>
          <span class="toggle-close">Collapse</span>
        </span>
      </summary>
      <div class="snapshot-database-content">
        <article class="snapshot-dossier">
          <div class="dossier-stamp" aria-label="${escapeHtml(matchedCountryLabel)}">
            ${countryFlag ? `<span class="dossier-flag" role="img" aria-label="${escapeHtml(snapshot.country)} flag">${escapeHtml(countryFlag)}</span>` : ""}
          </div>
          <div class="dossier-main">
            <p class="eyebrow">Active Dossier</p>
            <h3>${escapeHtml(snapshot.selectedLocation)}</h3>
            <dl>
              <div>
                <dt>Region</dt>
                <dd>${escapeHtml(snapshot.region)}</dd>
              </div>
              <div>
                <dt>Coordinates</dt>
                <dd>${escapeHtml(formatCoordinates(snapshot.lat, snapshot.lon))}</dd>
              </div>
              <div>
                <dt>Database</dt>
                <dd>${escapeHtml(dispositionMeta.databaseLabel)}</dd>
              </div>
              <div class="dossier-sources-cell">
                <dt>Sources</dt>
                <dd>
                  <details class="dossier-sources">
                    <summary>
                      <span>${escapeHtml(String(sourceCount))}</span>
                      <em>${sourceCount ? "View Sources" : "Loading"}</em>
                    </summary>
                    <div class="dossier-source-list">
                      ${renderSourceList(snapshot.openSourceSources)}
                    </div>
                  </details>
                </dd>
              </div>
            </dl>
          </div>
        </article>
        <div class="detail-grid detail-grid-nested">
          ${sections.map(([title, items, mode]) => renderSnapshotSection(title, items, mode)).join("")}
        </div>
      </div>
    </details>
  `;
}

function wikipediaPageUrl(title) {
  return `${wikipediaPageBaseUrl}${encodeURIComponent(title.replaceAll(" ", "_"))}`;
}

function formatQueryTemplate(template, snapshot) {
  const country = snapshot?.country === "United States" ? "United States" : snapshot?.country;
  const place = clampText(String(snapshot?.selectedLocation ?? "").split(",")[0], 120, "");
  return template
    .replaceAll("{country}", country)
    .replaceAll("{place}", place || country)
    .trim();
}

function addOpenSourceQueryRecord(records, domain, query) {
  const safeQuery = clampText(query, 180, "");
  if (!safeQuery) return;
  records.push({
    domainKey: domain.key,
    domainLabel: domain.label,
    query: safeQuery
  });
}

function buildOpenSourceQueryRecords(snapshot) {
  const country = snapshot?.country;
  if (!country || normalize(country).includes("unresolved")) return [];

  const domains = getModelDomains();
  const records = [];
  domains.forEach((domain) => {
    const templates = domainOpenSourceTemplates[domain.key] ?? [`${domain.label} {country}`];
    templates.forEach((template) => addOpenSourceQueryRecord(records, domain, formatQueryTemplate(template, snapshot)));
  });

  const place = clampText(String(snapshot.selectedLocation ?? "").split(",")[0], 120, "");
  const placeIsCountry = normalize(place) === normalize(country);
  const placeKind = normalize(snapshot.placeKind);
  if (place && !placeIsCountry && !placeKind.includes("coordinate")) {
    const geographyDomain = domains.find((domain) => domain.key === "geographic_and_environmental_constraints");
    const logisticsDomain = domains.find((domain) => domain.key === "logistics_and_sustainment");
    const politicalDomain = domains.find((domain) => domain.key === "political_and_legal_constraints");
    if (geographyDomain) {
      addOpenSourceQueryRecord(records, geographyDomain, `${place} geography`);
      addOpenSourceQueryRecord(records, geographyDomain, `${place} climate`);
    }
    if (logisticsDomain) {
      addOpenSourceQueryRecord(records, logisticsDomain, `${place} transport`);
      addOpenSourceQueryRecord(records, logisticsDomain, `${place} infrastructure`);
      addOpenSourceQueryRecord(records, logisticsDomain, `${place} military base`);
      addOpenSourceQueryRecord(records, logisticsDomain, `${place} air base`);
      addOpenSourceQueryRecord(records, logisticsDomain, `${place} barracks`);
      addOpenSourceQueryRecord(records, logisticsDomain, `${country} military bases`);
    }
    if (politicalDomain && /region|state|province|city|location/.test(placeKind)) {
      addOpenSourceQueryRecord(records, politicalDomain, `${place} government`);
      addOpenSourceQueryRecord(records, politicalDomain, `${place} ministry of defence`);
    }
    const orderDomain = domains.find((domain) => domain.key === "order_of_battle");
    if (orderDomain) {
      addOpenSourceQueryRecord(records, orderDomain, `${place} armed forces`);
      addOpenSourceQueryRecord(records, orderDomain, `${place} military`);
    }
  }

  const seen = new Set();
  return records
    .filter((record) => {
      const key = normalize(record.query);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 60);
}

function buildOpenSourceQueries(snapshot) {
  return buildOpenSourceQueryRecords(snapshot).map((record) => record.query);
}

async function searchWikipediaOpenSource(query) {
  const url = new URL(wikipediaApiUrl);
  url.searchParams.set("origin", "*");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("list", "search");
  url.searchParams.set("srnamespace", "0");
  url.searchParams.set("srlimit", "4");
  url.searchParams.set("srsearch", query);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Wikipedia returned ${response.status}`);
  const payload = await response.json();
  const results = Array.isArray(payload.query?.search) ? payload.query.search : [];
  return results
    .map((result) => ({
      title: clampText(result.title, 140),
      url: wikipediaPageUrl(result.title),
      summary: clampText(stripHtml(result.snippet) || `Wikipedia result for "${query}".`, 320)
    }))
    .filter((source) => isRelevantOpenSourceResult(query, source))
    .slice(0, 3);
}

function stripHtml(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, "")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&amp;", "&")
    .trim();
}

function meaningfulQueryTokens(query) {
  const stopwords = new Set(["and", "the", "for", "from", "with", "into", "list"]);
  return String(query ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !stopwords.has(token));
}

function locationTokensFromQuery(query) {
  const text = String(query ?? "").toLowerCase();
  const prepositionParts = text.split(/\b(?:of|in)\s+/);
  if (prepositionParts.length > 1) {
    return meaningfulQueryTokens(prepositionParts[prepositionParts.length - 1])
      .filter((token) => !openSourceTopicWords.has(token))
      .slice(0, 3);
  }
  const tokens = meaningfulQueryTokens(query);
  const topicIndex = tokens.findIndex((token) => openSourceTopicWords.has(token));
  return (topicIndex > 0 ? tokens.slice(0, topicIndex) : tokens.slice(0, 1)).slice(0, 3);
}

function isRelevantOpenSourceResult(query, source) {
  const tokens = meaningfulQueryTokens(query);
  if (!tokens.length) return true;
  const title = normalize(source.title);
  const locationTokens = locationTokensFromQuery(query);
  if (locationTokens.length && !locationTokens.some((token) => title.includes(token))) return false;
  const haystack = normalize(`${source.title} ${source.summary}`);
  const matches = tokens.filter((token) => haystack.includes(token)).length;
  const threshold = tokens.length >= 4 ? 3 : Math.min(2, tokens.length);
  return matches >= threshold;
}

function dedupeSources(sources) {
  const seen = new Set();
  return sources.filter((source) => {
    const key = normalize(source.title || source.url);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function appendUniqueLine(list, line) {
  const safeLine = clampText(line, 320);
  if (!safeLine || list.some((item) => normalize(item) === normalize(safeLine))) return list;
  return [...list, safeLine];
}

function formatSourceTitles(sources, pattern, fallbackPattern = pattern) {
  const matched = sources.filter((source) => pattern.test(source.title) || fallbackPattern.test(source.summary));
  const titles = matched.map((source) => source.title).filter(Boolean).slice(0, 5);
  return titles.length ? titles.join(", ") : "";
}

function applyOpenSourceHints(snapshot, sources) {
  const forceTitles = formatSourceTitles(sources, /\b(armed forces|military|army|navy|air force)\b/i);
  const hardwareTitles = formatSourceTitles(sources, /\b(equipment|vehicle|tank|aircraft|ship|weapons?)\b/i);
  const personnelTitles = formatSourceTitles(sources, /\b(ranks?|personnel|army|armed forces)\b/i);
  const weaponsTitles = formatSourceTitles(sources, /\b(weapons?|equipment|air defense|artillery|missile)\b/i);

  if (forceTitles) {
    snapshot.militaryForces = appendUniqueLine(snapshot.militaryForces, `Open-source reference candidates: ${forceTitles}.`);
  }
  if (hardwareTitles) {
    snapshot.hardware = appendUniqueLine(snapshot.hardware, `Open-source equipment references: ${hardwareTitles}.`);
  }
  if (personnelTitles) {
    snapshot.personnelFormations = appendUniqueLine(snapshot.personnelFormations, `Open-source personnel/structure references: ${personnelTitles}.`);
  }
  if (weaponsTitles) {
    snapshot.weaponsSystems = appendUniqueLine(snapshot.weaponsSystems, `Open-source weapons-system references: ${weaponsTitles}.`);
  }

  snapshot.forceDisposition = appendUniqueLine(
    snapshot.forceDisposition,
    "Open-source enrichment remains country-level and does not infer live unit disposition, readiness, targeting, or movement."
  );
}

function applyOpenSourceModel(snapshot, sources) {
  snapshot.model = normalizeModel(snapshot.model);
  getModelDomains().forEach((domain) => {
    const modelKey = getModelKeyForDomain(domain);
    if (!modelKey) return;
    const domainSources = sources.filter((source) => normalize(source.domainKey) === normalize(domain.key));
    snapshot.model[modelKey] = buildGeneratedModelText(snapshot, domain, domainSources);
  });
}

async function enrichSnapshotFromOpenSources(snapshotId) {
  let snapshot = state.snapshots.find((entry) => entry.id === snapshotId);
  if (!snapshot) return;

  const queryRecords = buildOpenSourceQueryRecords(snapshot);
  const dispositionSources = buildDispositionSourcesForEntity(getDispositionEntityForSnapshot(snapshot));
  const dispositionQueries = buildDispositionSnapshotContext(snapshot).queries;
  snapshot.openSourceQueries = [...dispositionQueries, ...queryRecords.map((record) => record.query)]
    .filter((query, index, list) => query && list.indexOf(query) === index)
    .slice(0, 80);

  if (!queryRecords.length) {
    snapshot.openSourceStatus = "Open-source enrichment needs a resolved country.";
    setIntakeAgentTask("sources", "blocked", "Open-source enrichment needs a resolved country.");
    saveState();
    if (state.selectedSnapshotId === snapshotId) renderApp();
    return;
  }

  snapshot.openSourceStatus = `Searching Wikipedia across ${getModelDomains().length} extractable model sections...`;
  setIntakeAgentTask("sources", "running", `Searching ${queryRecords.length} public-source query paths.`);
  saveState();
  if (state.selectedSnapshotId === snapshotId) renderApp();

  const gatheredSourceGroups = await Promise.all(
    queryRecords.map(async (record) => {
      try {
        const results = await searchWikipediaOpenSource(record.query);
        return results.map((source) => ({
          ...source,
          domainKey: record.domainKey,
          domainLabel: record.domainLabel,
          query: record.query
        }));
      } catch {
        return [];
      }
    })
  );
  const gatheredSources = gatheredSourceGroups.flat();

  snapshot = state.snapshots.find((entry) => entry.id === snapshotId);
  if (!snapshot) return;

  const sources = dedupeSources([...dispositionSources, ...gatheredSources]).slice(0, 80);
  snapshot.openSourceSources = sources;
  snapshot.openSourceStatus = sources.length
    ? `Found ${sources.length} public source candidates, including disposition DB references.`
    : "No Wikipedia source candidates were returned for the generated queries.";
  applyOpenSourceHints(snapshot, sources);
  applyOpenSourceModel(snapshot, sources);
  setIntakeAgentTask(
    "sources",
    sources.length ? "complete" : "blocked",
    sources.length
      ? `${sources.length} public source candidates linked into the lower panels.`
      : "No public source candidates returned for this snapshot."
  );
  saveState();
  if (state.selectedSnapshotId === snapshotId) renderApp();
}

function renderSnapshotTable() {
  const rows = state.snapshots
    .map((snapshot) => {
      const date = new Date(snapshot.timestamp);
      const time = Number.isNaN(date.getTime())
        ? snapshot.timestamp
        : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const isSelected = snapshot.id === state.selectedSnapshotId;
      return `
        <article class="snapshot-list-item" role="listitem">
          <button class="snapshot-card-option ${isSelected ? "is-selected" : ""}" type="button" data-snapshot-id="${escapeHtml(snapshot.id)}" aria-current="${isSelected ? "true" : "false"}" aria-label="Open ${escapeHtml(snapshot.selectedLocation)} snapshot">
            <span class="snapshot-card-time">${escapeHtml(time)}</span>
            <span class="snapshot-card-body">
              <strong>${escapeHtml(snapshot.selectedLocation)}</strong>
              <small>${escapeHtml(snapshot.country)} / ${escapeHtml(snapshot.placeKind)}</small>
            </span>
          </button>
          <button class="snapshot-delete-button" type="button" data-delete-snapshot-id="${escapeHtml(snapshot.id)}" aria-label="Delete ${escapeHtml(snapshot.selectedLocation)} from search history" title="Delete search history item">Delete</button>
        </article>
      `;
    })
    .join("");

  $(selectors.snapshotTable).innerHTML = rows || '<p class="snapshot-empty" role="status">No saved snapshots.</p>';
  $(selectors.snapshotTable).querySelectorAll("[data-snapshot-id]").forEach((row) => {
    const openSnapshot = () => {
      state.selectedSnapshotId = row.dataset.snapshotId;
      saveState();
      const snapshot = getSelectedSnapshot();
      if (snapshot) {
        placePin(snapshot.lat, snapshot.lon);
        drawSelectedOutlines(snapshot);
        renderPublicSitesForSnapshot(snapshot);
        orientGlobeToLocation(snapshot.lat, snapshot.lon, getSnapshotFocusExtent(snapshot), {
          heightMeters: getAutoCameraHeight(snapshot)
        });
      }
      renderApp();
    };
    row.addEventListener("click", openSnapshot);
  });
  $(selectors.snapshotTable).querySelectorAll("[data-delete-snapshot-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteSnapshotHistoryItem(button.dataset.deleteSnapshotId);
    });
  });
}

function deleteSnapshotHistoryItem(snapshotId) {
  const snapshotIndex = state.snapshots.findIndex((snapshot) => snapshot.id === snapshotId);
  if (snapshotIndex === -1) return;

  const wasSelected = state.selectedSnapshotId === snapshotId;
  state.snapshots = state.snapshots.filter((snapshot) => snapshot.id !== snapshotId);
  if (wasSelected) {
    state.selectedSnapshotId = state.snapshots[Math.min(snapshotIndex, state.snapshots.length - 1)]?.id ?? "";
  }
  saveState();

  const snapshot = getSelectedSnapshot();
  if (snapshot) {
    placePin(snapshot.lat, snapshot.lon);
    drawSelectedOutlines(snapshot);
    renderPublicSitesForSnapshot(snapshot);
    orientGlobeToLocation(snapshot.lat, snapshot.lon, getSnapshotFocusExtent(snapshot), {
      heightMeters: getAutoCameraHeight(snapshot)
    });
  } else {
    removePin();
    clearSelectedOutlines();
    clearPublicSites();
    resetGlobeToDefaultView({ animate: true });
  }
  renderApp();
}

function renderModelFields(snapshot) {
  const target = $(selectors.modelFields);
  const domains = getModelDomains();
  if (!domains.length) {
    target.innerHTML = '<p class="empty-state compact">No model taxonomy loaded.</p>';
    return;
  }

  if (!state.selectedModelSectionKey || !domains.some((domain) => domain.key === state.selectedModelSectionKey)) {
    state.selectedModelSectionKey = domains[0].key;
  }

  const selectedDomain = domains.find((domain) => domain.key === state.selectedModelSectionKey) ?? domains[0];
  const buttons = domains
    .map((domain, index) => {
      const section = buildModelSectionSummary(snapshot, domain);
      const value = section.summary;
      const isActive = domain.key === selectedDomain.key;
      const sourceCount = section.sources.length;
      const variableCount = section.variables.length;
      return `
        <button class="model-field model-field-button ${isActive ? "is-active" : ""}" type="button" data-model-section="${escapeHtml(domain.key)}">
          <span class="model-field-top">
            <strong>${escapeHtml(domain.label)}</strong>
            <em>${String(index + 1).padStart(2, "0")}</em>
          </span>
          <span>${escapeHtml(clampText(value, 170, domain.primaryUse))}</span>
          <small>${sourceCount} sources / ${variableCount} variables</small>
        </button>
      `;
    })
    .join("");

  target.innerHTML = `
    <div class="model-field-list">${buttons}</div>
    ${renderModelSectionDetail(snapshot, selectedDomain)}
  `;

  target.querySelectorAll("[data-model-section]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedModelSectionKey = button.dataset.modelSection;
      renderModelFields(getSelectedSnapshot());
    });
  });

  target.querySelectorAll("[data-model-parameter-group]").forEach((button) => {
    button.addEventListener("click", () => {
      const domainKey = button.dataset.modelDomainKey || state.selectedModelSectionKey;
      state.selectedModelParameterGroups[domainKey] = button.dataset.modelParameterGroup;
      renderModelFields(getSelectedSnapshot());
    });
  });
}

function renderParameterGroupDrilldown(snapshot, domain, section) {
  if (!section.parameterGroups.length) {
    return '<p class="empty-state compact">No parameter groups loaded.</p>';
  }

  const selectedGroup = getSelectedParameterGroupForDomain(domain, section);
  state.selectedModelParameterGroups[domain.key] = selectedGroup;
  const selectedGroupKey = normalizeParameterGroup(selectedGroup);
  const label = formatParameterGroupLabel(selectedGroup);
  const groupVariables = getVariablesForParameterGroup(section.variables, selectedGroup);
  const sourceCount = section.sources.length;
  const sourceBasis = sourceTitlesForText(section.sources, 3) || snapshot?.openSourceStatus || "Baseline taxonomy only.";
  const detailSummary = groupVariables.length
    ? `${label} has ${groupVariables.length} mapped training variable${groupVariables.length === 1 ? "" : "s"} for this section. Use the examples below as structured fields for scenario inputs, adjudication notes, and CSV extraction.`
    : `${label} is an extractable bucket for ${domain.primaryUse || domain.label}. No mapped training variables are loaded for this group yet, so treat it as a summary-level field until a source or analyst note refines it.`;
  const variableExamples = groupVariables.slice(0, 4);
  const variableMarkup = variableExamples.length
    ? `
      <ul class="parameter-variable-list">
        ${variableExamples
          .map((variable) => {
            const focus = variable.decision_focus ? `<span>Focus: ${escapeHtml(variable.decision_focus)}</span>` : "";
            const action = variable.controller_action ? `<small>${escapeHtml(variable.controller_action)}</small>` : "";
            const detail = variable.parameter_detail ? `<small>${escapeHtml(variable.parameter_detail)}</small>` : "";
            return `
              <li>
                <strong>${escapeHtml(variable.training_variable_inject || variable.id || label)}</strong>
                ${focus}
                ${action}
                ${detail}
              </li>
            `;
          })
          .join("")}
      </ul>
    `
    : '<p class="empty-state compact">No variable examples are mapped to this parameter group yet.</p>';
  const groupButtons = section.parameterGroups
    .map((group) => {
      const isActive = normalizeParameterGroup(group) === selectedGroupKey;
      const groupLabel = formatParameterGroupLabel(group);
      const mappedCount = getVariablesForParameterGroup(section.variables, group).length;
      const countLabel = mappedCount ? `, ${mappedCount} variables` : "";
      return `
        <button class="chip parameter-chip-button ${isActive ? "is-active" : ""}" type="button" role="tab" aria-selected="${isActive ? "true" : "false"}" data-model-domain-key="${escapeHtml(domain.key)}" data-model-parameter-group="${escapeHtml(group)}" title="${escapeHtml(groupLabel + countLabel)}">
          ${escapeHtml(groupLabel)}
        </button>
      `;
    })
    .join("");

  return `
    <div class="model-parameter-drilldown">
      <div class="chip-row model-parameter-tabs" role="tablist" aria-label="${escapeHtml(domain.label)} parameter groups">
        ${groupButtons}
      </div>
      <section class="model-parameter-detail" aria-live="polite">
        <div class="model-parameter-heading">
          <div>
            <p class="eyebrow">Parameter Detail</p>
            <h4>${escapeHtml(label)}</h4>
          </div>
          <span class="status-pill neutral">${escapeHtml(String(groupVariables.length))} variables</span>
        </div>
        <p>${escapeHtml(detailSummary)}</p>
        <dl class="model-parameter-meta">
          <div>
            <dt>Primary Use</dt>
            <dd>${escapeHtml(domain.primaryUse || "Section-level model coverage")}</dd>
          </div>
          <div>
            <dt>Sources</dt>
            <dd>${escapeHtml(sourceCount ? `${sourceCount} candidates: ${sourceBasis}` : sourceBasis)}</dd>
          </div>
        </dl>
        ${variableMarkup}
      </section>
    </div>
  `;
}

function renderModelSectionDetail(snapshot, domain) {
  const section = buildModelSectionSummary(snapshot, domain);
  const statusClass = snapshot && section.sources.length ? "ready" : snapshot ? "caution" : "neutral";
  const sourceLabel = `${section.sources.length} source${section.sources.length === 1 ? "" : "s"}`;
  const sourceItems = section.sources.slice(0, 7);
  const variableItems = section.variables.slice(0, 6);
  const sourceMarkup = sourceItems.length
    ? renderSourceList(sourceItems)
    : renderList([snapshot?.openSourceStatus || "Awaiting open-source enrichment."]);
  const variableMarkup = variableItems.length
    ? renderList(
        variableItems.map((variable) => {
          const focus = variable.decision_focus ? ` Decision focus: ${variable.decision_focus}.` : "";
          return `${variable.id || "Variable"}: ${variable.training_variable_inject || variable.parameter_group}.${focus}`;
        })
      )
    : renderList(["No training-variable examples loaded for this section."]);

  return `
    <article class="model-section-detail">
      <div class="model-section-heading">
        <div>
          <p class="eyebrow">Section Summary</p>
          <h3>${escapeHtml(domain.label)}</h3>
        </div>
        <span class="status-pill ${statusClass}">${escapeHtml(sourceLabel)}</span>
      </div>
      <p class="model-generated-summary">${escapeHtml(section.summary)}</p>
      ${renderParameterGroupDrilldown(snapshot, domain, section)}
      <div class="model-detail-grid compact">
        <section class="model-detail-card">
          <h4>Open Sources</h4>
          ${sourceMarkup}
        </section>
        <section class="model-detail-card">
          <h4>Training Variables</h4>
          ${variableMarkup}
        </section>
      </div>
    </article>
  `;
}

function reasonFromAnalystNote() {
  const snapshot = getSelectedSnapshot();
  const rawNote = $(selectors.analystNote).value.trim();
  const note = clampText(rawNote, maxAnalystNoteLength);

  if (!snapshot) {
    $(selectors.reasoningOutput).innerHTML = '<div class="reason-card">Select a location before adding reasoning inputs.</div>';
    return;
  }

  if (!note) {
    $(selectors.reasoningOutput).innerHTML = '<div class="reason-card">Add an analyst note first.</div>';
    return;
  }

  const rules = [
    ["logistics", ["logistics", "supply", "fuel", "ammo", "port", "rail", "road", "maintenance"], "Logistics friction raised; sustainment and movement timing should be reviewed."],
    ["c4i", ["c2", "c4i", "communications", "jamming", "network", "satellite", "command"], "C4I dependency detected; order latency and degraded communications should be modeled."],
    ["terrain", ["mountain", "urban", "desert", "jungle", "river", "weather", "mud", "snow"], "Environmental modifier detected; movement and sensor assumptions should be adjusted."],
    ["morale", ["morale", "fatigue", "casualties", "discipline", "desertion", "training"], "Personnel factor detected; morale, fatigue, and training quality should influence effectiveness."],
    ["legal", ["roe", "legal", "loac", "civilian", "mandate", "alliance", "treaty"], "Political/legal constraint detected; action preconditions and approval latency should be tightened."],
    ["air defense", ["air defense", "aa", "sam", "surface to air", "missile defense", "counter uas", "drone"], "Air-defense or counter-UAS factor detected; engagement envelopes should remain abstracted."],
    ["intelligence", ["intel", "isr", "deception", "fog", "signals", "ew", "spoof"], "Intelligence and deception factor detected; introduce noisy or delayed observations."]
  ];

  const lower = note.toLowerCase();
  const matches = rules.filter(([, terms]) => terms.some((term) => lower.includes(term)));
  const tags = matches.map(([tag]) => tag);
  const adjustments = matches.map(([, , adjustment]) => adjustment);
  const fallback = "No strong taxonomy hit; retained as human context for manual review.";

  const record = {
    at: new Date().toISOString(),
    note,
    tags,
    adjustments: adjustments.length ? adjustments : [fallback]
  };

  snapshot.humanInputs = [note, ...(snapshot.humanInputs ?? [])].slice(0, 10);
  snapshot.reasonedAdjustments = [...record.adjustments, ...(snapshot.reasonedAdjustments ?? [])].slice(0, 10);
  state.selectedSnapshotId = snapshot.id;
  saveState();

  $(selectors.reasoningOutput).innerHTML = `
    <div class="reason-card">
      <strong>${escapeHtml(tags.length ? `Detected: ${tags.join(", ")}` : "Manual review")}</strong>
      <p>${escapeHtml(record.adjustments.join(" "))}</p>
    </div>
  `;
  $(selectors.analystNote).value = "";
  renderApp();
}

function formatDispositionPrecondition(value) {
  return titleCase(String(value ?? "").replace(/[_-]+/g, " "));
}

function flattenDispositionPreconditions(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(flattenDispositionPreconditions);
  if (typeof value === "object") {
    return Object.entries(value).flatMap(([key, entry]) => {
      if (entry === true) return [formatDispositionPrecondition(key)];
      if (entry === false || entry == null) return [];
      if (Array.isArray(entry)) return entry.map(formatDispositionPrecondition);
      if (typeof entry === "object") return flattenDispositionPreconditions(entry);
      return [`${formatDispositionPrecondition(key)}: ${formatDispositionPrecondition(entry)}`];
    });
  }
  return [formatDispositionPrecondition(value)];
}

function getDispositionActionTemplate(actionText) {
  const normalizedAction = normalize(actionText);
  const action = state.dispositionIndex.actionTypes.find((entry) => normalize(entry.name) === normalizedAction);
  if (!action) return null;
  const guarded = /\b(attack|sortie|defense|combat|strike|fire)\b/.test(normalizedAction);
  const preconditions = flattenDispositionPreconditions(action.preconditions).slice(0, 8);
  return {
    label: action.name,
    status: guarded ? "Guarded abstraction" : "Disposition DB template",
    statusClass: guarded ? "caution" : "ready",
    summary: clampText(`${action.description} ${action.safety_boundary || ""}`, 280, "Logged from disposition database action template."),
    preconditions: preconditions.length ? preconditions : ["Human review", "Legal or policy check", "Model preconditions"]
  };
}

function getActionTemplate(type) {
  const actionText = clampText(type, 120, "Custom scenario action");
  const normalizedAction = normalize(actionText);
  const dispositionTemplate = getDispositionActionTemplate(actionText);
  if (dispositionTemplate) return dispositionTemplate;
  const templates = {
    "deploy-peacekeepers": {
      label: "Deploy peacekeepers",
      status: "Queued",
      statusClass: "ready",
      summary: "Adds stabilization pressure, mandate dependency, logistics demand, and civilian protection metrics.",
      preconditions: ["Legal mandate", "Host-nation or coalition access", "Sustainment path", "Rules of engagement"]
    },
    resupply: {
      label: "Resupply or repair",
      status: "Queued",
      statusClass: "ready",
      summary: "Raises sustainment, readiness recovery, and transport-load variables without combat effects.",
      preconditions: ["Route availability", "Fuel and transport capacity", "Maintenance teams", "Medical support"]
    },
    mobilize: {
      label: "Mobilize reserves",
      status: "Queued",
      statusClass: "caution",
      summary: "Adds personnel capacity over time while increasing training, equipment, and political cost variables.",
      preconditions: ["Legal authority", "Recall system", "Training pipeline", "Equipment availability"]
    },
    ceasefire: {
      label: "Propose cease-fire",
      status: "Queued",
      statusClass: "ready",
      summary: "Adds de-escalation, monitoring, verification, and compliance variables.",
      preconditions: ["Negotiation channel", "Monitoring mechanism", "Compliance incentives", "Public messaging"]
    },
    blockade: {
      label: "Impose blockade",
      status: "Guarded abstraction",
      statusClass: "caution",
      summary: "Logged as strategic maritime pressure only; the app does not generate routes, targets, timing, or interdiction plans.",
      preconditions: ["Legal review", "Humanitarian exemptions", "Alliance consultation", "Escalation assessment"]
    },
    strike: {
      label: "Launch strike",
      status: "Restricted abstraction",
      statusClass: "restricted",
      summary: "Logged as escalation pressure only; no targets, weapons pairing, routing, timing, or damage estimates are generated.",
      preconditions: ["Civilian authority", "LOAC review", "Escalation review", "Human approval"]
    }
  };

  const directMatch = Object.entries(templates).find(([key, template]) => {
    return normalizedAction === normalize(key) || normalizedAction === normalize(template.label);
  });
  if (directMatch) return directMatch[1];

  if (/\b(strike|attack|bomb|target|fire|assault)\b/.test(normalizedAction)) {
    return {
      label: actionText,
      status: "Restricted abstraction",
      statusClass: "restricted",
      summary: "Logged as escalation pressure only; no targets, weapons pairing, routing, timing, or damage estimates are generated.",
      preconditions: ["Civilian authority", "LOAC review", "Escalation review", "Human approval"]
    };
  }

  if (/\b(blockade|interdict|quarantine)\b/.test(normalizedAction)) {
    return {
      label: actionText,
      status: "Guarded abstraction",
      statusClass: "caution",
      summary: "Logged as strategic pressure only; operational routes, timing, and interdiction details are not generated.",
      preconditions: ["Legal review", "Humanitarian exemptions", "Alliance consultation", "Escalation assessment"]
    };
  }

  return {
    label: actionText,
    status: "Custom scenario action",
    statusClass: "ready",
    summary: "Adds a custom starting point to the scenario log for human review and model calibration.",
    preconditions: ["Human review", "Legal or policy check", "Logistics feasibility", "Command approval"]
  };
}

function injectAction() {
  const snapshot = getSelectedSnapshot();
  const action = clampText($(selectors.actionType).value, 120, "Custom scenario action");
  const objective = clampText($(selectors.actionObjective).value, 180, "No objective entered");
  const template = getActionTemplate(action);
  const entry = {
    id: `action-${Date.now()}`,
    at: new Date().toISOString(),
    country: snapshot?.country ?? "No selected country",
    location: snapshot?.selectedLocation ?? "No selected location",
    action,
    status: template.status,
    statusClass: template.statusClass,
    objective,
    summary: template.summary,
    preconditions: template.preconditions
  };

  state.actionLog = [normalizeActionEntry(entry), ...state.actionLog].slice(0, maxActionLogEntries);
  $(selectors.actionType).value = "";
  $(selectors.actionObjective).value = "";
  saveState();
  renderApp();
}

function renderActionLog() {
  if (!state.actionLog.length) {
    $(selectors.actionLog).innerHTML = '<p class="empty-state compact">No scenario actions logged yet.</p>';
    return;
  }

  $(selectors.actionLog).innerHTML = state.actionLog
    .map(
      (entry) => `
        <article class="action-card">
          <span class="status-pill ${sanitizeStatusClass(entry.statusClass)}">${escapeHtml(entry.status)}</span>
          <h3>${escapeHtml(entry.action)}</h3>
          <p>${escapeHtml(entry.country)} / ${escapeHtml(entry.objective)}</p>
          <p>${escapeHtml(entry.summary)}</p>
          <div class="chip-row">
            ${entry.preconditions.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join("")}
          </div>
        </article>
      `
    )
    .join("");
}

function resetIntakeAgentState() {
  state.intakeAgent = {
    status: "idle",
    current: "Waiting for source input.",
    startedAt: "",
    updatedAt: "",
    fileCount: 0,
    tasks: []
  };
}

function clearWorkflowInputFields() {
  [
    selectors.locationSearch,
    selectors.latInput,
    selectors.lonInput,
    selectors.analystNote,
    selectors.actionType,
    selectors.actionObjective,
    selectors.customProviderName,
    selectors.customProviderUrl
  ].forEach((selector) => {
    $(selector).value = "";
  });
  $(selectors.customProviderType).value = "raster";
  $(selectors.reasoningOutput).innerHTML = "";
  $(selectors.sourceFileInput).value = "";
  document.querySelector(".map-stage-shell")?.classList.remove("is-snapping");
  document.querySelector(selectors.sourceDropzone)?.classList.remove("is-dragging");
  toggleCustomProviderForm(false);
}

function resetAppToStartingPoint({ statusMessage = "Workflow reset to starting point." } = {}) {
  state.resetSerial += 1;
  clearLocationSearchState({ clearInput: true });
  window.clearTimeout(state.coordinateAutoTimer);
  window.clearTimeout(state.mapSnapTimer);
  state.pendingCoordinateSnaps.clear();
  clearWorkflowInputFields();
  state.sourceFiles = [];
  state.sourceFileBlobs.clear();
  state.snapshots = [];
  state.selectedSnapshotId = "";
  state.actionLog = [];
  state.locationResults = [];
  state.selectedModelParameterGroups = {};
  state.workflow.mapConfirmed = false;
  state.workflow.step3SnapshotGenerated = false;
  resetIntakeAgentState();
  saveState();
  removePin();
  clearSelectedOutlines();
  clearPublicSites();
  hideCountryHover();
  resetGlobeToDefaultView({ animate: true, duration: 0.28 });
  renderPublicSitesForSnapshot(null);
  renderApp();
  updateResolution(statusMessage, "neutral");
}

function clearSnapshots() {
  clearLocationSearchState({ clearInput: true });
  window.clearTimeout(state.coordinateAutoTimer);
  $(selectors.latInput).value = "";
  $(selectors.lonInput).value = "";
  state.snapshots = [];
  state.selectedSnapshotId = "";
  state.workflow.mapConfirmed = false;
  state.workflow.step3SnapshotGenerated = false;
  state.intakeAgent = {
    status: "idle",
    current: "Waiting for source input.",
    startedAt: "",
    updatedAt: "",
    fileCount: 0,
    tasks: []
  };
  saveState();
  removePin();
  clearSelectedOutlines();
  clearPublicSites();
  hideCountryHover();
  resetGlobeToDefaultView({ animate: true });
  renderPublicSitesForSnapshot(null);
  renderApp();
}

function getCesium() {
  return window.Cesium;
}

function updateMapStatus(status, activeProvider = state.mapConfig.activeProvider || "Cesium") {
  state.mapConfig.status = status;
  state.mapConfig.activeProvider = activeProvider;
  try {
    renderMapControls();
    $(selectors.dataBoundary).textContent = activeProvider;
  } catch {
    // UI may not be ready during initial script evaluation.
  }
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = publicSiteFetchTimeoutMs) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

function waitForCesium(timeoutMs = 7000) {
  const startedAt = performance.now();
  return new Promise((resolve) => {
    const check = () => {
      if (getCesium()) {
        resolve(getCesium());
        return;
      }
      if (performance.now() - startedAt > timeoutMs) {
        resolve(null);
        return;
      }
      window.setTimeout(check, 80);
    };
    check();
  });
}

function renderMapFailure(title, detail = "") {
  const container = $(selectors.mapContainer);
  container.closest(".globe-stage")?.classList.add("has-map-failure");
  const failure = document.createElement("div");
  const label = document.createElement("small");
  const heading = document.createElement("strong");
  const message = document.createElement("span");
  failure.className = "map-failure";
  label.textContent = "Manual coordinate mode";
  heading.textContent = title;
  message.textContent = detail;
  failure.append(label);
  failure.append(heading);
  if (detail) failure.append(message);
  container.replaceChildren(failure);
  $(selectors.mapScale).hidden = true;
}

async function initGlobe() {
  const Cesium = await waitForCesium();
  const container = $(selectors.mapContainer);
  container.closest(".globe-stage")?.classList.remove("has-map-failure");

  if (!Cesium) {
    renderMapFailure("Map unavailable", "Cesium could not be loaded.");
    updateMapStatus("Cesium library unavailable.", "Map unavailable");
    return;
  }

  container.innerHTML = "";
  if (state.mapConfig.cesiumIonToken) {
    Cesium.Ion.defaultAccessToken = state.mapConfig.cesiumIonToken;
  }

  let viewer;
  try {
    viewer = new Cesium.Viewer(container, {
      animation: false,
      baseLayer: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      vrButton: false,
      shouldAnimate: true,
      requestRenderMode: false,
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      contextOptions: {
        webgl: {
          preserveDrawingBuffer: true
        }
      }
    });
  } catch (error) {
    renderMapFailure("Map unavailable", "WebGL could not start in this browser, but snapshots and exports still work.");
    updateMapStatus(`WebGL unavailable: ${error.message}`, "Map unavailable");
    return;
  }

  viewer.imageryLayers.removeAll();
  viewer.scene.globe.depthTestAgainstTerrain = true;
  viewer.scene.globe.enableLighting = true;
  viewer.scene.skyAtmosphere.show = true;
  viewer.scene.screenSpaceCameraController.minimumZoomDistance = 250;
  viewer.scene.screenSpaceCameraController.maximumZoomDistance = 30000000;
  viewer.scene.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(defaultGlobeView.lon, defaultGlobeView.lat, defaultGlobeView.heightMeters)
  });

  state.globe = {
    Cesium,
    viewer,
    handler: null,
    hoverMoveHandler: null,
    hoverLeaveHandler: null,
    pointerDownHandler: null,
    pointerMoveHandler: null,
    pointerUpHandler: null,
    pointerDownPosition: null,
    isDragging: false,
    justDraggedUntil: 0,
    lastSelectAt: 0,
    pin: null,
    tileset: null,
    borderDataSource: null,
    borderLineEntities: [],
    selectedCountryDataSource: null,
    selectedCountryLines: [],
    cityOutline: null,
    publicSiteEntities: [],
    publicSiteAllSites: [],
    publicSiteSnapshotId: "",
    publicSiteVisibleKey: "",
    publicSiteRenderToken: "",
    publicSiteVisibilityRaf: 0,
    countryGeoJson: null,
    borderLoadPromise: null,
    imageryRequestToken: "",
    scaleRaf: 0
  };

  attachCesiumClickHandler();
  attachScaleUpdater();
  scheduleScaleUpdate();
  await applyMapProvider();
  void loadCountryBorders();
}

function resetGlobeToDefaultView({ animate = false, duration = 0.65 } = {}) {
  const { Cesium, viewer } = state.globe ?? {};
  if (!Cesium || !viewer) return;
  const destination = Cesium.Cartesian3.fromDegrees(defaultGlobeView.lon, defaultGlobeView.lat, defaultGlobeView.heightMeters);

  if (animate && !reducedMotionQuery.matches) {
    viewer.camera.flyTo({
      destination,
      duration,
      complete: scheduleScaleUpdate
    });
    return;
  }

  viewer.camera.setView({ destination });
  scheduleScaleUpdate();
}

function attachCesiumClickHandler() {
  const { Cesium, viewer } = state.globe ?? {};
  if (!Cesium || !viewer) return;

  state.globe.handler?.destroy();
  state.globe.handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  state.globe.handler.setInputAction((movement) => {
    handleMapClick(movement.position);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  state.globe.hoverMoveHandler = (event) => handleMapHover(event);
  state.globe.hoverLeaveHandler = () => {
    viewer.scene.canvas.classList.remove("poi-hover");
    hideCountryHover();
    hidePublicSiteHover(120);
  };
  viewer.scene.canvas.addEventListener("mousemove", state.globe.hoverMoveHandler);
  viewer.scene.canvas.addEventListener("mouseleave", state.globe.hoverLeaveHandler);

  state.globe.pointerDownHandler = (event) => {
    state.globe.pointerDownPosition = { x: event.clientX, y: event.clientY };
    state.globe.isDragging = false;
  };
  state.globe.pointerMoveHandler = (event) => {
    const start = state.globe.pointerDownPosition;
    if (!start) return;
    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (distance < 8) return;
    state.globe.isDragging = true;
    viewer.scene.canvas.classList.add("dragging");
    hideCountryHover();
    hidePublicSiteHover();
  };
  state.globe.pointerUpHandler = () => {
    if (state.globe.isDragging) {
      state.globe.justDraggedUntil = performance.now() + 350;
    }
    state.globe.pointerDownPosition = null;
    state.globe.isDragging = false;
    viewer.scene.canvas.classList.remove("dragging");
  };
  viewer.scene.canvas.addEventListener("pointerdown", state.globe.pointerDownHandler);
  viewer.scene.canvas.addEventListener("pointermove", state.globe.pointerMoveHandler);
  viewer.scene.canvas.addEventListener("pointerup", state.globe.pointerUpHandler);
  viewer.scene.canvas.addEventListener("pointercancel", state.globe.pointerUpHandler);

  const controller = viewer.scene.screenSpaceCameraController;
  controller.enableRotate = true;
  controller.enableTranslate = true;
  controller.enableZoom = true;
  controller.enableTilt = true;
  controller.enableLook = true;
  controller.inertiaSpin = 0.82;
  controller.inertiaTranslate = 0.72;
  controller.inertiaZoom = 0.7;
}

function attachScaleUpdater() {
  const { viewer } = state.globe ?? {};
  if (!viewer) return;
  viewer.camera.changed.addEventListener(() => {
    scheduleScaleUpdate();
    schedulePublicSiteVisibilityUpdate();
  });
  window.addEventListener("resize", scheduleScaleUpdate);
}

async function selectMapPosition(position, source = "map click") {
  const { Cesium } = state.globe ?? {};
  if (!Cesium) return;
  if (state.globe.isDragging || performance.now() < (state.globe.justDraggedUntil ?? 0)) return;
  const now = performance.now();
  if (now - (state.globe.lastSelectAt ?? 0) < 250) return;
  state.globe.lastSelectAt = now;

  const cartesian = pickCesiumPosition(position);
  if (!cartesian) return;

  const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
  const lat = Cesium.Math.toDegrees(cartographic.latitude);
  const lon = normalizeLongitude(Cesium.Math.toDegrees(cartographic.longitude));
  if (!isValidLatLon(lat, lon)) return;

  await createCoordinateSnapshot(lat, lon, source, source !== "map click");
}

function centerSelectedLocation() {
  const snapshot = getSelectedSnapshot();
  if (!snapshot) {
    resetGlobeToDefaultView({ animate: true });
    renderPublicSitesForSnapshot(null);
    updateResolution("Centered on a broad Europe overview. Add a location to pinpoint the map.", "neutral");
    return;
  }
  drawSelectedOutlines(snapshot);
  renderPublicSitesForSnapshot(snapshot);
  orientGlobeToLocation(snapshot.lat, snapshot.lon, getSnapshotFocusExtent(snapshot), {
    heightMeters: getAutoCameraHeight(snapshot)
  });
}

function zoomMap(multiplier) {
  const { viewer } = state.globe ?? {};
  if (!viewer) return;
  const height = viewer.camera.positionCartographic.height;
  if (multiplier < 1) {
    viewer.camera.zoomIn(Math.max(250, height * (1 - multiplier)));
    scheduleScaleUpdate();
    schedulePublicSiteVisibilityUpdate();
    return;
  }
  viewer.camera.zoomOut(Math.max(250, height * (multiplier - 1)));
  scheduleScaleUpdate();
  schedulePublicSiteVisibilityUpdate();
}

function handleMapClick(position) {
  const { viewer } = state.globe ?? {};
  if (!viewer) return;
  if (state.globe.isDragging || performance.now() < (state.globe.justDraggedUntil ?? 0)) return;

  const site = findPublicSiteFromPick(position, 30);
  if (!site) return;

  const rect = viewer.scene.canvas.getBoundingClientRect();
  state.pinnedPublicSiteId = site.id;
  hideCountryHover();
  showPublicSiteHover(site, {
    clientX: rect.left + position.x,
    clientY: rect.top + position.y
  }, { pinned: true });
}

function positionCountryHover(event) {
  const bubble = $(selectors.countryHover);
  const stage = $(selectors.mapContainer).parentElement;
  const rect = stage.getBoundingClientRect();
  const left = Math.max(10, Math.min(rect.width - 180, event.clientX - rect.left + 14));
  const top = Math.max(10, Math.min(rect.height - 44, event.clientY - rect.top + 14));
  bubble.style.left = `${left}px`;
  bubble.style.top = `${top}px`;
}

function hideCountryHover() {
  window.clearTimeout(state.hoverTimer);
  $(selectors.countryHover).hidden = true;
}

function positionFloatingCard(target, event, width = 270, height = 180) {
  const stage = $(selectors.mapContainer).parentElement;
  const rect = stage.getBoundingClientRect();
  const left = Math.max(10, Math.min(rect.width - width - 10, event.clientX - rect.left + 16));
  const top = Math.max(10, Math.min(rect.height - height - 10, event.clientY - rect.top + 16));
  target.style.left = `${left}px`;
  target.style.top = `${top}px`;
}

function hidePublicSiteHover(delay = 0, options = {}) {
  if (options.force) state.pinnedPublicSiteId = "";
  if (state.pinnedPublicSiteId && !options.force) return;
  window.clearTimeout(state.siteHoverTimer);
  state.siteHoverTimer = window.setTimeout(() => {
    $(selectors.publicSiteHover).hidden = true;
  }, delay);
}

function getPublicSiteFromEntity(entity) {
  if (!entity) return null;
  if (entity.publicSite) return entity.publicSite;
  const siteId = entity.publicSiteId;
  return siteId ? state.publicSites.find((site) => site.id === siteId) ?? null : null;
}

function getPublicSiteEntityScreenPosition(entity) {
  const { Cesium, viewer } = state.globe ?? {};
  if (!Cesium || !viewer || !entity?.position?.getValue) return null;
  const cartesian = entity.position.getValue(viewer.clock.currentTime);
  if (!Cesium.defined(cartesian)) return null;

  const transforms = Cesium.SceneTransforms ?? {};
  const transform = transforms.worldToWindowCoordinates ?? transforms.wgs84ToWindowCoordinates;
  const position = transform?.(viewer.scene, cartesian)
    ?? viewer.scene.cartesianToCanvasCoordinates?.(cartesian);

  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return null;
  return position;
}

function findNearestPublicSite(position, radiusPx = 30) {
  const entities = state.globe?.publicSiteEntities ?? [];
  let nearestSite = null;
  let nearestDistance = radiusPx;

  entities.forEach((entity) => {
    const site = getPublicSiteFromEntity(entity);
    const screenPosition = getPublicSiteEntityScreenPosition(entity);
    if (!site || !screenPosition) return;

    const distance = Math.hypot(screenPosition.x - position.x, screenPosition.y - position.y);
    if (distance > nearestDistance) return;
    nearestDistance = distance;
    nearestSite = site;
  });

  return nearestSite;
}

function findPublicSiteFromPick(position, radiusPx = 0) {
  const { viewer } = state.globe ?? {};
  if (!viewer) return null;
  const picked = viewer.scene.pick(position);
  const pickedSite = getPublicSiteFromEntity(picked?.id ?? picked?.primitive?.id);
  return pickedSite ?? (radiusPx ? findNearestPublicSite(position, radiusPx) : null);
}

function siteTypeStyle(type) {
  return publicSiteTypeStyles[type] ?? publicSiteTypeStyles.other;
}

function renderPublicSiteHover(site, metadata = null) {
  const style = siteTypeStyle(site.type);
  const summary = metadata?.summary || site.summary || "Public Wikipedia reference for this known location.";
  const linkLabel = publicSiteReferenceLabel(site);
  const thumbnail = metadata?.thumbnail || site.thumbnail;
  const coordinateText = formatCoordinates(site.lat, site.lon);
  const image = thumbnail
    ? `<img src="${escapeHtml(thumbnail)}" alt="" loading="lazy" />`
    : `<div class="site-hover-placeholder">No image</div>`;

  return `
    <button class="site-hover-close" type="button" data-site-hover-close aria-label="Close point of interest">x</button>
    <div class="site-hover-image">${image}</div>
    <div class="site-hover-body">
      <span class="site-type" style="--site-color: ${escapeHtml(style.color)}">${escapeHtml(style.label)}</span>
      <strong>${escapeHtml(site.name)}</strong>
      <small>${escapeHtml(coordinateText)} | Source precision varies</small>
      <p>${escapeHtml(clampText(summary, 180))}</p>
      <a href="${escapeHtml(site.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(linkLabel)}</a>
    </div>
  `;
}

async function fetchPublicSiteMetadata(site) {
  const cached = state.publicSiteMetadataCache.get(site.id);
  if (cached) return cached;

  try {
    const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(site.pageTitle)}`);
    if (!response.ok) throw new Error(`Wikipedia returned ${response.status}`);
    const payload = await response.json();
    const metadata = {
      summary: clampText(payload.extract, 260, ""),
      thumbnail: clampText(payload.thumbnail?.source, 600, ""),
      url: clampText(payload.content_urls?.desktop?.page, 600, site.url)
    };
    state.publicSiteMetadataCache.set(site.id, metadata);
    site.summary = metadata.summary;
    site.thumbnail = metadata.thumbnail;
    site.url = metadata.url || site.url;
    return metadata;
  } catch {
    const fallback = { summary: "", thumbnail: "", url: site.url };
    state.publicSiteMetadataCache.set(site.id, fallback);
    return fallback;
  }
}

function showPublicSiteHover(site, event, options = {}) {
  if (state.pinnedPublicSiteId && state.pinnedPublicSiteId !== site.id && !options.pinned) return;
  if (options.pinned) state.pinnedPublicSiteId = site.id;

  const card = $(selectors.publicSiteHover);
  window.clearTimeout(state.siteHoverTimer);
  positionFloatingCard(card, event);
  card.hidden = false;
  card.innerHTML = renderPublicSiteHover(site);

  const serial = (state.siteHoverSerial += 1);
  void fetchPublicSiteMetadata(site).then((metadata) => {
    if (serial !== state.siteHoverSerial || card.hidden) return;
    card.innerHTML = renderPublicSiteHover(site, metadata);
  });
}

function handlePublicSiteHover(event, position) {
  const site = findPublicSiteFromPick(position);
  const { viewer } = state.globe ?? {};
  if (!site) {
    viewer?.scene.canvas.classList.remove("poi-hover");
    hidePublicSiteHover(220);
    return false;
  }

  viewer?.scene.canvas.classList.add("poi-hover");
  hideCountryHover();
  showPublicSiteHover(site, event);
  return true;
}

function handleMapHover(event) {
  const { Cesium, viewer } = state.globe ?? {};
  if (!Cesium || !viewer) return;
  if (state.globe.isDragging) {
    viewer.scene.canvas.classList.remove("poi-hover");
    hideCountryHover();
    return;
  }

  positionCountryHover(event);
  const rect = viewer.scene.canvas.getBoundingClientRect();
  const position = new Cesium.Cartesian2(event.clientX - rect.left, event.clientY - rect.top);
  if (handlePublicSiteHover(event, position)) return;

  const cartesian = pickCesiumPosition(position);
  if (!cartesian) {
    hideCountryHover();
    return;
  }

  const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
  const lat = Cesium.Math.toDegrees(cartographic.latitude);
  const lon = normalizeLongitude(Cesium.Math.toDegrees(cartographic.longitude));
  if (!isValidLatLon(lat, lon)) {
    hideCountryHover();
    return;
  }

  const cacheKey = `${Math.round(lat * 5) / 5},${Math.round(lon * 5) / 5}`;
  const cached = state.hoverCountryCache.get(cacheKey);
  if (cached) {
    showCountryHover(cached);
    return;
  }

  const borderedCountry = findCountryFromBorders(lat, lon);
  if (borderedCountry) {
    state.hoverCountryCache.set(cacheKey, borderedCountry);
    showCountryHover(borderedCountry);
    return;
  }

  window.clearTimeout(state.hoverTimer);
  $(selectors.countryHover).hidden = true;
  const serial = (state.hoverSerial += 1);
  state.hoverTimer = window.setTimeout(async () => {
    const country = await reverseGeocodeCountry(lat, lon);
    if (serial !== state.hoverSerial) return;
    if (!country) {
      hideCountryHover();
      return;
    }
    state.hoverCountryCache.set(cacheKey, country);
    showCountryHover(country);
  }, hoverGeocodeDebounceMs);
}

function showCountryHover(label) {
  if (!label || normalize(label).includes("unresolved")) {
    hideCountryHover();
    return;
  }
  const bubble = $(selectors.countryHover);
  bubble.textContent = label;
  bubble.hidden = false;
}

async function reverseGeocodeCountry(lat, lon) {
  const location = await reverseGeocodeLocation(lat, lon);
  return getReverseGeocodeHoverLabel(location);
}

async function reverseGeocodeLocation(lat, lon) {
  try {
    const url = new URL(`${arcGisGeocoderUrl}/reverseGeocode`);
    url.searchParams.set("f", "json");
    url.searchParams.set("location", `${lon},${lat}`);
    url.searchParams.set("langCode", "en");
    const response = await fetch(url);
    if (!response.ok) return null;
    const payload = await response.json();
    const address = payload.address ?? {};
    const countryName = clampText(address.CntryName, 90, "");
    const countryCode = clampText(address.CountryCode || address.Country, 6, "").toUpperCase();
    const waterName = getArcGisWaterName(address);
    const placeKind = classifyArcGisPlaceKind(address);
    const city = clampText(address.City || address.PlaceName || address.Subregion, 90, "");
    const region = clampText(address.Region, 90, inferRegion(lat, lon));
    const label = formatPlaceHierarchy(
      [city, region, countryName],
      address.LongLabel || address.Match_addr || address.PlaceName || address.City || countryName || waterName || formatCoordinates(lat, lon)
    );
    return {
      label,
      lat,
      lon: normalizeLongitude(lon),
      countryName,
      countryCode,
      waterName,
      city,
      region,
      placeType: clampText(address.Type || address.Addr_type, 80, "Place"),
      placeKind,
      adminArea: formatPlaceHierarchy([city, region, countryName], formatAdminArea(address, countryName))
    };
  } catch {
    return null;
  }
}

function pickCesiumPosition(position) {
  const { Cesium, viewer } = state.globe ?? {};
  if (!Cesium || !viewer) return null;

  if (viewer.scene.pickPositionSupported) {
    const picked = viewer.scene.pick(position);
    if (Cesium.defined(picked)) {
      const pickedPosition = viewer.scene.pickPosition(position);
      if (Cesium.defined(pickedPosition)) return pickedPosition;
    }
  }

  const ray = viewer.camera.getPickRay(position);
  if (ray && viewer.scene.globe?.show) {
    const terrainHit = viewer.scene.globe.pick(ray, viewer.scene);
    if (Cesium.defined(terrainHit)) return terrainHit;
  }

  return viewer.camera.pickEllipsoid(position, viewer.scene.globe?.ellipsoid ?? Cesium.Ellipsoid.WGS84);
}

function scheduleScaleUpdate() {
  const globe = state.globe;
  if (!globe || globe.scaleRaf) return;
  globe.scaleRaf = window.requestAnimationFrame(() => {
    globe.scaleRaf = 0;
    updateMapScale();
    updatePublicSiteVisibility();
  });
}

function setScaleUnavailable() {
  try {
    $(selectors.scaleMetric).textContent = "--";
    $(selectors.scaleFeet).textContent = "--";
    $(selectors.scaleBar).style.width = "0";
  } catch {
    // Scale UI may not exist during early initialization.
  }
}

function pickGroundPoint(position) {
  const { Cesium } = state.globe ?? {};
  if (!Cesium) return null;
  const cartesian = pickCesiumPosition(position);
  if (!cartesian) return null;
  const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
  const lat = Cesium.Math.toDegrees(cartographic.latitude);
  const lon = normalizeLongitude(Cesium.Math.toDegrees(cartographic.longitude));
  return isValidLatLon(lat, lon) ? { lat, lon } : null;
}

function measureGroundDistanceMeters(startX, y, widthPx) {
  const { Cesium } = state.globe ?? {};
  if (!Cesium) return 0;

  const left = pickGroundPoint(new Cesium.Cartesian2(startX, y));
  const right = pickGroundPoint(new Cesium.Cartesian2(startX + widthPx, y));
  if (!left || !right) return 0;
  return haversineKm(left.lat, left.lon, right.lat, right.lon) * 1000;
}

function chooseScaleDistanceMeters(maxMeters) {
  if (!Number.isFinite(maxMeters) || maxMeters <= 0) return 0;
  const exponent = Math.floor(Math.log10(maxMeters));
  const steps = [1, 2, 5];
  let best = 0;

  for (let power = exponent; power >= exponent - 2; power -= 1) {
    const base = 10 ** power;
    steps.forEach((step) => {
      const candidate = step * base;
      if (candidate <= maxMeters && candidate > best) best = candidate;
    });
  }

  return best || maxMeters;
}

function trimScaleNumber(value, digits = 1) {
  return Number(value.toFixed(digits)).toLocaleString();
}

function formatMetricScale(meters) {
  if (meters >= 1000) return `${trimScaleNumber(meters / 1000, meters >= 10000 ? 0 : 1)} km`;
  return `${Math.round(meters).toLocaleString()} m`;
}

function formatFeetScale(meters) {
  const feet = meters * 3.28084;
  if (feet >= 1000000) return `${trimScaleNumber(feet / 1000000, feet >= 10000000 ? 0 : 1)}M ft`;
  if (feet >= 10000) return `${Math.round(feet / 1000).toLocaleString()}k ft`;
  return `${Math.round(feet).toLocaleString()} ft`;
}

function updateMapScale() {
  const { viewer } = state.globe ?? {};
  const canvas = viewer?.scene?.canvas;
  if (!viewer || !canvas?.clientWidth || !canvas.clientHeight) {
    setScaleUnavailable();
    return;
  }

  const widthPx = Math.min(mapScaleMaxWidthPx, Math.max(96, Math.round(canvas.clientWidth * 0.2)));
  const startX = Math.max(16, canvas.clientWidth - widthPx - 24);
  const sampleYs = [
    Math.max(24, canvas.clientHeight - 86),
    Math.round(canvas.clientHeight * 0.62),
    Math.round(canvas.clientHeight * 0.5)
  ];
  const rawMeters = sampleYs
    .map((y) => measureGroundDistanceMeters(startX, y, widthPx))
    .find((distance) => Number.isFinite(distance) && distance > 0);

  if (!rawMeters) {
    setScaleUnavailable();
    return;
  }

  const scaleMeters = chooseScaleDistanceMeters(rawMeters);
  const scaleWidth = Math.max(32, Math.round((scaleMeters / rawMeters) * widthPx));
  $(selectors.mapScale).hidden = false;
  $(selectors.scaleMetric).textContent = formatMetricScale(scaleMeters);
  $(selectors.scaleFeet).textContent = formatFeetScale(scaleMeters);
  $(selectors.scaleBar).style.width = `${Math.min(widthPx, scaleWidth)}px`;
}

function clearTileset() {
  const { viewer, tileset } = state.globe ?? {};
  if (!viewer || !tileset) return;
  viewer.scene.primitives.remove(tileset);
  state.globe.tileset = null;
}

async function applyMapProvider() {
  const { Cesium, viewer } = state.globe ?? {};
  if (!Cesium || !viewer) return;

  const provider = getMapProvider();
  updateMapStatus("Loading map source\u2026", provider.label);
  try {
    if (provider.kind === "google") {
      try {
        await applyGooglePhotorealisticTiles();
        return;
      } catch (error) {
        await applyCesiumTerrainFallback(`Google unavailable: ${error.message}`);
        return;
      }
    }

    if (provider.kind === "terrain") {
      await applyCesiumTerrainFallback();
      return;
    }

    if (provider.kind === "arcgis" && provider.id === "arcgis") {
      await applyArcGisImageryFallback();
      return;
    }

    if (provider.kind === "raster") {
      await applyRasterTileProvider(provider);
      return;
    }

    if (provider.kind === "arcgis") {
      await applyArcGisMapServerProvider(provider);
      return;
    }

    if (provider.kind === "3dtiles") {
      await applyCustom3DTilesProvider(provider);
      return;
    }

    await applyArcGisImageryFallback();
  } catch (error) {
    updateMapStatus(`Map source failed: ${error.message}`, "Map unavailable");
  } finally {
    scheduleScaleUpdate();
  }
}

async function applyGooglePhotorealisticTiles() {
  const { Cesium, viewer } = state.globe ?? {};
  if (!Cesium || !viewer) return;

  const googleApiKey = state.mapConfig.googleApiKey.trim();
  const ionToken = state.mapConfig.cesiumIonToken.trim();
  if (!googleApiKey && !ionToken) {
    throw new Error("missing Google API key or Cesium ion token");
  }

  clearTileset();
  viewer.imageryLayers.removeAll();
  viewer.scene.globe.show = false;

  let tileset;
  if (ionToken && typeof Cesium.createGooglePhotorealistic3DTileset === "function") {
    Cesium.Ion.defaultAccessToken = ionToken;
    tileset = await Cesium.createGooglePhotorealistic3DTileset({
      showCreditsOnScreen: true
    });
  } else {
    const rootUrl = `https://tile.googleapis.com/v1/3dtiles/root.json?key=${encodeURIComponent(googleApiKey)}`;
    tileset = typeof Cesium.Cesium3DTileset.fromUrl === "function"
      ? await Cesium.Cesium3DTileset.fromUrl(rootUrl, { showCreditsOnScreen: true })
      : new Cesium.Cesium3DTileset({ url: rootUrl, showCreditsOnScreen: true });
  }

  viewer.scene.primitives.add(tileset);
  state.globe.tileset = tileset;
  updateMapStatus("Google photorealistic 3D tiles active.", "Google 3D tiles");
}

async function applyCesiumTerrainFallback(reason = "") {
  const { Cesium, viewer } = state.globe ?? {};
  if (!Cesium || !viewer) return;

  clearTileset();
  viewer.scene.globe.show = true;
  addSatelliteImagery();

  if (!state.mapConfig.cesiumIonToken.trim()) {
    viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
    updateMapStatus(
      reason ? `${reason}. Public satellite fallback active.` : "Public satellite fallback active.",
      "ArcGIS satellite"
    );
    return;
  }

  Cesium.Ion.defaultAccessToken = state.mapConfig.cesiumIonToken.trim();
  if (Cesium.Terrain?.fromWorldTerrain && typeof viewer.scene.setTerrain === "function") {
    viewer.scene.setTerrain(Cesium.Terrain.fromWorldTerrain({
      requestVertexNormals: true,
      requestWaterMask: true
    }));
  } else if (typeof Cesium.createWorldTerrainAsync === "function") {
    viewer.terrainProvider = await Cesium.createWorldTerrainAsync({
      requestVertexNormals: true,
      requestWaterMask: true
    });
  } else if (typeof Cesium.createWorldTerrain === "function") {
    viewer.terrainProvider = Cesium.createWorldTerrain({
      requestVertexNormals: true,
      requestWaterMask: true
    });
  } else {
    throw new Error("Cesium World Terrain is not available in this Cesium build");
  }

  updateMapStatus(
    reason ? `${reason}. Cesium World Terrain fallback active.` : "Cesium World Terrain active.",
    "Cesium World Terrain"
  );
}

async function applyArcGisImageryFallback() {
  const { Cesium, viewer } = state.globe ?? {};
  if (!Cesium || !viewer) return;

  clearTileset();
  viewer.scene.globe.show = true;
  viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
  addSatelliteImagery();
  updateMapStatus("Fast base map active; loading satellite imagery.", "ArcGIS satellite");
}

async function applyRasterTileProvider(provider) {
  const { Cesium, viewer } = state.globe ?? {};
  if (!Cesium || !viewer) return;

  clearTileset();
  viewer.scene.globe.show = true;
  viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
  viewer.imageryLayers.removeAll();
  const imageryProvider = new Cesium.UrlTemplateImageryProvider({
    url: provider.url,
    credit: provider.credit || provider.label,
    enablePickFeatures: false
  });
  viewer.imageryLayers.addImageryProvider(imageryProvider);
  updateMapStatus(`${provider.label} active.`, provider.label);
}

async function applyArcGisMapServerProvider(provider) {
  const { Cesium, viewer } = state.globe ?? {};
  if (!Cesium || !viewer) return;

  clearTileset();
  viewer.scene.globe.show = true;
  viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
  viewer.imageryLayers.removeAll();
  const imageryProvider = await Cesium.ArcGisMapServerImageryProvider.fromUrl(provider.url, { enablePickFeatures: false });
  viewer.imageryLayers.addImageryProvider(imageryProvider);
  updateMapStatus(`${provider.label} active.`, provider.label);
}

async function applyCustom3DTilesProvider(provider) {
  const { Cesium, viewer } = state.globe ?? {};
  if (!Cesium || !viewer) return;

  clearTileset();
  viewer.imageryLayers.removeAll();
  viewer.scene.globe.show = false;
  const tileset = typeof Cesium.Cesium3DTileset.fromUrl === "function"
    ? await Cesium.Cesium3DTileset.fromUrl(provider.url, { showCreditsOnScreen: true })
    : new Cesium.Cesium3DTileset({ url: provider.url, showCreditsOnScreen: true });
  viewer.scene.primitives.add(tileset);
  state.globe.tileset = tileset;
  updateMapStatus(`${provider.label} 3D tiles active.`, provider.label);
}

function addSatelliteImagery() {
  const { Cesium, viewer } = state.globe ?? {};
  if (!Cesium || !viewer) return;

  viewer.imageryLayers.removeAll();
  const token = `imagery-${Date.now()}`;
  state.globe.imageryRequestToken = token;
  let fallbackLayer = null;

  try {
    fallbackLayer = viewer.imageryLayers.addImageryProvider(new Cesium.OpenStreetMapImageryProvider({
      url: "https://a.tile.openstreetmap.org/"
    }));
  } catch {
    fallbackLayer = null;
  }

  void Cesium.ArcGisMapServerImageryProvider.fromUrl(
      "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer",
      { enablePickFeatures: false }
    )
    .then((provider) => {
      if (state.globe?.imageryRequestToken !== token || state.globe.viewer !== viewer) return;
      const satelliteLayer = viewer.imageryLayers.addImageryProvider(provider, 0);
      if (fallbackLayer) {
        try {
          viewer.imageryLayers.remove(fallbackLayer, true);
        } catch {
          // The fallback may already be gone if the provider changed mid-load.
        }
      }
      satelliteLayer.show = true;
      updateMapStatus("ArcGIS satellite imagery active on the WGS84 globe.", "ArcGIS satellite");
      scheduleScaleUpdate();
    })
    .catch(() => {
      if (state.globe?.imageryRequestToken !== token) return;
      updateMapStatus("OpenStreetMap base map active while satellite imagery is unavailable.", "OpenStreetMap");
      scheduleScaleUpdate();
    });
}

function collectCoordinateBounds(coordinates, bounds = { west: 180, east: -180, south: 90, north: -90 }) {
  if (!Array.isArray(coordinates)) return bounds;
  if (typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
    const lon = normalizeLongitude(coordinates[0]);
    const lat = coordinates[1];
    bounds.west = Math.min(bounds.west, lon);
    bounds.east = Math.max(bounds.east, lon);
    bounds.south = Math.min(bounds.south, lat);
    bounds.north = Math.max(bounds.north, lat);
    return bounds;
  }
  coordinates.forEach((entry) => collectCoordinateBounds(entry, bounds));
  return bounds;
}

function prepareCountryGeoJson(geoJson) {
  if (!geoJson?.features) return geoJson;
  geoJson.features.forEach((feature) => {
    feature._bounds = collectCoordinateBounds(feature.geometry?.coordinates);
  });
  return geoJson;
}

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = normalizeLongitude(ring[i][0]);
    const yi = ring[i][1];
    const xj = normalizeLongitude(ring[j][0]);
    const yj = ring[j][1];
    const intersects = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-9) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lon, lat, polygon) {
  if (!pointInRing(lon, lat, polygon[0] ?? [])) return false;
  return !polygon.slice(1).some((hole) => pointInRing(lon, lat, hole));
}

function pointInCountryFeature(lon, lat, feature) {
  const bounds = feature?._bounds;
  if (bounds && (lon < bounds.west || lon > bounds.east || lat < bounds.south || lat > bounds.north)) return false;
  const coordinates = feature?.geometry?.coordinates;
  if (!coordinates) return false;
  if (feature.geometry.type === "Polygon") return pointInPolygon(lon, lat, coordinates);
  if (feature.geometry.type === "MultiPolygon") return coordinates.some((polygon) => pointInPolygon(lon, lat, polygon));
  return false;
}

function findCountryFromBorders(lat, lon) {
  const features = state.globe?.countryGeoJson?.features ?? [];
  const normalizedLon = normalizeLongitude(lon);
  const match = features.find((feature) => pointInCountryFeature(normalizedLon, lat, feature));
  return clampText(match?.properties?.name, 90, "");
}

function forEachFeatureRing(feature, callback) {
  const coordinates = feature?.geometry?.coordinates;
  if (!coordinates) return;
  if (feature.geometry.type === "Polygon") {
    coordinates.forEach((ring) => callback(ring));
    return;
  }
  if (feature.geometry.type === "MultiPolygon") {
    coordinates.forEach((polygon) => polygon.forEach((ring) => callback(ring)));
  }
}

function addFeaturePolylineEntities(features, color, width, height = 3000) {
  const { Cesium, viewer } = state.globe ?? {};
  if (!Cesium || !viewer) return [];
  const entities = [];
  features.forEach((feature) => {
    forEachFeatureRing(feature, (ring) => {
      if (!Array.isArray(ring) || ring.length < 2) return;
      const degrees = [];
      ring.forEach(([lon, lat]) => {
        degrees.push(normalizeLongitude(lon), lat, height);
      });
      const entity = viewer.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights(degrees),
          width,
          material: color,
          clampToGround: false
        }
      });
      entities.push(entity);
    });
  });
  return entities;
}

async function loadCountryBorders() {
  const { Cesium, viewer } = state.globe ?? {};
  if (!Cesium || !viewer) return;
  if (state.globe.countryGeoJson && state.globe.borderLineEntities.length) return;
  if (state.globe.borderLoadPromise) return state.globe.borderLoadPromise;

  state.globe.borderLoadPromise = (async () => {
    const geoJsonPayload = await fetchJsonWithTimeout(countryBordersGeoJsonUrl, {}, countryBorderFetchTimeoutMs);
    if (!geoJsonPayload) throw new Error("Country borders did not load before timeout.");
    const geoJson = prepareCountryGeoJson(geoJsonPayload);
    state.globe.countryGeoJson = geoJson;

    if (!state.globe.borderLineEntities.length) {
      state.globe.borderLineEntities = addFeaturePolylineEntities(
        geoJson.features,
        Cesium.Color.fromCssColorString("#d7ebe6").withAlpha(0.34),
        1,
        3500
      );
    }
    renderPublicSitesForSnapshot(getSelectedSnapshot());
  })();

  try {
    await state.globe.borderLoadPromise;
  } catch (error) {
    console.warn("Country border layer unavailable", error);
  } finally {
    state.globe.borderLoadPromise = null;
  }
}

function normalizeCountryMatchName(value) {
  return normalize(value)
    .replace(/^the\s+/, "")
    .replace(/\band\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findCountryFeature(snapshot) {
  const features = state.globe?.countryGeoJson?.features ?? [];
  const iso3 = normalize(snapshot?.iso3);
  const country = normalizeCountryMatchName(snapshot?.country);
  return features.find((feature) => {
    if (iso3 && normalize(feature.id) === iso3) return true;
    const featureName = normalizeCountryMatchName(feature.properties?.name);
    return country && featureName === country;
  });
}

function shouldShadeSelectedCountry(snapshot) {
  if (!snapshot) return false;
  return snapshot.source === "country search" || normalize(snapshot.placeKind) === "country";
}

function clearSelectedOutlines() {
  const { viewer, selectedCountryDataSource, selectedCountryLines, cityOutline } = state.globe ?? {};
  if (!viewer) return;
  if (selectedCountryDataSource) {
    viewer.dataSources.remove(selectedCountryDataSource, true);
    state.globe.selectedCountryDataSource = null;
  }
  (selectedCountryLines ?? []).forEach((entity) => viewer.entities.remove(entity));
  state.globe.selectedCountryLines = [];
  if (cityOutline) {
    viewer.entities.remove(cityOutline);
    state.globe.cityOutline = null;
  }
}

async function addSelectedCountryFill(feature) {
  const { Cesium, viewer } = state.globe ?? {};
  if (!Cesium || !viewer || !feature) return;

  const dataSource = await Cesium.GeoJsonDataSource.load(
    {
      type: "FeatureCollection",
      features: [feature]
    },
    {
      stroke: Cesium.Color.fromCssColorString("#89fff4").withAlpha(0.78),
      fill: Cesium.Color.fromCssColorString("#0b746e").withAlpha(0.18),
      strokeWidth: 1.5,
      clampToGround: false
    }
  );

  dataSource.entities.values.forEach((entity) => {
    if (!entity.polygon) return;
    entity.polygon.material = Cesium.Color.fromCssColorString("#0b746e").withAlpha(0.18);
    entity.polygon.outline = false;
    entity.polygon.height = 4200;
  });

  state.globe.selectedCountryDataSource = await viewer.dataSources.add(dataSource);
}

function addLocationOutline(snapshot) {
  const { Cesium, viewer } = state.globe ?? {};
  if (!Cesium || !viewer || !snapshot) return;

  const extent = normalizeExtent(snapshot.locationExtent);
  if (extent) {
    const displayExtent = expandExtentForDisplay(extent);
    const outlineDegrees = [
      displayExtent.west, displayExtent.south, 8200,
      displayExtent.east, displayExtent.south, 8200,
      displayExtent.east, displayExtent.north, 8200,
      displayExtent.west, displayExtent.north, 8200,
      displayExtent.west, displayExtent.south, 8200
    ];
    state.globe.cityOutline = viewer.entities.add({
      name: `${snapshot.selectedLocation} outline`,
      rectangle: {
        coordinates: Cesium.Rectangle.fromDegrees(displayExtent.west, displayExtent.south, displayExtent.east, displayExtent.north),
        material: Cesium.Color.fromCssColorString("#f0b44d").withAlpha(0.08),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString("#f0b44d").withAlpha(0.95),
        outlineWidth: 2,
        height: 7600
      },
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights(outlineDegrees),
        width: 4,
        material: Cesium.Color.fromCssColorString("#f0b44d").withAlpha(0.98),
        clampToGround: false
      }
    });
    return;
  }

  if (snapshot.source === "country search") return;
  state.globe.cityOutline = viewer.entities.add({
    name: `${snapshot.selectedLocation} locator ring`,
    position: Cesium.Cartesian3.fromDegrees(snapshot.lon, snapshot.lat, 1500),
    ellipse: {
      semiMajorAxis: 35000,
      semiMinorAxis: 35000,
      material: Cesium.Color.fromCssColorString("#f0b44d").withAlpha(0.07),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString("#f0b44d").withAlpha(0.95),
      outlineWidth: 2,
      height: 1500
    }
  });
}

async function addSelectedCountryOutline(snapshot) {
  const { Cesium, viewer } = state.globe ?? {};
  if (!Cesium || !viewer || !snapshot) return;
  await loadCountryBorders();
  const feature = findCountryFeature(snapshot);
  if (!feature) return;

  if (shouldShadeSelectedCountry(snapshot)) {
    await addSelectedCountryFill(feature);
  }

  state.globe.selectedCountryLines = addFeaturePolylineEntities(
    [feature],
    Cesium.Color.fromCssColorString("#89fff4").withAlpha(0.96),
    5,
    6500
  );
}

function drawSelectedOutlines(snapshot) {
  clearSelectedOutlines();
  addLocationOutline(snapshot);
  void addSelectedCountryOutline(snapshot);
}

function buildPublicSiteQueries(snapshot) {
  const country = clampText(snapshot?.country, 90, "");
  const place = clampText(String(snapshot?.selectedLocation ?? "").split(",")[0], 100, "");
  const scope = getSnapshotPublicSiteScope(snapshot);
  const localPrefix = place && normalize(place) !== normalize(country) ? place : country;
  const base = scope === "country" ? country : localPrefix;
  const countryBase = country && normalize(country) !== normalize(base) ? country : "";
  const queries = [
    `${base} military base`,
    `${base} army base`,
    `${base} army post`,
    `${base} air base`,
    `${base} air force base`,
    `${base} airbase`,
    `${base} military airfield`,
    `${base} civilian airport`,
    `${base} international airport`,
    `${base} airport`,
    `${base} naval base`,
    `${base} naval station`,
    `${base} national guard`,
    `${base} national guard armory`,
    `${base} military depot`,
    `${base} supply depot`,
    `${base} logistics depot`,
    `${base} arsenal`,
    `${base} ordnance depot`,
    `${base} port`,
    `${base} seaport`,
    `${base} barracks`,
    `${base} garrison`,
    `${base} fort`,
    `${base} camp`,
    `${base} armed forces`,
    `${base} military headquarters`,
    `${base} dockyard`,
    `${base} shipyard`,
    `${base} ministry of defense`,
    `${base} ministry of defence`,
    `${countryBase} military bases`,
    `${countryBase} army bases`,
    `${countryBase} air bases`,
    `${countryBase} air force bases`,
    `${countryBase} military airfields`,
    `${countryBase} civilian airports`,
    `${countryBase} airports`,
    `${countryBase} naval bases`,
    `${countryBase} national guard facilities`,
    `${countryBase} supply depots`,
    `${countryBase} logistics depots`,
    `${countryBase} ports`,
    `${country} national capital`,
    `${country} military headquarters`,
    `${country} logistics depot`,
    `${country} civilian airports`,
    `${country} ministry of defence`
  ];
  return queries
    .map((query) => query.trim())
    .filter(Boolean)
    .filter((query, index, list) => list.indexOf(query) === index)
    .slice(0, publicSiteQueryLimit);
}

function siteMatchesSnapshotScope(site, snapshot) {
  if (!snapshot || site.countryIso3 !== snapshot.iso3) return false;
  return true;
}

async function queryWikipediaPublicSitePages(query) {
  const searchUrl = new URL(wikipediaApiUrl);
  searchUrl.searchParams.set("origin", "*");
  searchUrl.searchParams.set("action", "query");
  searchUrl.searchParams.set("format", "json");
  searchUrl.searchParams.set("list", "search");
  searchUrl.searchParams.set("srnamespace", "0");
  searchUrl.searchParams.set("srlimit", String(publicSiteResultLimit));
  searchUrl.searchParams.set("srsearch", query);

  const searchPayload = await fetchJsonWithTimeout(searchUrl);
  if (!searchPayload) return [];
  const pageIds = (searchPayload.query?.search ?? []).map((result) => result.pageid).filter(Boolean).slice(0, publicSiteResultLimit);
  return queryWikipediaPagesByIds(pageIds);
}

async function queryWikipediaNearbyPublicSitePages(snapshot) {
  if (!snapshot || getSnapshotPublicSiteScope(snapshot) === "country" || !isValidLatLon(snapshot.lat, snapshot.lon)) return [];

  const geoUrl = new URL(wikipediaApiUrl);
  geoUrl.searchParams.set("origin", "*");
  geoUrl.searchParams.set("action", "query");
  geoUrl.searchParams.set("format", "json");
  geoUrl.searchParams.set("list", "geosearch");
  geoUrl.searchParams.set("gscoord", `${snapshot.lat}|${snapshot.lon}`);
  geoUrl.searchParams.set("gsradius", "10000");
  geoUrl.searchParams.set("gslimit", "50");

  const geoPayload = await fetchJsonWithTimeout(geoUrl);
  if (!geoPayload) return [];
  const pageIds = (geoPayload.query?.geosearch ?? []).map((result) => result.pageid).filter(Boolean).slice(0, 50);
  return queryWikipediaPagesByIds(pageIds);
}

async function queryWikipediaPagesByIds(pageIds) {
  if (!pageIds.length) return [];

  const pageUrl = new URL(wikipediaApiUrl);
  pageUrl.searchParams.set("origin", "*");
  pageUrl.searchParams.set("action", "query");
  pageUrl.searchParams.set("format", "json");
  pageUrl.searchParams.set("pageids", pageIds.join("|"));
  pageUrl.searchParams.set("prop", "coordinates|extracts|pageimages|info");
  pageUrl.searchParams.set("inprop", "url");
  pageUrl.searchParams.set("exintro", "1");
  pageUrl.searchParams.set("explaintext", "1");
  pageUrl.searchParams.set("piprop", "thumbnail");
  pageUrl.searchParams.set("pithumbsize", "180");
  pageUrl.searchParams.set("redirects", "1");

  const pagePayload = await fetchJsonWithTimeout(pageUrl);
  if (!pagePayload) return [];
  return Object.values(pagePayload.query?.pages ?? {});
}

async function queryWikidataPublicFacilities(snapshot) {
  const iso3 = clampText(snapshot?.iso3, 3, "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(iso3) || iso3 === "UNK") return [];

  const query = `
    SELECT DISTINCT ?item ?itemLabel ?coord ?typeLabel ?article WHERE {
      ?country wdt:P298 "${iso3}".
      ?item wdt:P17 ?country;
            wdt:P625 ?coord;
            wdt:P31 ?type;
            rdfs:label ?itemLabel.
      ?type rdfs:label ?typeLabel.
      FILTER(LANG(?itemLabel) = "en")
      FILTER(LANG(?typeLabel) = "en")
      FILTER(REGEX(
        CONCAT(STR(?itemLabel), " ", STR(?typeLabel)),
        "(army base|military base|military installation|national guard|reserve center|reserve centre|armory|armoury|naval base|naval station|air base|airbase|air force base|air force station|military airfield|military aerodrome|civilian airport|civil airport|international airport|regional airport|airport|aerodrome|supply depot|depot|logistics depot|arsenal|ordnance|ammunition dump|barracks|garrison|fort|camp|dockyard|shipyard|seaport|harbor|harbour|port|headquarters|ministry of defense|ministry of defence)",
        "i"
      ))
      OPTIONAL { ?article schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    LIMIT ${wikidataFacilityLimit}
  `;

  const url = new URL(wikidataSparqlUrl);
  url.searchParams.set("format", "json");
  url.searchParams.set("query", query);

  const payload = await fetchJsonWithTimeout(url, {
    headers: { Accept: "application/sparql-results+json" },
    cache: "no-store"
  });
  if (!payload) return [];
  return (payload.results?.bindings ?? [])
    .map((binding) => {
      const point = parseWikidataPoint(binding.coord?.value);
      const label = clampText(binding.itemLabel?.value, 140, "");
      const typeLabel = clampText(binding.typeLabel?.value, 120, "military installation");
      const entityId = String(binding.item?.value ?? "").split("/").pop();
      if (!point || !label || !entityId) return null;

      return normalizePublicSite({
        id: `wikidata-${entityId}`,
        countryIso3: iso3,
        name: label,
        type: classifyWikidataFacilityType(label, typeLabel),
        lat: point.lat,
        lon: point.lon,
        pageTitle: label,
        url: binding.article?.value || `https://www.wikidata.org/wiki/${entityId}`,
        summary: `Wikidata public index: ${typeLabel}. Context only; no live readiness, disposition, access, or movement data.`,
        source: "Wikidata public index",
        query: `${iso3} public military installations`,
        dynamic: true
      });
    })
    .filter(Boolean);
}

function publicSiteFromWikipediaPage(page, snapshot, query) {
  const coordinate = page?.coordinates?.[0];
  const lat = toFiniteNumber(coordinate?.lat);
  const lon = toFiniteNumber(coordinate?.lon);
  const title = clampText(page?.title, 140, "");
  const summary = clampText(page?.extract, 360, "");
  if (!title || !isValidLatLon(lat, lon) || !looksLikePublicMilitarySite(title, summary)) return null;

  return normalizePublicSite({
    id: `wiki-${page.pageid}`,
    countryIso3: snapshot.iso3,
    name: title,
    type: classifyPublicSiteType(title, summary),
    lat,
    lon,
    pageTitle: title,
    url: page.fullurl || wikipediaPageUrl(title),
    summary,
    thumbnail: page.thumbnail?.source,
    source: "Wikipedia search",
    query,
    dynamic: true
  });
}

async function loadDynamicPublicSitesForSnapshot(snapshot, onBatch = null) {
  if (!shouldShowPublicSites(snapshot)) return [];
  const cacheKey = publicSiteSearchCacheKey(snapshot);
  if (state.publicSiteSearchCache.has(cacheKey)) return state.publicSiteSearchCache.get(cacheKey);

  const queries = buildPublicSiteQueries(snapshot);
  const emitBatch = (sites) => {
    if (typeof onBatch === "function" && sites.length) onBatch(sites);
    return sites;
  };
  const siteGroups = await Promise.all(
    [
      async () => {
        try {
          return emitBatch(await queryWikidataPublicFacilities(snapshot));
        } catch {
          return [];
        }
      },
      async () => {
        try {
          const pages = await queryWikipediaNearbyPublicSitePages(snapshot);
          return emitBatch(pages
            .map((page) => publicSiteFromWikipediaPage(page, snapshot, "nearby Wikipedia geosearch"))
            .filter(Boolean)
            .filter((site) => siteMatchesSnapshotScope(site, snapshot)));
        } catch {
          return [];
        }
      },
      ...queries.map((query) => async () => {
        try {
          const pages = await queryWikipediaPublicSitePages(query);
          return emitBatch(pages
            .map((page) => publicSiteFromWikipediaPage(page, snapshot, query))
            .filter(Boolean)
            .filter((site) => siteMatchesSnapshotScope(site, snapshot)));
        } catch {
          return [];
        }
      })
    ].map((loadSites) => loadSites())
  );
  const dynamicSites = dedupePublicSites(siteGroups.flat()).slice(0, publicSiteMarkerLimit);
  state.publicSiteSearchCache.set(cacheKey, dynamicSites);
  return dynamicSites;
}

function clearPublicSites() {
  const { viewer, publicSiteEntities } = state.globe ?? {};
  if (state.globe) state.globe.publicSiteRenderToken = "";
  if (viewer) {
    (publicSiteEntities ?? []).forEach((entity) => viewer.entities.remove(entity));
    viewer.scene.canvas.classList.remove("poi-hover");
  }
  if (state.globe) state.globe.publicSiteEntities = [];
  if (state.globe) state.globe.publicSiteAllSites = [];
  if (state.globe) state.globe.publicSiteSnapshotId = "";
  if (state.globe) state.globe.publicSiteVisibleKey = "";
  state.pinnedPublicSiteId = "";
  $(selectors.siteLegend).hidden = true;
  hidePublicSiteHover(0, { force: true });
}

function shouldShowPublicSites(snapshot) {
  return Boolean(snapshot && snapshot.iso3 !== "UNK" && snapshot.source !== "map click");
}

function getPublicSitesForSnapshot(snapshot) {
  const defaultCapitalSites = getDefaultCapitalSites();
  if (!shouldShowPublicSites(snapshot)) return defaultCapitalSites;
  const capitalSite = getNationalCapitalSite(snapshot);
  return [
    capitalSite,
    ...defaultCapitalSites,
    ...state.publicSites.filter((site) => siteMatchesSnapshotScope(site, snapshot))
  ]
    .filter(Boolean)
    .slice(0, publicSiteMarkerLimit);
}

function getNationalCapitalSite(snapshot) {
  if (!snapshot || snapshot.iso3 === "UNK") return null;
  const profile = state.profiles.find((entry) => entry.iso3 === snapshot.iso3 || normalize(entry.country) === normalize(snapshot.country));
  const capital = getProfileCapital(profile);
  if (!capital || !isValidLatLon(capital.lat, capital.lon)) return null;
  return normalizePublicSite({
    id: `${snapshot.iso3.toLowerCase()}-national-capital`,
    countryIso3: snapshot.iso3,
    name: `${snapshot.country} National Capital`,
    type: "national_capital",
    lat: capital.lat,
    lon: capital.lon,
    pageTitle: capital.label || snapshot.country,
    summary: `${capital.label || snapshot.country} is the national capital used for country-level context.`,
    source: "Country profile"
  });
}

function majorCapitalSeedToSite(capital) {
  return normalizePublicSite({
    id: `major-capital-${normalize(capital.iso3 || capital.name).replace(/[^a-z0-9]+/g, "-")}`,
    countryIso3: capital.iso3,
    name: `${capital.name}, ${capital.country}`,
    type: "national_capital",
    lat: capital.lat,
    lon: capital.lon,
    pageTitle: capital.name,
    summary: `${capital.name} is a major national capital shown by default for orientation.`,
    source: "Default major capitals"
  });
}

function profileCapitalToDefaultSite(profile) {
  const capital = getProfileCapital(profile);
  if (!profile || !capital || !isValidLatLon(capital.lat, capital.lon)) return null;
  return normalizePublicSite({
    id: `profile-capital-${normalize(profile.iso3 || profile.country).replace(/[^a-z0-9]+/g, "-")}`,
    countryIso3: profile.iso3,
    name: `${capital.label || profile.country}, ${profile.country}`,
    type: "national_capital",
    lat: capital.lat,
    lon: capital.lon,
    pageTitle: capital.label || profile.country,
    summary: `${capital.label || profile.country} is the national capital used for country-level context.`,
    source: "Country profile"
  });
}

function publicSiteMatchesCountryFeature(site, feature) {
  if (!site || !feature) return false;
  const featureId = clampText(feature.id, 24, "").toUpperCase();
  if (featureId && featureId !== "-99") {
    const ids = new Set([site.countryIso3, ...toTextList(site.geoJsonIds)].map((id) => clampText(id, 24, "").toUpperCase()));
    if (ids.has(featureId)) return true;
  }

  const featureName = normalizeCountryMatchName(feature.properties?.name);
  if (!featureName) return false;
  const names = [site.name, site.pageTitle, ...toTextList(site.countryNames)].map(normalizeCountryMatchName);
  return names.includes(featureName);
}

function getCountryMatchedCapitalSites() {
  const capitalSites = state.worldCapitalSites.length
    ? state.worldCapitalSites
    : majorCapitalCitySeeds.map(majorCapitalSeedToSite).filter(Boolean);
  const features = state.globe?.countryGeoJson?.features ?? [];
  if (!features.length) return capitalSites;
  return capitalSites.filter((site) => features.some((feature) => publicSiteMatchesCountryFeature(site, feature)));
}

function getDefaultCapitalSites() {
  const fallbackSites = state.worldCapitalSites.length
    ? []
    : [
      ...majorCapitalCitySeeds.map(majorCapitalSeedToSite),
      ...state.profiles.map(profileCapitalToDefaultSite)
    ];
  return dedupePublicSites([
    ...getCountryMatchedCapitalSites(),
    ...fallbackSites
  ].filter(Boolean));
}

function getPublicSiteZoomBand(heightMeters) {
  const height = Number.isFinite(heightMeters) ? heightMeters : Number.POSITIVE_INFINITY;
  return publicSiteZoomBands.find((band) => height <= band.maxHeightMeters) ?? publicSiteZoomBands[publicSiteZoomBands.length - 1];
}

function publicSiteTypePriority(type) {
  const priorities = {
    national_capital: 0,
    air_force_base: 1,
    naval_base: 2,
    army_base: 3,
    national_guard: 4,
    supply_depot: 5,
    port: 6,
    airport: 7,
    other: 8
  };
  return priorities[type] ?? priorities.other;
}

function getPublicSiteDistanceKm(site, snapshot) {
  if (!site || !snapshot || !isValidLatLon(site.lat, site.lon) || !isValidLatLon(snapshot.lat, snapshot.lon)) {
    return Number.POSITIVE_INFINITY;
  }
  return haversineKm(snapshot.lat, snapshot.lon, site.lat, site.lon);
}

function getVisiblePublicSitesForCamera(snapshot, sites) {
  const { viewer } = state.globe ?? {};
  if (!snapshot || !viewer || !sites.length) return [];

  const capitalSites = sites.filter((site) => site.type === "national_capital");
  const scopedSites = sites.filter((site) => site.type !== "national_capital");
  const heightMeters = viewer.camera.positionCartographic?.height;
  const band = getPublicSiteZoomBand(heightMeters);
  const scored = scopedSites
    .map((site) => ({
      site,
      distanceKm: getPublicSiteDistanceKm(site, snapshot)
    }))
    .sort((left, right) => {
      const distanceDelta = left.distanceKm - right.distanceKm;
      if (Math.abs(distanceDelta) > 2) return distanceDelta;
      return publicSiteTypePriority(left.site.type) - publicSiteTypePriority(right.site.type);
    });

  const inRadius = scored.filter((entry) => entry.distanceKm <= band.radiusKm);
  const selected = (inRadius.length ? inRadius : scored.slice(0, Math.min(8, band.maxSites)))
    .slice(0, band.maxSites)
    .map((entry) => entry.site);

  return dedupePublicSites([...capitalSites, ...selected]);
}

function publicSiteVisibilityKey(snapshot, sites) {
  const { viewer } = state.globe ?? {};
  const band = getPublicSiteZoomBand(viewer?.camera?.positionCartographic?.height);
  return [
    snapshot?.id ?? "",
    band.id,
    sites.length,
    sites.map((site) => site.id).join("|")
  ].join("::");
}

function getPublicSiteVisibilityAnchor() {
  const snapshot = getSelectedSnapshot();
  if (snapshot) return snapshot;
  if (state.globe?.publicSiteSnapshotId === defaultCapitalSiteSnapshotId) return defaultCapitalSiteAnchor;
  return null;
}

function renderPublicSiteLegend(sites, totalSites = sites.length) {
  const legend = $(selectors.siteLegend);
  const target = $(selectors.siteLegendItems);
  const types = [...new Set(sites.map((site) => site.type))];
  if (!types.length) {
    legend.hidden = true;
    return;
  }

  target.innerHTML = types
    .map((type) => {
      const style = siteTypeStyle(type);
      return `
        <span class="legend-item">
          <i style="--site-color: ${escapeHtml(style.color)}"></i>
          ${escapeHtml(style.label)}
        </span>
      `;
    })
    .join("");
  const title = legend.querySelector("p");
  const note = legend.querySelector("small");
  const { viewer } = state.globe ?? {};
  const band = getPublicSiteZoomBand(viewer?.camera?.positionCartographic?.height);
  if (title) {
    title.textContent = `Public POIs: ${sites.length}/${totalSites} (${band.label})`;
  }
  if (note) {
    note.textContent = state.globe?.publicSiteSnapshotId === defaultCapitalSiteSnapshotId
      ? "Major national capitals shown by default for map orientation."
      : sites.length < totalSites
      ? "Zoom out to reveal more public-reference sites. Not live posture."
      : "Wikipedia/Wikidata-linked context, not live posture.";
  }
  legend.hidden = false;
}

function removePublicSiteEntities() {
  const { viewer, publicSiteEntities } = state.globe ?? {};
  if (!viewer) return;
  (publicSiteEntities ?? []).forEach((entity) => viewer.entities.remove(entity));
  state.globe.publicSiteEntities = [];
  viewer.scene.canvas.classList.remove("poi-hover");
}

function drawPublicSiteEntities(sites, totalSites = sites.length) {
  const { Cesium, viewer } = state.globe ?? {};
  if (!Cesium || !viewer) return;

  removePublicSiteEntities();

  if (!sites.length) {
    $(selectors.siteLegend).hidden = true;
    return;
  }

  state.globe.publicSiteEntities = sites.map((site) => {
    const style = siteTypeStyle(site.type);
    const entity = viewer.entities.add({
      name: site.name,
      position: Cesium.Cartesian3.fromDegrees(site.lon, site.lat, 0),
      point: {
        pixelSize: 14,
        color: Cesium.Color.fromCssColorString(style.color).withAlpha(0.94),
        outlineColor: Cesium.Color.fromCssColorString("#111719"),
        outlineWidth: 3,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: 0
      }
    });
    entity.publicSiteId = site.id;
    entity.publicSite = site;
    return entity;
  });
  renderPublicSiteLegend(sites, totalSites);
}

function updatePublicSiteVisibility() {
  const globe = state.globe;
  const snapshot = getPublicSiteVisibilityAnchor();
  const allSites = globe?.publicSiteAllSites ?? [];
  if (!globe || !snapshot || globe.publicSiteSnapshotId !== snapshot.id || !allSites.length) return;

  const visibleSites = getVisiblePublicSitesForCamera(snapshot, allSites);
  const key = publicSiteVisibilityKey(snapshot, visibleSites);
  if (key === globe.publicSiteVisibleKey) {
    renderPublicSiteLegend(visibleSites, allSites.length);
    return;
  }

  globe.publicSiteVisibleKey = key;
  drawPublicSiteEntities(visibleSites, allSites.length);
}

function schedulePublicSiteVisibilityUpdate() {
  const globe = state.globe;
  if (!globe || globe.publicSiteVisibilityRaf) return;
  globe.publicSiteVisibilityRaf = window.requestAnimationFrame(() => {
    globe.publicSiteVisibilityRaf = 0;
    updatePublicSiteVisibility();
  });
}

function setPublicSiteCatalog(snapshot, sites) {
  if (!state.globe) return;
  state.globe.publicSiteAllSites = dedupePublicSites(sites).slice(0, publicSiteMarkerLimit);
  state.globe.publicSiteSnapshotId = snapshot?.id ?? "";
  state.globe.publicSiteVisibleKey = "";
  updatePublicSiteVisibility();
}

function renderPublicSitesForSnapshot(snapshot) {
  clearPublicSites();

  const siteAnchor = shouldShowPublicSites(snapshot) ? snapshot : defaultCapitalSiteAnchor;
  const staticSites = getPublicSitesForSnapshot(snapshot);
  const initialSites = dedupePublicSites(staticSites).slice(0, publicSiteMarkerLimit);
  setPublicSiteCatalog(siteAnchor, initialSites);

  if (!shouldShowPublicSites(snapshot)) return;
  const renderToken = `${snapshot.id}-${Date.now()}`;
  state.globe.publicSiteRenderToken = renderToken;
  let accumulatedSites = initialSites;
  let flushTimer = 0;
  const flushAccumulatedSites = () => {
    flushTimer = 0;
    if (state.globe?.publicSiteRenderToken !== renderToken) return;
    setPublicSiteCatalog(snapshot, accumulatedSites);
  };
  const appendDynamicSites = (sites) => {
    if (state.globe?.publicSiteRenderToken !== renderToken) return;
    accumulatedSites = dedupePublicSites([...accumulatedSites, ...sites]).slice(0, publicSiteMarkerLimit);
    if (flushTimer) return;
    flushTimer = window.setTimeout(flushAccumulatedSites, 140);
  };

  void loadDynamicPublicSitesForSnapshot(snapshot, appendDynamicSites).then((dynamicSites) => {
    if (flushTimer) {
      window.clearTimeout(flushTimer);
      flushTimer = 0;
    }
    if (state.globe?.publicSiteRenderToken !== renderToken) return;
    setPublicSiteCatalog(snapshot, [...initialSites, ...dynamicSites]);
  });
}

function removePin() {
  const { viewer, pin } = state.globe ?? {};
  if (!viewer || !pin) return;
  viewer.entities.remove(pin);
  state.globe.pin = null;
}

function placePin(lat, lon) {
  const { Cesium, viewer } = state.globe ?? {};
  if (!Cesium || !viewer) return;
  removePin();
  const preciseLat = normalizeCoordinate(lat);
  const preciseLon = normalizeCoordinate(normalizeLongitude(lon));

  state.globe.pin = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(preciseLon, preciseLat, 0),
    point: {
      pixelSize: 18,
      color: Cesium.Color.fromCssColorString("#f0b44d"),
      outlineColor: Cesium.Color.fromCssColorString("#5c3510"),
      outlineWidth: 2,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    }
  });
}

function estimateExtentKm(extent, lat) {
  const safeExtent = normalizeExtent(extent);
  if (!safeExtent) return 0;
  let lonSpan = Math.abs(safeExtent.east - safeExtent.west);
  if (lonSpan > 180) lonSpan = 360 - lonSpan;
  const latSpan = Math.abs(safeExtent.north - safeExtent.south);
  const widthKm = lonSpan * 111.32 * Math.max(0.25, Math.cos((Math.abs(lat) * Math.PI) / 180));
  const heightKm = latSpan * 111.32;
  return Math.max(widthKm, heightKm);
}

function expandExtentForDisplay(extent, minSpanDegrees = 1.4) {
  const safeExtent = normalizeExtent(extent);
  if (!safeExtent) return null;
  const centerLat = (safeExtent.south + safeExtent.north) / 2;
  const centerLon = normalizeLongitude((safeExtent.west + safeExtent.east) / 2);
  const halfLat = Math.max((safeExtent.north - safeExtent.south) / 2, minSpanDegrees / 2);
  const halfLon = Math.max(Math.abs(safeExtent.east - safeExtent.west) / 2, minSpanDegrees / 2);
  return normalizeExtent({
    west: centerLon - halfLon,
    east: centerLon + halfLon,
    south: centerLat - halfLat,
    north: centerLat + halfLat
  });
}

function getAutoCameraHeight(snapshot) {
  return snapshot ? searchCameraHeightMeters : null;
}

function orientGlobeToLocation(lat, lon, extent = null, options = {}) {
  const { Cesium, viewer } = state.globe ?? {};
  if (!Cesium || !viewer) return;

  const requestedHeight = toFiniteNumber(options.heightMeters);
  const extentKm = estimateExtentKm(extent, lat);
  const height = Number.isFinite(requestedHeight)
    ? Math.max(250, requestedHeight)
    : extentKm
      ? Math.max(120000, Math.min(9000000, extentKm * 3200))
      : 1100000;
  const destination = Cesium.Cartesian3.fromDegrees(lon, lat, height);
  viewer.camera.flyTo({
    destination,
    orientation: {
      heading: 0,
      pitch: Cesium.Math.toRadians(-88),
      roll: 0
    },
    duration: reducedMotionQuery.matches ? 0 : 0.75,
    complete: () => {
      scheduleScaleUpdate();
      schedulePublicSiteVisibilityUpdate();
    }
  });
}

function attachEvents() {
  const sourceDropzone = $(selectors.sourceDropzone);
  let sourceDragDepth = 0;
  $(selectors.sourceFileInput).addEventListener("change", async (event) => {
    await addSourceFiles(event.target.files);
    event.target.value = "";
  });
  sourceDropzone.addEventListener("dragenter", (event) => {
    event.preventDefault();
    sourceDragDepth += 1;
    sourceDropzone.classList.add("is-dragging");
  });
  sourceDropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    sourceDropzone.classList.add("is-dragging");
  });
  sourceDropzone.addEventListener("dragleave", (event) => {
    event.preventDefault();
    sourceDragDepth = Math.max(0, sourceDragDepth - 1);
    if (!sourceDragDepth) {
      sourceDropzone.classList.remove("is-dragging");
    }
  });
  sourceDropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    sourceDragDepth = 0;
    sourceDropzone.classList.remove("is-dragging");
    addSourceFiles(event.dataTransfer?.files);
  });
  $(selectors.sourceFileList).addEventListener("click", (event) => {
    const gpsButton = event.target.closest("[data-use-source-gps-id]");
    if (gpsButton) {
      const file = state.sourceFiles.find((entry) => entry.id === gpsButton.dataset.useSourceGpsId);
      gpsButton.disabled = true;
      activateSourceFileGps(file)
        .catch((error) => {
          updateResolution(error.message || "Photo GPS could not be mapped.", "restricted");
        })
        .finally(() => {
          gpsButton.disabled = false;
        });
      return;
    }
    const removeButton = event.target.closest("[data-remove-source-file-id]");
    if (removeButton) {
      removeSourceFile(removeButton.dataset.removeSourceFileId);
    }
  });

  $(selectors.locationSearch).addEventListener("input", (event) => renderSearchResults(event.target.value));
  $(selectors.locationSearch).addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      clearLocationSearchState();
      syncControls(getSelectedSnapshot());
      return;
    }
    if (event.key !== "Enter") return;
    const first = $(selectors.searchResults).querySelector("[data-search-index]");
    if (first) first.click();
  });
  [selectors.latInput, selectors.lonInput].forEach((selector) => {
    $(selector).addEventListener("input", () => {
      syncControls(getSelectedSnapshot());
    });
  });
  $("#use-coordinates").addEventListener("click", resolveCoordinatesFromInputs);
  $(selectors.clearWorkflow).addEventListener("click", () => resetAppToStartingPoint());
  $("#clear-snapshots").addEventListener("click", clearSnapshots);
  $("#reason-note").addEventListener("click", reasonFromAnalystNote);
  $("#inject-action").addEventListener("click", injectAction);
  $(selectors.publicSiteHover).addEventListener("click", (event) => {
    if (!event.target.closest("[data-site-hover-close]")) return;
    event.preventDefault();
    hidePublicSiteHover(0, { force: true });
  });
  $(selectors.centerSelected).addEventListener("click", centerSelectedLocation);
  $(selectors.zoomInMap).addEventListener("click", () => zoomMap(0.55));
  $(selectors.zoomOutMap).addEventListener("click", () => zoomMap(1.8));
  $(selectors.confirmMapStep).addEventListener("click", confirmMapStep);
  $(selectors.mapProvider).addEventListener("change", (event) => {
    state.mapConfig.provider = event.target.value;
    renderMapControls();
  });
  $(selectors.addMapProvider).addEventListener("click", () => {
    const panel = $(selectors.customMapSource);
    toggleCustomProviderForm(panel.hidden);
  });
  $(selectors.saveCustomProvider).addEventListener("click", saveCustomProviderFromForm);
  $(selectors.cancelCustomProvider).addEventListener("click", () => toggleCustomProviderForm(false));
  $("#apply-map-source").addEventListener("click", async () => {
    state.mapConfig.provider = $(selectors.mapProvider).value;
    saveMapConfig();
    await applyMapProvider();
    void loadCountryBorders();
    const snapshot = getSelectedSnapshot();
    if (snapshot) {
      placePin(snapshot.lat, snapshot.lon);
      drawSelectedOutlines(snapshot);
      renderPublicSitesForSnapshot(snapshot);
      orientGlobeToLocation(snapshot.lat, snapshot.lon, getSnapshotFocusExtent(snapshot), {
        heightMeters: getAutoCameraHeight(snapshot)
      });
    } else {
      renderPublicSitesForSnapshot(null);
    }
  });
}

async function init() {
  loadState();
  loadMapConfig();
  attachEvents();
  renderMapControls();
  const globeReady = initGlobe().catch((error) => {
    console.warn("Map initialization failed", error);
  });
  await Promise.all([loadTrainingTaxonomy(), loadPublicSites(), loadWorldCapitals(), loadDispositionIndex()]);

  try {
    const response = await fetch(dataUrl);
    if (!response.ok) {
      throw new Error(`Profile data returned ${response.status}`);
    }
    const payload = await response.json();
    state.profiles = (Array.isArray(payload.profiles) ? payload.profiles : [])
      .map(normalizeProfile)
      .filter(Boolean)
      .map(enrichProfileWithDisposition);
    const dispositionNote = state.dispositionIndex.metadata
      ? ` Military disposition DB loaded: ${state.dispositionIndex.metadata.entityCount} entities, ${state.dispositionIndex.metadata.equipmentRows} public equipment rows.`
      : "";
    state.sourceNote = clampText(`${payload.sourceNote || defaultSourceNote}${dispositionNote}`, 420, defaultSourceNote);
    if (!state.profiles.length) {
      throw new Error("No valid public profiles were found.");
    }
    buildSearchIndex();
    const snapshot = getSelectedSnapshot();
    if (snapshot && state.globe) {
      placePin(snapshot.lat, snapshot.lon);
      drawSelectedOutlines(snapshot);
      renderPublicSitesForSnapshot(snapshot);
      orientGlobeToLocation(snapshot.lat, snapshot.lon, getSnapshotFocusExtent(snapshot), {
        heightMeters: getAutoCameraHeight(snapshot)
      });
    } else if (snapshot) {
      void globeReady.then(() => {
        const latestSnapshot = getSelectedSnapshot();
        if (!latestSnapshot || !state.globe) return;
        placePin(latestSnapshot.lat, latestSnapshot.lon);
        drawSelectedOutlines(latestSnapshot);
        renderPublicSitesForSnapshot(latestSnapshot);
        orientGlobeToLocation(latestSnapshot.lat, latestSnapshot.lon, getSnapshotFocusExtent(latestSnapshot), {
          heightMeters: getAutoCameraHeight(latestSnapshot)
        });
      });
    } else if (state.globe) {
      renderPublicSitesForSnapshot(null);
    } else {
      void globeReady.then(() => {
        if (!state.globe) return;
        renderPublicSitesForSnapshot(getSelectedSnapshot());
      });
    }
    renderApp();
  } catch (error) {
    state.profiles = [];
    state.sourceNote = defaultSourceNote;
    renderApp();
    updateResolution(`Data load failed: ${error.message}`, "restricted");
  }
}

function shouldRunDevAutoRefresh() {
  const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);
  const params = new URLSearchParams(window.location.search);
  return ["http:", "https:"].includes(window.location.protocol)
    && localHosts.has(window.location.hostname)
    && params.get("devRefresh") === "1";
}

function buildDevAutoRefreshUrl(resource) {
  const url = new URL(resource, import.meta.url);
  url.searchParams.set("_adaptsim_watch", Date.now().toString());
  return url;
}

function hashDevAutoRefreshText(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${text.length}:${hash >>> 0}`;
}

async function readDevAutoRefreshSignature(resource) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), devAutoRefreshTimeoutMs);
  try {
    const response = await fetch(buildDevAutoRefreshUrl(resource), {
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) return "";
    return hashDevAutoRefreshText(await response.text());
  } finally {
    window.clearTimeout(timeout);
  }
}

function scheduleDevAutoRefresh() {
  if (!shouldRunDevAutoRefresh() || window.__adaptsimAutoRefreshStarted) return;
  window.__adaptsimAutoRefreshStarted = true;
  document.documentElement.dataset.autoRefresh = "on";

  const signatures = new Map();
  let initialized = false;
  let checking = false;
  let reloading = false;

  const checkForChanges = async () => {
    if (reloading || checking) return;
    checking = true;

    try {
      const nextSignatures = await Promise.all(
        devAutoRefreshResources.map(async (resource) => [resource, await readDevAutoRefreshSignature(resource)])
      );
      let hasChanged = false;

      nextSignatures.forEach(([resource, signature]) => {
        if (!signature) return;
        const previous = signatures.get(resource);
        if (initialized && previous && previous !== signature) {
          hasChanged = true;
        }
        signatures.set(resource, signature);
      });

      initialized = true;

      if (hasChanged) {
        reloading = true;
        const refreshUrl = new URL(window.location.href);
        refreshUrl.searchParams.set("r", Date.now().toString());
        window.location.replace(refreshUrl);
      }
    } catch (error) {
      console.debug("AdaptSim auto-refresh check skipped.", error);
    } finally {
      checking = false;
    }
  };

  console.info(`AdaptSim auto-refresh watching ${devAutoRefreshResources.length} local files.`);
  void checkForChanges();
  window.setInterval(checkForChanges, devAutoRefreshIntervalMs);
}

let initPromise = null;

export function initializeAdaptSimWorkbench() {
  if (!initPromise) {
    scheduleDevAutoRefresh();
    initPromise = init();
  }

  return initPromise;
}
