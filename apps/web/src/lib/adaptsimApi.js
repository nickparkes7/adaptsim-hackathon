const defaultApiBase = "/api/v1";
const defaultSceneId = "scan_hallway_alpha";
const defaultCachedSceneId = "safety_park";
const operatorId = "hackathon_demo";

const apiBase = normalizeApiBase(import.meta.env.VITE_ADAPTSIM_API_BASE || defaultApiBase);
const configuredSceneId = import.meta.env.VITE_ADAPTSIM_SCENE_ID || defaultSceneId;
const configuredCachedSceneId = import.meta.env.VITE_ADAPTSIM_CACHED_SCENE_ID || defaultCachedSceneId;
const configuredApiMode = String(import.meta.env.VITE_ADAPTSIM_API_MODE || "").toLowerCase();
const configuredFastForward = String(import.meta.env.VITE_ADAPTSIM_FAST_FORWARD_RECONSTRUCTION ?? "1").toLowerCase();
const forceMockApi = configuredApiMode === "mock";
const preferMockFallback = configuredApiMode === "auto";
const fastForwardDefault = !["0", "false", "off", "no"].includes(configuredFastForward);

const phaseDefinitions = [
  ["created", "Created", 0, "Capture record is ready for image selection."],
  ["uploading", "Uploading", 5, "Signed URLs issued; images are moving to object storage."],
  ["uploaded", "Uploaded", 10, "Images are registered with the capture."],
  ["queued_reconstruction", "Queued", 15, "A100 reconstruction has been queued."],
  ["validating_images", "Validating", 25, "Image set is being validated."],
  ["sfm_solving", "SfM", 40, "Camera poses are being solved."],
  ["reconstructing_splat", "Splat", 52, "Gaussian splat reconstruction is running."],
  ["exporting_splat", "Export", 58, "Splat artifacts are being exported."],
  ["extracting_mesh", "Mesh", 68, "Mesh extraction is running."],
  ["postprocessing_mesh", "Postprocess", 78, "Mesh is being prepared for Unreal import."],
  ["ready_for_unreal_import", "Ready for Unreal", 86, "Reconstruction output is ready for Unreal."],
  ["importing_unreal", "Importing", 92, "L4 worker is importing the scene."],
  ["imported_unreal", "Imported", 98, "Unreal import is complete."],
  ["ready", "Ready", 100, "Scene is ready for simulation."]
];

export const capturePhaseCatalog = phaseDefinitions.map(([id, label, percent, description]) => ({
  id,
  label,
  percent,
  description
}));

export const terminalCaptureStatuses = new Set(["ready", "failed", "sfm_failed"]);
export const failureCaptureStatuses = new Set(["failed", "sfm_failed"]);

export const adaptsimApiConfig = {
  apiBase,
  defaultSceneId: configuredSceneId,
  cachedSceneId: configuredCachedSceneId,
  operatorId,
  mode: forceMockApi ? "mock" : preferMockFallback ? "auto" : "live",
  isMockMode: forceMockApi,
  fastForwardDefault
};

const mockCaptureStore = new Map();
const mockRunStore = new Map();
const mockGeneratedAssetStore = new Map();

const mockScenarios = [
  {
    scenario_id: "scan_hallway_delay_001",
    display_name: "UAV Recon To Delayed Contact",
    status: "ready",
    training_objective:
      "Move from entry to exit while identifying aerial reconnaissance, avoiding the chokepoint, and responding to delayed contact.",
    event_count: 3,
    severity_max: 0.82,
    manifest_url: "/api/v1/scenarios/scan_hallway_delay_001/manifest"
  },
  {
    scenario_id: "scan_hallway_observer_002",
    display_name: "UGV Probe With Overwatch",
    status: "ready",
    training_objective:
      "Recognize a ground probe, deny the open approach vector, and bound toward cover while an overwatch role activates.",
    event_count: 4,
    severity_max: 0.74,
    manifest_url: "/api/v1/scenarios/scan_hallway_observer_002/manifest"
  }
];

