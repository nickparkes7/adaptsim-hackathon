const defaultApiBase = "http://127.0.0.1:8787/api/v1";
const defaultSceneId = "scan_hallway_alpha";
const operatorId = "hackathon_demo";

const apiBase = normalizeApiBase(import.meta.env.VITE_ADAPTSIM_API_BASE || defaultApiBase);
const configuredSceneId = import.meta.env.VITE_ADAPTSIM_SCENE_ID || defaultSceneId;
const configuredApiMode = String(import.meta.env.VITE_ADAPTSIM_API_MODE || "").toLowerCase();
const forceMockApi = configuredApiMode === "mock";
const preferMockFallback = configuredApiMode === "auto";

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
  operatorId,
  mode: forceMockApi ? "mock" : preferMockFallback ? "auto" : "live",
  isMockMode: forceMockApi
};

const mockCaptureStore = new Map();
const mockRunStore = new Map();

const mockScenarios = [
  {
    scenario_id: "scan_hallway_delay_001",
    display_name: "Side Room Delay Contact",
    status: "ready",
    training_objective:
      "Detect and respond to delayed contact from an occluded side room while preserving movement discipline through the hallway.",
    event_count: 1,
    severity_max: 0.78,
    manifest_url: "/api/v1/scenarios/scan_hallway_delay_001/manifest"
  },
  {
    scenario_id: "scan_hallway_observer_002",
    display_name: "Partial Obstacle With Observer",
    status: "ready",
    training_objective:
      "Adapt to a partially obstructed hallway while detecting an observer positioned on a covered line of sight.",
    event_count: 2,
    severity_max: 0.62,
    manifest_url: "/api/v1/scenarios/scan_hallway_observer_002/manifest"
  }
];

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
    sfm_report_uri: ready ? `${prefix}sfm/report.json` : null,
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
      display_name: sceneId === defaultSceneId ? "Horror Corridor" : sceneId,
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

function mockPixelStreamDataUrl(runId, scenarioId) {
  const html = `<!doctype html><html><body style="margin:0;background:#07100f;color:#fff7e8;font-family:system-ui;display:grid;place-items:center;min-height:100vh"><main style="max-width:680px;padding:32px;text-align:center"><p style="letter-spacing:.12em;text-transform:uppercase;color:#f3ad4e;font-weight:800">Mock Pixel Streaming</p><h1 style="margin:.25rem 0 1rem;font-size:42px">AdaptSim Runtime</h1><p>Run ${runId} is connected to ${scenarioId}. Replace mock mode with the control API to embed the live Unreal stream.</p></main></body></html>`;
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

export function submitCapture(captureId, uploadedImageCount) {
  const payload = {
    uploaded_image_count: uploadedImageCount,
    start_reconstruction: true
  };

  return liveOrMock(
    async () => {
      const capture = mockCaptureStore.get(captureId);
      if (capture) {
        capture.status = "queued_reconstruction";
        capture.submittedAt = Date.now();
        capture.uploadedImageCount = uploadedImageCount;
      }
      return {
        capture_id: captureId,
        status: "queued_reconstruction",
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
            event_type: "trigger_fired",
            anchor_id: "hallway_main",
            data: { trigger_type: "trainee_enters_anchor" }
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
        markdown: `# After Action Review: ${runId}\n\nMock stream reached ready state and telemetry events were received for ${run?.scenario_id || "scan_hallway_delay_001"}.`
      };
    },
    () => requestJson(`/runs/${runId}/aar`)
  );
}