function buildMockThreatInjectionPlan(sceneId = configuredSceneId) {
  const resolvedSceneId = sceneId || configuredSceneId || "safety_park";
  return {
    contract_type: "threat_injection_plan",
    schema_version: "0.1-demo",
    scene_id: resolvedSceneId,
    source: "frontend_fixture_until_agent_d_endpoint",
    demo_mode: "cached",
    readiness: {
      reconstruction: "cached_loaded",
      threat_assets: "generated",
      threat_plan: "compiled",
      simulation: "ready"
    },
    objective:
      "Move from entry to exit while identifying aerial reconnaissance and responding to delayed dismounted contact.",
    scene_affordances: [
      {
        anchor_id: "entry_gate",
        role: "trainee_spawn",
        tactical_label: "Entry",
        finding: "Covered start with a clean path into the training lane."
      },
      {
        anchor_id: "main_path_chokepoint",
        role: "movement_pressure_point",
        tactical_label: "Chokepoint",
        finding: "Narrow movement channel forces a decision before the exit is visible."
      },
      {
        anchor_id: "low_wall_cover",
        role: "cover_position",
        tactical_label: "Cover",
        finding: "Hard cover supports the expected bound after contact."
      },
      {
        anchor_id: "tree_line_north",
        role: "uav_entry_vector",
        tactical_label: "Open sky / tree line",
        finding: "Clear aerial approach vector for a small UAV visual."
      },
      {
        anchor_id: "service_cut_los",
        role: "line_of_sight_break",
        tactical_label: "Line of sight",
        finding: "Interrupted sightline supports delayed reveal of adversary actors."
      },
      {
        anchor_id: "exit_zone",
        role: "completion_zone",
        tactical_label: "Exit",
        finding: "Scenario completion zone with room for Pixel Streaming handoff."
      }
    ],
    threat_assets: [
      {
        asset_id: "uav_fpv_quadrotor_recon",
        display_name: "FPV Recon Quadcopter",
        threat_category: "uav",
        movement_domain: "air",
        tactical_role: "recon",
        generation_status: "cached_ready",
        runtime_binding: "simple_drone_patrol"
      },
      {
        asset_id: "ugv_low_profile_probe",
        display_name: "Low-Profile UGV Probe",
        threat_category: "ugv",
        movement_domain: "ground",
        tactical_role: "decoy",
        generation_status: "ready",
        runtime_binding: "vehicle_actor"
      },
      {
        asset_id: "adversary_rifleman_irregular",
        display_name: "Dismounted Contact Team",
        threat_category: "dismounted_personnel",
        movement_domain: "ground",
        tactical_role: "ambush",
        generation_status: "runtime_actor_ready",
        runtime_binding: "adapt_sim_adversary_runtime"
      },
      {
        asset_id: "sensor_payload_gimbal_visual",
        display_name: "EO/IR Sensor Payload",
        threat_category: "sensor_payload",
        movement_domain: "air",
        tactical_role: "overwatch",
        generation_status: "cached_ready",
        runtime_binding: "visual_equipment"
      },
      {
        asset_id: "adversary_vehicle_utility",
        display_name: "Adversary Utility Vehicle",
        threat_category: "vehicle",
        movement_domain: "ground",
        tactical_role: "patrol",
        generation_status: "generating",
        runtime_binding: "pending_review"
      }
    ],
    spawn_entry_anchors: ["tree_line_north", "main_path_chokepoint", "service_cut_los"],
    triggers: ["on_scenario_start", "trainee_enters_chokepoint", "trainee_crosses_los_break"],
    expected_trainee_response:
      "Identify the aerial threat, avoid lingering in the chokepoint, move to cover, report contact, and continue to the exit zone.",
    threat_sequence: [
      {
        step: 1,
        trigger: "on_scenario_start",
        action: "spawn_uav_recon",
        anchor_id: "tree_line_north",
        trainee_task: "Identify aerial threat before entering the chokepoint."
      },
      {
        step: 2,
        trigger: "trainee_enters_chokepoint",
        action: "activate_ugv_decoy",
        anchor_id: "main_path_chokepoint",
        trainee_task: "Avoid fixation on the ground probe and move to cover."
      },
      {
        step: 3,
        trigger: "trainee_crosses_los_break",
        action: "spawn_dismounted_contact",
        anchor_id: "service_cut_los",
        trainee_task: "React to delayed contact and continue to the exit."
      }
    ],
    assumptions: [
      "Plausible training threat, not calibrated intelligence truth.",
      "Runtime behavior can bind Trellis visuals to existing Unreal drone, vehicle, or adversary actors."
    ]
  };
}

export function adaptThreatInjectionPlanPayload(payload, sceneId = configuredSceneId) {
  const fallback = buildMockThreatInjectionPlan(sceneId);
  const source = payload && typeof payload === "object" ? payload : fallback;
  const rawAssets = Array.isArray(source.threat_assets)
    ? source.threat_assets
    : Array.isArray(source.assets)
      ? source.assets
      : fallback.threat_assets;
  const rawAffordances = Array.isArray(source.scene_affordances)
    ? source.scene_affordances
    : Array.isArray(source.affordances)
      ? source.affordances
      : fallback.scene_affordances;
  const rawSequence = Array.isArray(source.threat_sequence)
    ? source.threat_sequence
    : Array.isArray(source.sequence)
      ? source.sequence
      : fallback.threat_sequence;

  return {
    ...fallback,
    ...source,
    scene_id: source.scene_id || sceneId || fallback.scene_id,
    objective: source.objective || source.training_objective || fallback.objective,
    scene_affordances: rawAffordances.map((affordance, index) => ({
      anchor_id: affordance.anchor_id || affordance.id || `anchor_${index + 1}`,
      role: affordance.role || affordance.type || "scenario_anchor",
      tactical_label: affordance.tactical_label || affordance.label || affordance.role || "Anchor",
      finding: affordance.finding || affordance.description || affordance.note || ""
    })),
    threat_assets: rawAssets.map((asset, index) => ({
      asset_id: asset.asset_id || asset.id || `threat_asset_${index + 1}`,
      display_name: asset.display_name || asset.name || asset.asset_id || `Threat Asset ${index + 1}`,
      threat_category: asset.threat_category || asset.category || "threat_asset",
      movement_domain: asset.movement_domain || asset.domain || "ground",
      tactical_role: asset.tactical_role || asset.role || "patrol",
      generation_status: asset.generation_status || asset.visual_status || asset.status || "pending_review",
      runtime_binding: asset.runtime_binding || asset.binding || "pending_review"
    })),
    threat_sequence: rawSequence.map((step, index) => ({
      step: Number(step.step || index + 1),
      trigger: step.trigger || "manual_start",
      action: step.action || step.event || "activate_threat",
      anchor_id: step.anchor_id || step.anchor || fallback.spawn_entry_anchors[index] || "scenario_anchor",
      trainee_task: step.trainee_task || step.expected_response || "Maintain awareness and continue the objective."
    })),
    spawn_entry_anchors: Array.isArray(source.spawn_entry_anchors)
      ? source.spawn_entry_anchors
      : rawSequence.map((step) => step.anchor_id || step.anchor).filter(Boolean),
    triggers: Array.isArray(source.triggers)
      ? source.triggers
      : rawSequence.map((step) => step.trigger).filter(Boolean),
    assumptions: Array.isArray(source.assumptions) && source.assumptions.length ? source.assumptions : fallback.assumptions
  };
}

function normalizeApiBase(value) {
  return String(value || defaultApiBase).replace(/\/+$/, "");
}

function apiOrigin() {
  try {
    return new URL(apiBase).origin;
  } catch {
    return window.location.origin;
  }
}

function pathFromApiUrl(value) {
  const path = String(value || "");
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/api/v1/")) return path.slice("/api/v1".length);
  if (path.startsWith("api/v1/")) return path.slice("api/v1".length);
  return path.startsWith("/") ? path : `/${path}`;
}

function apiUrl(path) {
  const value = String(path || "");
  if (/^https?:\/\//i.test(value) || value.startsWith("data:")) return value;
  return `${apiBase}${pathFromApiUrl(value)}`;
}

export function artifactUrl(path) {
  const value = String(path || "");
  if (!value) return "";
  if (/^(https?:|data:|blob:|mailto:)/i.test(value)) return value;
  if (value.startsWith("gs://")) return "";
  if (value.startsWith("/api/")) return `${apiOrigin()}${value}`;
  if (value.startsWith("/")) return `${apiOrigin()}${value}`;
  return `${apiBase}/${value.replace(/^\/+/, "")}`;
}

export function formatApiError(error) {
  if (!error) return "Unknown AdaptSim API error.";
  return error.userMessage || error.message || "Unknown AdaptSim API error.";
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

async function requestJson(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const payload = await readJsonResponse(response);
  if (!response.ok) {
    const message = payload?.error || payload?.message || `AdaptSim API returned ${response.status}.`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function liveOrMock(mockOperation, liveOperation) {
  if (forceMockApi) return mockOperation();
  try {
    return await liveOperation();
  } catch (error) {
    if (!preferMockFallback) throw error;
    if (error?.status && error.status < 500) throw error;
    console.warn("AdaptSim API unavailable; using mock response.", error);
    return mockOperation();
  }
}

function slugify(value) {
  return String(value || "capture")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 52) || "capture";
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function buildMockGcsPrefix(captureId) {
  return `gs://mock-adaptsim/adaptsim-captures/captures/${captureId}/`;
}

function phaseForMockCapture(capture) {
  if (capture.status === "created" || capture.status === "uploading" || capture.status === "uploaded") {
    return capture.status;
  }
  const elapsed = Date.now() - (capture.submittedAt || Date.now());
  const sequence = [
    [0, "queued_reconstruction"],
    [1400, "validating_images"],
    [3000, "sfm_solving"],
    [4800, "reconstructing_splat"],
    [6600, "exporting_splat"],
    [8000, "extracting_mesh"],
    [9800, "postprocessing_mesh"],
    [11200, "ready_for_unreal_import"],
    [12800, "importing_unreal"],
    [14400, "imported_unreal"],
    [15800, "ready"]
  ];
  return sequence.reduce((phase, [start, name]) => (elapsed >= start ? name : phase), "queued_reconstruction");
}

function phaseMeta(status) {
  return capturePhaseCatalog.find((phase) => phase.id === status) || {
    id: status,
    label: status,
    percent: status === "failed" || status === "sfm_failed" ? 100 : 0,
    description: "Capture status updated."
  };
}

function mockCaptureArtifacts(captureId, ready = false) {
  const prefix = buildMockGcsPrefix(captureId);
  return {
    raw_metadata_uri: `${prefix}raw/metadata.json`,
    sfm_report_uri: ready ? `${prefix}sfm/colmap/report.json` : null,
    splat_ply_uri: ready ? `${prefix}reconstruction/splat.ply` : null,
    splat_usdz_url: ready ? `data:text/plain;charset=utf-8,Mock%20USDZ%20artifact%20for%20${captureId}` : null,
    mesh_preview_url: ready ? `data:text/plain;charset=utf-8,Mock%20mesh%20preview%20for%20${captureId}` : null,
    unreal_mesh_url: ready ? `data:text/plain;charset=utf-8,Mock%20Unreal%20mesh%20for%20${captureId}` : null,
    reconstruction_manifest_uri: ready ? `${prefix}unreal-import/reconstruction_manifest.json` : null,
    unreal_import_report_uri: ready ? `${prefix}unreal/import_report.json` : null,
    semantic_environment_uri: ready ? `${prefix}unreal/semantic_environment.json` : null
  };
}

function buildMockCaptureStatus(capture) {
  const status = phaseForMockCapture(capture);
  capture.status = status;
  const meta = phaseMeta(status);
  const ready = status === "ready";
  const inputImages = capture.uploadedImageCount || capture.expected_image_count || capture.files?.length || 0;
  return {
    contract_type: "capture_status",
    schema_version: "1.0",
    capture_id: capture.capture_id,
    display_name: capture.display_name,
    status,
    updated_at: new Date().toISOString(),
    gcs_prefix: buildMockGcsPrefix(capture.capture_id),
    progress: {
      phase: status,
      message: meta.description,
      percent: meta.percent
    },
    sfm: {
      input_images: inputImages,
      registered_images: ready ? Math.max(0, inputImages - Math.min(3, inputImages)) : null
    },
    artifacts: mockCaptureArtifacts(capture.capture_id, ready || meta.percent >= 86),
    unreal: {
      status: ready ? "ready" : meta.percent >= 92 ? "importing" : "not_started",
      level_path: ready ? `/Game/Maps/L_${capture.capture_id}` : null,
      import_report_uri: ready ? `${buildMockGcsPrefix(capture.capture_id)}unreal/import_report.json` : null
    },
    error: null
  };
}

function buildMockSceneStatus(sceneId) {
  if (sceneId === defaultSceneId || !mockCaptureStore.has(sceneId)) {
    return {
      scene_id: sceneId || defaultSceneId,
      display_name: sceneId === defaultSceneId ? "Cached Safety Park Training Lane" : sceneId,
      status: "ready",
      source_scan_id: "scan_hallway_alpha_raw",
      unreal_level_path: "/Game/Maps/L_ScannedHallwayAlpha",
      updated_at: new Date().toISOString(),
      anchor_count: 7,
      scenario_count: mockScenarios.length,
      stream: {
        status: "available",
        provider: "unreal_pixel_streaming"
      },
      artifacts: {
        semantic_environment_url: "/api/v1/artifacts/semantic_environments/scan_hallway_alpha"
      }
    };
  }

  const captureStatus = buildMockCaptureStatus(mockCaptureStore.get(sceneId));
  const ready = captureStatus.status === "ready";
  return {
    scene_id: captureStatus.capture_id,
    display_name: captureStatus.display_name,
    status: ready ? "ready" : failureCaptureStatuses.has(captureStatus.status) ? "failed" : "reconstructing",
    source_scan_id: captureStatus.capture_id,
    unreal_level_path: captureStatus.unreal?.level_path || null,
    updated_at: captureStatus.updated_at,
    anchor_count: ready ? 7 : 0,
    scenario_count: ready ? mockScenarios.length : 0,
    stream: {
      status: ready ? "available" : "unavailable",
      provider: "unreal_pixel_streaming"
    },
    artifacts: {
      semantic_environment_url: ready ? `/api/v1/captures/${captureStatus.capture_id}/artifacts/semantic_environment` : null
    }
  };
}

function buildMockGeneratedAssetDatabase(session) {
  const sourceFiles = session.sourceFiles || [];
  const sourceCount = sourceFiles.length;
  const firstSourceName = sourceFiles[0]?.name || "capture source";
  return {
    contract_type: "generated_asset_database",
    schema_version: "1.0",
    session_summary: `GPT-5.5 generated a threat asset database from ${sourceCount || 1} capture source${sourceCount === 1 ? "" : "s"}, anchored on ${firstSourceName}.`,
    input_evidence: sourceFiles.slice(0, 4).map((source) => ({
      source_id: source.id,
      name: source.name,
      cue: "Capture lane source image"
    })),
    asset_cards: [
      {
        asset_id: "uav_fpv_quadrotor_recon",
        display_name: "FPV Recon Quadcopter",
        category: "uav",
        movement_domain: "air",
        tactical_role: "recon",
        lifecycle_status: "demo_ready",
        spawn_policy: "bind_to_drone_actor"
      },
      {
        asset_id: "ugv_low_profile_probe",
        display_name: "Low-Profile UGV Probe",
        category: "ugv",
        movement_domain: "ground",
        tactical_role: "decoy",
        lifecycle_status: "demo_ready",
        spawn_policy: "bind_to_vehicle_actor"
      },
      {
        asset_id: "adversary_rifleman_irregular",
        display_name: "Dismounted Contact Team",
        category: "dismounted_personnel",
        movement_domain: "ground",
        tactical_role: "ambush",
        lifecycle_status: "runtime_actor_ready",
        spawn_policy: "bind_to_adversary_actor"
      },
      {
        asset_id: "sensor_payload_gimbal_visual",
        display_name: "EO/IR Sensor Payload",
        category: "sensor_payload",
        movement_domain: "air",
        tactical_role: "overwatch",
        lifecycle_status: "demo_ready",
        spawn_policy: "visual_equipment_attachment"
      }
    ],
    trellis_candidates: [
      {
        asset_id: "uav_fpv_quadrotor_recon",
        display_name: "FPV Recon Quadcopter",
        generation_prompt:
          "A compact FPV-style training quadcopter visual with ducted rotors, a forward camera pod, matte composite surfaces, and no readable markings.",
        visual_descriptor: "Small aerial reconnaissance threat visual with camera-forward silhouette.",
        scale_descriptor: "About 0.35 meters across."
      },
      {
        asset_id: "ugv_low_profile_probe",
        display_name: "Low-Profile UGV Probe",
        generation_prompt:
          "A low-profile unmanned ground vehicle training visual with rugged wheels, a sensor mast, compact chassis, and weathered field finish.",
        visual_descriptor: "Ground probe silhouette for decoy or patrol behavior.",
        scale_descriptor: "About 0.8 meters long and 0.35 meters tall."
      },
      {
        asset_id: "sensor_payload_gimbal_visual",
        display_name: "EO/IR Sensor Payload",
        generation_prompt:
          "A compact electro-optical sensor gimbal visual for a training UAV, with rounded turret housing, lens glass, and neutral non-branded materials.",
        visual_descriptor: "Sensor payload visual that can attach to a drone actor.",
        scale_descriptor: "About 0.16 meters wide."
      }
    ],
    behavior_profiles: [],
    scenario_seed_notes: ["Use generated threat visuals as reviewed training assets before ScenarioDirector spawning."],
    cautions: ["Mock threat asset database; plausible training threat, not calibrated intelligence truth."]
  };
}

function buildMockGeneratedAssetSession(session) {
  const elapsed = Date.now() - session.createdAt;
  const databaseReady = elapsed >= 4200;
  const generationStatus = elapsed < 600 ? "queued" : databaseReady ? "complete" : "running";
  const assetDatabase = databaseReady ? buildMockGeneratedAssetDatabase(session) : null;
  const trellisElapsed = Math.max(0, elapsed - 4200);
  const trellisStatus = !databaseReady
    ? "not_started"
    : trellisElapsed < 900
      ? "queued"
      : trellisElapsed < 3200
        ? "running"
        : "submitted";

  return {
    session_id: session.session_id,
    status: databaseReady ? "asset_database_ready" : "generating_asset_database",
    status_url: `/api/v1/generative-assets/sessions/${session.session_id}`,
    storage_path: `.adaptsim/mock-generated-sessions/${session.session_id}`,
    input_fingerprint: session.input_fingerprint,
    generation: {
      provider: "openai",
      model: "gpt-5.5",
      status: generationStatus,
      error: ""
    },
    asset_database: assetDatabase,
    trellis: {
      model: "microsoft/TRELLIS.2-4B",
      status: trellisStatus,
      endpoint_configured: true,
      job_id: databaseReady ? `trellis_${session.session_id}` : "",
      request_path: databaseReady ? `.adaptsim/mock-generated-sessions/${session.session_id}/trellis_request.json` : "",
      error: ""
    }
  };
}

function mockPixelStreamDataUrl(runId, scenarioId) {
  const html = `<!doctype html><html><body style="margin:0;background:#07100f;color:#fff7e8;font-family:system-ui;display:grid;place-items:center;min-height:100vh"><main style="max-width:680px;padding:32px;text-align:center"><p style="letter-spacing:.12em;text-transform:uppercase;color:#f3ad4e;font-weight:800">Mock Pixel Streaming</p><h1 style="margin:.25rem 0 1rem;font-size:42px">AdaptSim Training Vignette</h1><p>Run ${runId} is connected to ${scenarioId}. Threat injection plan compiled; replace mock mode with the control API to embed the live Unreal stream.</p></main></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

export function createCapture(payload) {
  return liveOrMock(
    async () => {
      const captureId = `${slugify(payload.display_name)}_${Date.now().toString(36)}`.slice(0, 80);
      const capture = {
        ...payload,
        capture_id: captureId,
        status: "created",
        files: [],
        uploadedImageCount: 0,
        createdAt: Date.now()
      };
      mockCaptureStore.set(captureId, capture);
      return {
        capture_id: captureId,
        status: "created",
        gcs_prefix: buildMockGcsPrefix(captureId)
      };
    },
    () => requestJson("/captures", { method: "POST", body: JSON.stringify(payload) })
  );
}

export function requestUploadUrls(captureId, files) {
  const filePayload = files.map((file) => ({
    filename: file.name,
    content_type: file.type || "application/octet-stream",
    size_bytes: file.size
  }));

  return liveOrMock(
    async () => {
      const capture = mockCaptureStore.get(captureId);
      if (capture) {
        capture.status = "uploading";
        capture.files = filePayload;
      }
      return {
        capture_id: captureId,
        uploads: filePayload.map((file) => ({
          filename: file.filename,
          method: "PUT",
          upload_url: `mock://signed-upload/${captureId}/${encodeURIComponent(file.filename)}`,
          gcs_uri: `${buildMockGcsPrefix(captureId)}raw/images/${file.filename}`,
          content_type: file.content_type,
          size_bytes: file.size_bytes,
          headers: {
            "Content-Type": file.content_type
          },
          expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString()
        }))
      };
    },
    () => requestJson(`/captures/${captureId}/upload-urls`, { method: "POST", body: JSON.stringify({ files: filePayload }) })
  );
}

export async function uploadFileToSignedUrl(file, upload) {
  if (String(upload.upload_url || "").startsWith("mock://")) {
    await delay(120 + Math.min(480, Math.round(file.size / 50000)));
    return { ok: true, mocked: true };
  }

  const headers = upload.headers || {};
  if (!headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = upload.content_type || file.type || "application/octet-stream";
  }

  const response = await fetch(upload.upload_url, {
    method: upload.method || "PUT",
    headers,
    body: file
  });
  if (!response.ok) {
    throw new Error(`Upload failed for ${file.name}: ${response.status} ${response.statusText}`);
  }
  return { ok: true };
}

export function submitCapture(captureId, uploadedImageCount, options = {}) {
  const payload = {
    uploaded_image_count: uploadedImageCount,
    start_reconstruction: options.startReconstruction !== false
  };

  return liveOrMock(
    async () => {
      const capture = mockCaptureStore.get(captureId);
      if (capture) {
        capture.status = payload.start_reconstruction ? "queued_reconstruction" : "uploaded";
        capture.submittedAt = Date.now();
        capture.uploadedImageCount = uploadedImageCount;
      }
      return {
        capture_id: captureId,
        status: payload.start_reconstruction ? "queued_reconstruction" : "uploaded",
        status_url: `/api/v1/captures/${captureId}/status`
      };
    },
    () => requestJson(`/captures/${captureId}/submit`, { method: "POST", body: JSON.stringify(payload) })
  );
}

export function getCaptureStatus(captureId) {
  return liveOrMock(
    async () => {
      const capture = mockCaptureStore.get(captureId);
      if (!capture) throw new Error(`Mock capture ${captureId} was not found.`);
      return buildMockCaptureStatus(capture);
    },
    () => requestJson(`/captures/${captureId}/status`)
  );
}

export function getCaptureArtifacts(captureId) {
  return liveOrMock(
    async () => ({
      capture_id: captureId,
      artifacts: [
        {
          artifact_type: "splat_usdz",
          content_type: "model/vnd.usdz+zip",
          gcs_uri: `${buildMockGcsPrefix(captureId)}reconstruction/splat.usdz`,
          url: `data:text/plain;charset=utf-8,Mock%20splat%20artifact%20for%20${captureId}`
        },
        {
          artifact_type: "unreal_mesh_glb",
          content_type: "model/gltf-binary",
          gcs_uri: `${buildMockGcsPrefix(captureId)}unreal-import/scene_mesh.glb`,
          url: `data:text/plain;charset=utf-8,Mock%20GLB%20artifact%20for%20${captureId}`
        }
      ]
    }),
    () => requestJson(`/captures/${captureId}/artifacts`)
  );
}

export function getSafetyParkDemoSourceImages() {
  return requestJson("/demo/safety-park/source-images");
}

export function createGeneratedAssetSession(payload) {
  return liveOrMock(
    async () => {
      const sourceFiles = Array.isArray(payload?.sourceFiles) ? payload.sourceFiles : [];
      const sessionId = `asset_${slugify(payload?.displayName || sourceFiles[0]?.name || "capture")}_${Date.now().toString(36)}`.slice(0, 90);
      const session = {
        session_id: sessionId,
        sourceFiles,
        createdAt: Date.now(),
        input_fingerprint: Date.now().toString(36)
      };
      mockGeneratedAssetStore.set(sessionId, session);
      return buildMockGeneratedAssetSession(session);
    },
    () =>
      requestJson("/generative-assets/sessions", {
        method: "POST",
        body: JSON.stringify(payload)
      })
  );
}

export function getGeneratedAssetSession(sessionId) {
  return liveOrMock(
    async () => {
      const session = mockGeneratedAssetStore.get(sessionId);
      if (!session) throw new Error(`Mock generated asset session ${sessionId} was not found.`);
      return buildMockGeneratedAssetSession(session);
    },
    () => requestJson(`/generative-assets/sessions/${sessionId}`)
  );
}

export function relayGeneratedAssetSessionToTrellis(sessionId) {
  return liveOrMock(
    async () => {
      const session = mockGeneratedAssetStore.get(sessionId);
      if (!session) throw new Error(`Mock generated asset session ${sessionId} was not found.`);
      const payload = buildMockGeneratedAssetSession(session);
      return payload.trellis;
    },
    () =>
      requestJson(`/generative-assets/sessions/${sessionId}/trellis`, {
        method: "POST"
      })
  );
}

export function getSceneStatus(sceneId) {
  return liveOrMock(
    async () => buildMockSceneStatus(sceneId),
    () => requestJson(`/scenes/${sceneId}/status`)
  );
}

export function getScenarios(sceneId) {
  return liveOrMock(
    async () => {
      const capture = mockCaptureStore.get(sceneId);
      if (capture && buildMockCaptureStatus(capture).status !== "ready") {
        return { scene_id: sceneId, scenarios: [] };
      }
      return { scene_id: sceneId, scenarios: mockScenarios };
    },
    () => requestJson(`/scenes/${sceneId}/scenarios`)
  );
}

export async function getThreatInjectionPlan(sceneId) {
  const resolvedSceneId = sceneId || configuredSceneId;
  const mockPlan = () => adaptThreatInjectionPlanPayload(buildMockThreatInjectionPlan(resolvedSceneId), resolvedSceneId);
  if (forceMockApi) return mockPlan();

  try {
    const payload = await requestJson(`/scenes/${encodeURIComponent(resolvedSceneId)}/threat-injection-plan`);
    return adaptThreatInjectionPlanPayload(payload, resolvedSceneId);
  } catch (error) {
    if (!preferMockFallback && error?.status && error.status < 500 && error.status !== 404) {
      throw error;
    }
    console.warn("Threat injection endpoint unavailable; using frontend fixture.", error);
    return mockPlan();
  }
}

export function launchScenario(sceneId, scenarioId) {
  const payload = {
    operator_id: operatorId,
    mode: "stream",
    reuse_warm_session: true
  };

  return liveOrMock(
    async () => {
      const runId = `run_${scenarioId}_${Date.now().toString(36)}`;
      mockRunStore.set(runId, {
        run_id: runId,
        scene_id: sceneId,
        scenario_id: scenarioId,
        createdAt: Date.now()
      });
      return {
        run_id: runId,
        scene_id: sceneId,
        scenario_id: scenarioId,
        status: "launching",
        stream: {
          status: "launching",
          embed_url: null,
          poll_url: `/api/v1/runs/${runId}/stream`
        }
      };
    },
    () =>
      requestJson(`/scenes/${sceneId}/scenarios/${scenarioId}/launch`, {
        method: "POST",
        body: JSON.stringify(payload)
      })
  );
}

export function getRunStream(runIdOrPollUrl) {
  const value = String(runIdOrPollUrl || "");
  const runId = value.includes("/runs/") ? value.match(/\/runs\/([^/]+)/)?.[1] : value;
  return liveOrMock(
    async () => {
      const run = mockRunStore.get(runId);
      if (!run) throw new Error(`Mock run ${runId} was not found.`);
      const ready = Date.now() - run.createdAt > 1600;
      return {
        run_id: runId,
        status: ready ? "ready" : "launching",
        stream: {
          status: ready ? "ready" : "launching",
          provider: "unreal_pixel_streaming",
          embed_url: ready ? mockPixelStreamDataUrl(runId, run.scenario_id) : null,
          signaling_url: ready ? "ws://127.0.0.1:8080/signalling" : null,
          expires_at: ready ? new Date(Date.now() + 60 * 60 * 1000).toISOString() : null
        }
      };
    },
    () => requestJson(value.includes("/") ? pathFromApiUrl(value) : `/runs/${runId}/stream`)
  );
}

export function getRunTelemetry(runId) {
  return liveOrMock(
    async () => {
      const run = mockRunStore.get(runId);
      return {
        contract_type: "telemetry_log",
        schema_version: "1.0",
        run_id: runId,
        scenario_id: run?.scenario_id || "scan_hallway_delay_001",
        events: [
          {
            event_id: "run_started_001",
            timestamp: new Date(Date.now() - 9000).toISOString(),
            sim_time_s: 0,
            source: "scenario_director",
            event_type: "run_started",
            data: { operator: operatorId }
          },
          {
            event_id: "trigger_fired_001",
            timestamp: new Date(Date.now() - 6200).toISOString(),
            sim_time_s: 4.8,
            source: "scenario_director",
            event_type: "uav_recon_spawned",
            anchor_id: "tree_line_north",
            data: { trigger_type: "on_scenario_start", runtime_binding: "simple_drone_patrol" }
          },
          {
            event_id: "trigger_fired_002",
            timestamp: new Date(Date.now() - 3600).toISOString(),
            sim_time_s: 7.1,
            source: "scenario_director",
            event_type: "dismounted_contact_spawned",
            anchor_id: "service_cut_los",
            data: { trigger_type: "trainee_crosses_los_break", runtime_binding: "adapt_sim_adversary_runtime" }
          },
          {
            event_id: "run_ready_001",
            timestamp: new Date().toISOString(),
            sim_time_s: 8.2,
            source: "pixel_streaming",
            event_type: "stream_ready",
            data: { provider: "unreal_pixel_streaming" }
          }
        ]
      };
    },
    () => requestJson(`/runs/${runId}/telemetry?tail=50`)
  );
}

export function getRunArtifacts(runId) {
  return liveOrMock(
    async () => {
      const run = mockRunStore.get(runId);
      const manifest = encodeURIComponent(JSON.stringify({ scenario_id: run?.scenario_id || "scan_hallway_delay_001" }, null, 2));
      const telemetry = encodeURIComponent(JSON.stringify({ run_id: runId, events: ["mock"] }, null, 2));
      const aar = encodeURIComponent(`# After Action Review: ${runId}\n\nMock AAR artifact.`);
      return {
        run_id: runId,
        artifacts: [
          {
            artifact_type: "scenario_manifest",
            content_type: "application/json",
            url: `data:application/json;charset=utf-8,${manifest}`
          },
          {
            artifact_type: "telemetry_log",
            content_type: "application/json",
            url: `data:application/json;charset=utf-8,${telemetry}`
          },
          {
            artifact_type: "after_action_review",
            content_type: "text/markdown",
            url: `data:text/markdown;charset=utf-8,${aar}`
          }
        ]
      };
    },
    () => requestJson(`/runs/${runId}/artifacts`)
  );
}

export function getRunAar(runId) {
  return liveOrMock(
    async () => {
      const run = mockRunStore.get(runId);
      return {
        run_id: runId,
        scenario_id: run?.scenario_id || "scan_hallway_delay_001",
        content_type: "text/markdown",
        markdown: `# After Action Review: ${runId}\n\nMock stream reached ready state, the UAV recon event spawned, and delayed contact telemetry was received for ${run?.scenario_id || "scan_hallway_delay_001"}.`
      };
    },
    () => requestJson(`/runs/${runId}/aar`)
  );
}
