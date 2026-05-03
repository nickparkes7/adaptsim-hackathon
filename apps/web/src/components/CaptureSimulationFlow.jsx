import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  adaptsimApiConfig,
  artifactUrl,
  capturePhaseCatalog,
  createCapture,
  createGeneratedAssetSession,
  failureCaptureStatuses,
  formatApiError,
  getCaptureArtifacts,
  getCaptureStatus,
  getGeneratedAssetSession,
  getRunAar,
  getRunArtifacts,
  getRunStream,
  getRunTelemetry,
  getSceneStatus,
  getScenarios,
  getThreatInjectionPlan,
  launchScenario,
  requestUploadUrls,
  submitCapture,
  terminalCaptureStatuses,
  uploadFileToSignedUrl
} from "../lib/adaptsimApi";

const environmentOptions = [
  ["indoor_hallway", "Indoor hallway"],
  ["indoor_room", "Indoor room"],
  ["training_facility", "Training facility"],
  ["urban_exterior", "Urban exterior"],
  ["industrial_site", "Industrial site"],
  ["other", "Other"]
];

const scaleHintOptions = [
  ["known_distance", "Known distance"],
  ["calibration_marker", "Calibration marker"],
  ["unknown", "Unknown"]
];

function humanize(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB"];
  let size = value / 1024;
  let unit = units.shift();
  while (size >= 1024 && units.length) {
    size /= 1024;
    unit = units.shift();
  }
  return `${size >= 10 ? size.toFixed(0) : size.toFixed(1)} ${unit}`;
}

function formatDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function statusTone(status) {
  if (failureCaptureStatuses.has(status) || status === "failed") return "restricted";
  if (status === "ready" || status === "available") return "ready";
  if (status === "launching" || status === "queued_reconstruction" || status === "uploading") return "caution";
  return "neutral";
}

function workflowTone(state) {
  if (state === "ready" || state === "complete" || state === "submitted") return "ready";
  if (state === "running" || state === "queued" || state === "waiting") return "caution";
  if (state === "failed" || state === "blocked") return "restricted";
  return "neutral";
}

function normalizeStatus(value) {
  return String(value || "").toLowerCase();
}

function formatThreatStatus(status) {
  const normalized = normalizeStatus(status);
  if (normalized === "cached_ready") return "cached";
  if (normalized === "runtime_actor_ready") return "ready";
  if (normalized === "pending_review") return "pending review";
  return humanize(status || "pending");
}

function threatStatusTone(status) {
  const normalized = normalizeStatus(status);
  if (["cached_ready", "ready", "runtime_actor_ready", "generated", "compiled"].includes(normalized)) return "ready";
  if (["generating", "queued", "pending_review", "waiting"].includes(normalized)) return "caution";
  if (["failed", "blocked", "rejected"].includes(normalized)) return "restricted";
  return "neutral";
}

function formatRuntimeBinding(binding) {
  const labels = {
    simple_drone_patrol: "Drone actor",
    adapt_sim_adversary_runtime: "Adversary actor",
    vehicle_actor: "Vehicle actor",
    wheeled_vehicle_patrol: "Vehicle actor",
    visual_equipment: "Visual equipment",
    visual_equipment_attachment: "Visual equipment",
    pending_review: "Pending review"
  };
  return labels[normalizeStatus(binding)] || humanize(binding || "pending review");
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}

async function buildGeneratedAssetSourcePayload(files) {
  const imagePayloads = new Map();
  const imageSources = files
    .filter((file) => /^image\/(png|jpe?g|webp)$/i.test(file.type || "") && file.size <= 5 * 1024 * 1024)
    .slice(0, 4);

  await Promise.all(
    imageSources.map(async (file) => {
      try {
        const imageDataUrl = await fileToDataUrl(file);
        if (imageDataUrl.startsWith("data:image/")) imagePayloads.set(file, imageDataUrl);
      } catch {}
    })
  );

  const addedAt = new Date().toISOString();
  return files.map((file, index) => ({
    id: `capture_${index + 1}_${file.name.replace(/[^a-z0-9]+/gi, "_").slice(0, 42)}`,
    name: file.name,
    type: file.type || "application/octet-stream",
    kind: "capture_image",
    size: file.size,
    lastModified: file.lastModified || 0,
    addedAt,
    imageDataUrl: imagePayloads.get(file) || ""
  }));
}

function isAssetDatabaseReady(session) {
  return normalizeStatus(session?.status) === "asset_database_ready" || normalizeStatus(session?.generation?.status) === "complete";
}

function isGeneratedAssetSessionActive(session) {
  if (!session) return false;
  const sessionStatus = normalizeStatus(session.status);
  const generationStatus = normalizeStatus(session.generation?.status);
  const trellisStatus = normalizeStatus(session.trellis?.status);
  return (
    sessionStatus === "generating_asset_database"
    || ["queued", "running"].includes(generationStatus)
    || ["queued", "running", "relaying"].includes(trellisStatus)
  );
}

function selectedImageFiles(fileList) {
  return Array.from(fileList || []).filter((file) => file.type.startsWith("image/") || /\.(jpe?g|png|heic|webp|tiff?)$/i.test(file.name));
}

function updateEntry(entries, index, patch) {
  return entries.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry));
}

function normalizeArtifactEntries(captureStatus, captureArtifacts) {
  const statusArtifacts = Object.entries(captureStatus?.artifacts || {})
    .filter(([, value]) => value)
    .map(([key, value]) => ({
      id: `status-${key}`,
      label: humanize(key),
      value,
      href: artifactUrl(value),
      source: "status"
    }));

  const listedArtifacts = (captureArtifacts || []).map((artifact) => ({
    id: `artifact-${artifact.artifact_type}`,
    label: humanize(artifact.artifact_type),
    value: artifact.gcs_uri || artifact.url,
    href: artifactUrl(artifact.url),
    contentType: artifact.content_type,
    source: "artifact"
  }));

  const seen = new Set();
  return [...listedArtifacts, ...statusArtifacts].filter((entry) => {
    const key = `${entry.label}-${entry.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildCapturePayload(formState) {
  const scaleHint =
    formState.scaleHintType === "unknown"
      ? { type: "unknown" }
      : {
          type: formState.scaleHintType,
          label: formState.scaleHintLabel.trim() || null,
          distance_m: Number(formState.scaleHintDistanceM),
          confidence: "operator_provided"
        };

  return {
    display_name: formState.displayName.trim(),
    operator_id: adaptsimApiConfig.operatorId,
    environment_type: formState.environmentType,
    expected_image_count: Number(formState.expectedImageCount),
    notes: formState.notes.trim() || null,
    scale_hint: scaleHint
  };
}

function readFastForwardPreference() {
  if (typeof window === "undefined") return adaptsimApiConfig.fastForwardDefault;
  const stored = window.localStorage.getItem("adaptsim.fastForwardReconstruction");
  if (stored === "1") return true;
  if (stored === "0") return false;
  return adaptsimApiConfig.fastForwardDefault;
}

function phaseIndex(status) {
  const index = capturePhaseCatalog.findIndex((phase) => phase.id === status);
  return index < 0 ? -1 : index;
}

function buildUnifiedMilestones({
  assetSession,
  assetSessionError,
  assetSessionStarting,
  captureStatus,
  checkpointLoading,
  fastForwardEnabled,
  sceneStatus,
  sceneLoading,
  threatPlan,
  threatPlanError,
  threatPlanLoading,
  runStream
}) {
  const threatAssetCount = threatPlan?.threat_assets?.length ?? 0;
  const sequenceCount = threatPlan?.threat_sequence?.length ?? 0;
  const assetCount = assetSession?.asset_database?.asset_cards?.length ?? threatAssetCount;
  const trellisCount = assetSession?.asset_database?.trellis_candidates?.length ?? threatAssetCount;
  const generationStatus = normalizeStatus(assetSession?.generation?.status || assetSession?.status);
  const trellisStatus = normalizeStatus(assetSession?.trellis?.status);
  const captureUnrealStatus = normalizeStatus(captureStatus?.unreal?.status);
  const capturedSceneStatus = captureStatus?.capture_id && sceneStatus?.scene_id === captureStatus.capture_id ? sceneStatus : null;
  const streamStatus = normalizeStatus(runStream?.stream?.status || runStream?.status);

  let reconstructionMilestone = {
    id: "reconstruction",
    label: fastForwardEnabled ? "fVDB Checkpoint" : "Photo Reconstruction",
    state: "waiting",
    status: "Waiting",
    detail: fastForwardEnabled
      ? "Presenter mode will load a verified cached reconstruction instead of running fVDB live."
      : "Create a capture and queue fVDB reconstruction on the A100.",
    meta: sceneStatus?.scene_id || "No scene"
  };

  if (checkpointLoading) {
    reconstructionMilestone = {
      ...reconstructionMilestone,
      state: "running",
      status: "Loading",
      detail: "Loading verified scene mesh, reconstruction manifest, Unreal import report, and semantic environment.",
      meta: adaptsimApiConfig.cachedSceneId
    };
  } else if (failureCaptureStatuses.has(captureStatus?.status)) {
    reconstructionMilestone = {
      ...reconstructionMilestone,
      state: "failed",
      status: "Blocked",
      detail: captureStatus?.error?.message || captureStatus?.progress?.message || "Reconstruction failed before Unreal import.",
      meta: captureStatus.capture_id
    };
  } else if (captureStatus?.status && captureStatus.status !== "ready") {
    reconstructionMilestone = {
      ...reconstructionMilestone,
      state: captureStatus.status === "created" ? "waiting" : "running",
      status: humanize(captureStatus.status),
      detail: captureStatus?.progress?.message || "Capture is moving through the reconstruction lane.",
      meta: captureStatus.capture_id
    };
  } else if (captureStatus?.status === "ready" || sceneStatus?.status === "ready") {
    reconstructionMilestone = {
      ...reconstructionMilestone,
      state: sceneLoading ? "running" : "ready",
      status: "Loaded",
      detail: fastForwardEnabled
        ? "Verified cached fVDB reconstruction checkpoint is loaded; heavy reconstruction is skipped for the demo."
        : captureStatus?.status === "ready"
        ? "Cached reconstruction loaded from the submitted capture and ready for Unreal."
        : "Cached reconstruction loaded for the demo scene; live capture remains available.",
      meta: capturedSceneStatus?.unreal_level_path || sceneStatus?.unreal_level_path || captureStatus?.unreal?.level_path || "Unreal level ready"
    };
  }

  let assetMilestone = {
    id: "asset-db",
    label: "GPT-5.5 Threat DB",
    state: "waiting",
    status: "Waiting",
    detail: "Waiting for capture evidence or cached demo threat assets.",
    meta: "No session"
  };

  if (assetSessionError) {
    assetMilestone = {
      ...assetMilestone,
      state: "failed",
      status: "Needs review",
      detail: assetSessionError,
      meta: assetSession?.session_id || "Session error"
    };
  } else if (assetSessionStarting || ["queued", "running", "generating_asset_database"].includes(generationStatus)) {
    assetMilestone = {
      ...assetMilestone,
      state: "running",
      status: generationStatus === "queued" ? "Queued" : "Generating",
      detail: assetSession?.session_id
        ? `GPT-5.5 session ${assetSession.session_id} is building the threat asset database.`
        : "Preparing local source payload for GPT-5.5.",
      meta: assetSession?.generation?.model || "gpt-5.5"
    };
  } else if (generationStatus === "failed" || normalizeStatus(assetSession?.status) === "asset_database_failed") {
    assetMilestone = {
      ...assetMilestone,
      state: "failed",
      status: "Failed",
      detail: assetSession?.generation?.error || "Asset database generation failed.",
      meta: assetSession?.session_id || "Session failed"
    };
  } else if (isAssetDatabaseReady(assetSession)) {
    assetMilestone = {
      ...assetMilestone,
      state: "ready",
      status: "Generated",
      detail: assetSession?.asset_database?.session_summary || "Threat asset database is stored locally.",
      meta: `${assetCount} asset${assetCount === 1 ? "" : "s"}`
    };
  } else if (threatAssetCount) {
    assetMilestone = {
      ...assetMilestone,
      state: "ready",
      status: "Generated",
      detail: "Threat assets generated for the cached demo scene.",
      meta: `${threatAssetCount} threat vector${threatAssetCount === 1 ? "" : "s"}`
    };
  }

  let trellisMilestone = {
    id: "trellis",
    label: "Trellis Threat Visuals",
    state: "waiting",
    status: "Waiting",
    detail: "Waiting for generated threat-visual candidates.",
    meta: "No request"
  };

  if (["queued", "running", "relaying"].includes(trellisStatus)) {
    trellisMilestone = {
      ...trellisMilestone,
      state: "running",
      status: trellisStatus === "queued" ? "Queued" : "Running",
      detail: `${trellisCount} Trellis threat visual${trellisCount === 1 ? "" : "s"} prepared for VM generation.`,
      meta: assetSession?.trellis?.job_id || "VM relay"
    };
  } else if (trellisStatus === "submitted") {
    trellisMilestone = {
      ...trellisMilestone,
      state: "submitted",
      status: "Submitted",
      detail: "Trellis VM accepted the generated threat-visual request.",
      meta: assetSession?.trellis?.job_id || "VM job"
    };
  } else if (trellisStatus === "awaiting_vm_endpoint") {
    trellisMilestone = {
      ...trellisMilestone,
      state: "waiting",
      status: "Waiting for VM",
      detail: "Trellis request is stored locally; configure TRELLIS_VM_ENDPOINT to relay it.",
      meta: `${trellisCount} candidate${trellisCount === 1 ? "" : "s"}`
    };
  } else if (trellisStatus === "skipped") {
    trellisMilestone = {
      ...trellisMilestone,
      state: "complete",
      status: "Skipped",
      detail: assetSession?.trellis?.error || "No Trellis-suitable threat visuals were generated.",
      meta: "No candidates"
    };
  } else if (trellisStatus === "failed") {
    trellisMilestone = {
      ...trellisMilestone,
      state: "failed",
      status: "Failed",
      detail: assetSession?.trellis?.error || "Trellis relay failed.",
      meta: assetSession?.trellis?.job_id || "Relay failed"
    };
  } else if (isAssetDatabaseReady(assetSession)) {
    trellisMilestone = {
      ...trellisMilestone,
      state: "waiting",
      status: "Waiting",
      detail: `${trellisCount} generated threat visual${trellisCount === 1 ? "" : "s"} ready for Trellis relay.`,
      meta: `${trellisCount} candidate${trellisCount === 1 ? "" : "s"}`
    };
  } else if (threatAssetCount) {
    trellisMilestone = {
      ...trellisMilestone,
      state: "ready",
      status: "Ready",
      detail: "Threat visuals generated or cached for drones, vehicles, equipment, and adversary roles.",
      meta: "Cached demo"
    };
  }

  let plannerMilestone = {
    id: "threat-plan",
    label: "Threat Injection Plan",
    state: "waiting",
    status: "Waiting",
    detail: "Waiting for scene affordances and threat assets.",
    meta: "No plan"
  };

  if (threatPlanError) {
    plannerMilestone = {
      ...plannerMilestone,
      state: "failed",
      status: "Needs review",
      detail: threatPlanError,
      meta: "Adapter"
    };
  } else if (threatPlanLoading) {
    plannerMilestone = {
      ...plannerMilestone,
      state: "running",
      status: "Loading",
      detail: "Reading threat injection plan from the adapter.",
      meta: threatPlan?.source || "Endpoint or fixture"
    };
  } else if (threatPlan) {
    plannerMilestone = {
      ...plannerMilestone,
      state: "ready",
      status: "Compiled",
      detail: "Threat injection plan compiled from scene affordances and generated asset bindings.",
      meta: `${sequenceCount} step${sequenceCount === 1 ? "" : "s"}`
    };
  }

  let simulationMilestone = {
    id: "simulation",
    label: "Pixel Streaming Simulation",
    state: "waiting",
    status: "Waiting",
    detail: "Waiting for a ready Unreal scene.",
    meta: sceneStatus?.stream?.provider || "Pixel Streaming"
  };

  if (streamStatus === "ready") {
    simulationMilestone = {
      ...simulationMilestone,
      state: "ready",
      status: "Connected",
      detail: "Simulation ready and Pixel Streaming is connected.",
      meta: "Player attached"
    };
  } else if (["launching", "queued"].includes(streamStatus)) {
    simulationMilestone = {
      ...simulationMilestone,
      state: "running",
      status: "Launching",
      detail: "Training vignette is launching into Unreal Pixel Streaming.",
      meta: "Player pending"
    };
  } else if (sceneStatus?.status === "ready" || captureUnrealStatus === "ready") {
    simulationMilestone = {
      ...simulationMilestone,
      state: "ready",
      status: "Ready",
      detail: "Simulation ready; launch the training vignette when the operator is ready.",
      meta: sceneStatus?.stream?.status || "Stream available"
    };
  } else if (captureStatus?.status === "importing_unreal" || captureUnrealStatus === "importing") {
    simulationMilestone = {
      ...simulationMilestone,
      state: "running",
      status: "Importing",
      detail: "L4 worker is importing the reconstructed scene into Unreal.",
      meta: captureStatus.capture_id
    };
  } else if (captureStatus?.status === "ready_for_unreal_import") {
    simulationMilestone = {
      ...simulationMilestone,
      state: "waiting",
      status: "Import queued",
      detail: "Reconstruction artifacts are ready for Unreal import.",
      meta: captureStatus.capture_id
    };
  }

  return [reconstructionMilestone, assetMilestone, trellisMilestone, plannerMilestone, simulationMilestone];
}

export function CaptureSimulationFlow() {
  const fileInputRef = useRef(null);
  const assetSessionRequestRef = useRef(0);
  const [formState, setFormState] = useState({
    displayName: "Training Hallway May 3",
    environmentType: "indoor_hallway",
    expectedImageCount: 12,
    notes: "Phone photos captured around the hallway with overlapping passes.",
    scaleHintType: "known_distance",
    scaleHintLabel: "door width",
    scaleHintDistanceM: "0.91"
  });
  const [files, setFiles] = useState([]);
  const [flowState, setFlowState] = useState("idle");
  const [flowError, setFlowError] = useState("");
  const [capture, setCapture] = useState(null);
  const [captureStatus, setCaptureStatus] = useState(null);
  const [captureArtifacts, setCaptureArtifacts] = useState([]);
  const [fastForwardEnabled, setFastForwardEnabled] = useState(() => readFastForwardPreference());
  const [checkpointLoading, setCheckpointLoading] = useState(false);
  const [checkpointError, setCheckpointError] = useState("");
  const [sourceCaptureId, setSourceCaptureId] = useState("");
  const [uploadEntries, setUploadEntries] = useState([]);
  const [assetSession, setAssetSession] = useState(null);
  const [assetSessionStarting, setAssetSessionStarting] = useState(false);
  const [assetSessionError, setAssetSessionError] = useState("");
  const [activeSceneId, setActiveSceneId] = useState(() =>
    readFastForwardPreference() ? adaptsimApiConfig.cachedSceneId : adaptsimApiConfig.defaultSceneId
  );
  const [sceneRefreshKey, setSceneRefreshKey] = useState(0);
  const [sceneStatus, setSceneStatus] = useState(null);
  const [sceneLoading, setSceneLoading] = useState(false);
  const [sceneError, setSceneError] = useState("");
  const [threatPlan, setThreatPlan] = useState(null);
  const [threatPlanLoading, setThreatPlanLoading] = useState(false);
  const [threatPlanError, setThreatPlanError] = useState("");
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const [launching, setLaunching] = useState(false);
  const [run, setRun] = useState(null);
  const [runStream, setRunStream] = useState(null);
  const [runError, setRunError] = useState("");
  const [telemetry, setTelemetry] = useState(null);
  const [runArtifacts, setRunArtifacts] = useState([]);
  const [aar, setAar] = useState(null);

  const selectedBytes = useMemo(() => files.reduce((total, file) => total + file.size, 0), [files]);
  const uploadedCount = uploadEntries.filter((entry) => entry.status === "uploaded").length;
  const captureArtifactEntries = useMemo(
    () => normalizeArtifactEntries(captureStatus, captureArtifacts),
    [captureStatus, captureArtifacts]
  );
  const unifiedMilestones = useMemo(
    () =>
      buildUnifiedMilestones({
        assetSession,
        assetSessionError,
        assetSessionStarting,
        captureStatus,
        checkpointLoading,
        fastForwardEnabled,
        sceneStatus,
        sceneLoading,
        threatPlan,
        threatPlanError,
        threatPlanLoading,
        runStream
      }),
    [assetSession, assetSessionError, assetSessionStarting, captureStatus, checkpointLoading, fastForwardEnabled, sceneStatus, sceneLoading, threatPlan, threatPlanError, threatPlanLoading, runStream]
  );
  const activePhaseIndex = phaseIndex(captureStatus?.status);
  const canSubmitCapture = useMemo(() => {
    if (!formState.displayName.trim()) return false;
    if (!Number.isInteger(Number(formState.expectedImageCount)) || Number(formState.expectedImageCount) < 1) return false;
    if (!files.length) return false;
    if (formState.scaleHintType !== "unknown" && !(Number(formState.scaleHintDistanceM) > 0)) return false;
    return !["creating", "signing", "uploading", "submitting"].includes(flowState);
  }, [files.length, flowState, formState]);

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setFormState((current) => ({ ...current, [name]: value }));
  };

  const handleFiles = useCallback((fileList) => {
    const images = selectedImageFiles(fileList);
    setFiles(images);
    setUploadEntries(
      images.map((file) => ({
        filename: file.name,
        size: file.size,
        contentType: file.type || "application/octet-stream",
        status: "pending"
      }))
    );
    setFlowError(images.length ? "" : "Select at least one image file for the capture.");
  }, []);

  const loadCachedReconstructionCheckpoint = useCallback(async ({ preserveSource = true } = {}) => {
    const checkpointId = adaptsimApiConfig.cachedSceneId;
    setCheckpointLoading(true);
    setCheckpointError("");
    setFlowError("");
    try {
      const [statusPayload, artifactPayload] = await Promise.all([
        getCaptureStatus(checkpointId),
        getCaptureArtifacts(checkpointId).catch((error) => {
          console.warn("Cached checkpoint artifact lookup failed.", error);
          return { artifacts: [] };
        })
      ]);
      const nextStatus = {
        ...statusPayload,
        progress: {
          ...(statusPayload.progress || {}),
          phase: statusPayload.progress?.phase || statusPayload.status,
          percent: statusPayload.progress?.percent ?? 100,
          message: "Verified cached fVDB reconstruction checkpoint loaded; heavy reconstruction is fast-forwarded for presenter mode."
        }
      };
      setCapture({
        capture_id: checkpointId,
        status: nextStatus.status,
        gcs_prefix: nextStatus.gcs_prefix
      });
      setCaptureStatus(nextStatus);
      setCaptureArtifacts(artifactPayload.artifacts || []);
      setActiveSceneId(checkpointId);
      setSceneRefreshKey((value) => value + 1);
      setFlowState("ready");
      if (!preserveSource) setSourceCaptureId("");
      return nextStatus;
    } catch (error) {
      const message = formatApiError(error);
      setCheckpointError(message);
      setFlowError(message);
      throw error;
    } finally {
      setCheckpointLoading(false);
    }
  }, []);

  const resetCapture = () => {
    assetSessionRequestRef.current += 1;
    setFlowState("idle");
    setFlowError("");
    setCapture(null);
    setCaptureStatus(null);
    setCaptureArtifacts([]);
    setCheckpointError("");
    setSourceCaptureId("");
    setUploadEntries([]);
    setAssetSession(null);
    setAssetSessionStarting(false);
    setAssetSessionError("");
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (fastForwardEnabled) {
      void loadCachedReconstructionCheckpoint({ preserveSource: false });
    } else {
      setActiveSceneId(adaptsimApiConfig.defaultSceneId);
      setSceneRefreshKey((value) => value + 1);
    }
  };

  const startGeneratedAssetsForCapture = useCallback(
    async (createdCapture, captureFiles) => {
      const requestId = (assetSessionRequestRef.current += 1);
      setAssetSession(null);
      setAssetSessionError("");
      setAssetSessionStarting(true);
      try {
        const sourceFiles = await buildGeneratedAssetSourcePayload(captureFiles);
        if (!sourceFiles.length) return;
        const session = await createGeneratedAssetSession({
          operatorId: adaptsimApiConfig.operatorId,
          displayName: `AdaptSim ${formState.displayName.trim() || createdCapture.capture_id}`,
          notes: formState.notes.trim(),
          sourceFiles,
          context: {
            captureId: createdCapture.capture_id,
            displayName: formState.displayName.trim(),
            environmentType: formState.environmentType,
            notes: formState.notes.trim(),
            scaleHint: buildCapturePayload(formState).scale_hint
          }
        });
        if (assetSessionRequestRef.current === requestId) setAssetSession(session);
      } catch (error) {
        if (assetSessionRequestRef.current === requestId) setAssetSessionError(formatApiError(error));
      } finally {
        if (assetSessionRequestRef.current === requestId) setAssetSessionStarting(false);
      }
    },
    [formState]
  );

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("adaptsim.fastForwardReconstruction", fastForwardEnabled ? "1" : "0");
    }
    if (fastForwardEnabled) {
      void loadCachedReconstructionCheckpoint();
    } else if (activeSceneId === adaptsimApiConfig.cachedSceneId && capture?.capture_id === adaptsimApiConfig.cachedSceneId) {
      setCapture(null);
      setCaptureStatus(null);
      setCaptureArtifacts([]);
      setActiveSceneId(adaptsimApiConfig.defaultSceneId);
      setSceneRefreshKey((value) => value + 1);
      setFlowState("idle");
    }
  }, [fastForwardEnabled, loadCachedReconstructionCheckpoint]);

  const startCapture = async (event) => {
    event.preventDefault();
    if (!canSubmitCapture) return;

    const captureFiles = files;
    setFlowError("");
    setCaptureArtifacts([]);
    setAssetSession(null);
    setAssetSessionError("");
    setRun(null);
    setRunStream(null);
    setTelemetry(null);
    setRunArtifacts([]);
    setAar(null);

    try {
      setFlowState("creating");
      setUploadEntries((entries) => entries.map((entry) => ({ ...entry, status: "pending", error: "" })));
      const createdCapture = await createCapture(buildCapturePayload(formState));
      setSourceCaptureId(createdCapture.capture_id);
      setCapture(createdCapture);
      setCaptureStatus({
        capture_id: createdCapture.capture_id,
        display_name: formState.displayName,
        status: createdCapture.status,
        progress: { phase: createdCapture.status, percent: 0, message: "Capture created." },
        gcs_prefix: createdCapture.gcs_prefix
      });

      setFlowState("signing");
      void startGeneratedAssetsForCapture(createdCapture, captureFiles);
      const uploadUrlPayload = await requestUploadUrls(createdCapture.capture_id, captureFiles);
      const uploadsByName = new Map(uploadUrlPayload.uploads.map((upload) => [upload.filename, upload]));
      setUploadEntries((entries) =>
        entries.map((entry) => ({
          ...entry,
          status: uploadsByName.has(entry.filename) ? "signed" : "failed",
          gcsUri: uploadsByName.get(entry.filename)?.gcs_uri,
          expiresAt: uploadsByName.get(entry.filename)?.expires_at,
          error: uploadsByName.has(entry.filename) ? "" : "No signed URL returned."
        }))
      );

      setFlowState("uploading");
      const uploadPairs = captureFiles.map((file) => ({
        file,
        upload: uploadsByName.get(file.name)
      }));
      const missing = uploadPairs.find((pair) => !pair.upload);
      if (missing) throw new Error(`No signed URL returned for ${missing.file.name}.`);

      let cursor = 0;
      let firstError = null;
      const workerCount = Math.min(4, uploadPairs.length);
      const workers = Array.from({ length: workerCount }, async () => {
        while (!firstError && cursor < uploadPairs.length) {
          const index = cursor;
          cursor += 1;
          const { file, upload } = uploadPairs[index];
          setUploadEntries((entries) => updateEntry(entries, index, { status: "uploading", error: "" }));
          try {
            await uploadFileToSignedUrl(file, upload);
            setUploadEntries((entries) => updateEntry(entries, index, { status: "uploaded", gcsUri: upload.gcs_uri }));
          } catch (error) {
            firstError = error;
            setUploadEntries((entries) => updateEntry(entries, index, { status: "failed", error: formatApiError(error) }));
          }
        }
      });
      await Promise.all(workers);
      if (firstError) throw firstError;

      setFlowState("submitting");
      await submitCapture(createdCapture.capture_id, captureFiles.length, {
        startReconstruction: !fastForwardEnabled
      });
      if (fastForwardEnabled) {
        setFlowState("fast_forwarding");
        await loadCachedReconstructionCheckpoint();
        return;
      }
      setFlowState("polling");
    } catch (error) {
      setFlowState("failed");
      setFlowError(formatApiError(error));
    }
  };

  useEffect(() => {
    if (!capture?.capture_id) return undefined;
    let cancelled = false;
    let timer = 0;

    const poll = async () => {
      try {
        const status = await getCaptureStatus(capture.capture_id);
        if (cancelled) return;
        setCaptureStatus(status);
        if (failureCaptureStatuses.has(status.status)) {
          setFlowState("failed");
        } else if (status.status === "ready") {
          setFlowState("ready");
        } else {
          setFlowState((current) =>
            ["creating", "signing", "uploading", "submitting"].includes(current) ? current : "polling"
          );
        }

        if (status.status === "ready" || (status.progress?.percent || 0) >= 86) {
          try {
            const artifactPayload = await getCaptureArtifacts(capture.capture_id);
            if (!cancelled) setCaptureArtifacts(artifactPayload.artifacts || []);
          } catch (error) {
            console.warn("Capture artifact lookup failed.", error);
          }
        }

        if (!terminalCaptureStatuses.has(status.status)) {
          timer = window.setTimeout(poll, 2500);
        }
      } catch (error) {
        if (!cancelled) {
          setFlowError(formatApiError(error));
          timer = window.setTimeout(poll, 4000);
        }
      }
    };

    timer = window.setTimeout(poll, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [capture?.capture_id]);

  useEffect(() => {
    if (!assetSession?.session_id || !isGeneratedAssetSessionActive(assetSession)) return undefined;
    let cancelled = false;
    let timer = 0;

    const pollAssetSession = async () => {
      try {
        const session = await getGeneratedAssetSession(assetSession.session_id);
        if (cancelled) return;
        setAssetSession(session);
        setAssetSessionError("");
        if (isGeneratedAssetSessionActive(session)) {
          timer = window.setTimeout(pollAssetSession, 1800);
        }
      } catch (error) {
        if (!cancelled) {
          setAssetSessionError(formatApiError(error));
          timer = window.setTimeout(pollAssetSession, 3000);
        }
      }
    };

    timer = window.setTimeout(pollAssetSession, 900);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [assetSession?.generation?.status, assetSession?.session_id, assetSession?.status, assetSession?.trellis?.status]);

  useEffect(() => {
    if (captureStatus?.status === "ready" && captureStatus.capture_id) {
      setActiveSceneId(captureStatus.capture_id);
      setSceneRefreshKey((value) => value + 1);
    }
  }, [captureStatus?.capture_id, captureStatus?.status]);

  useEffect(() => {
    let cancelled = false;
    async function loadScene() {
      setSceneLoading(true);
      setSceneError("");
      try {
        const [statusPayload, scenarioPayload] = await Promise.all([getSceneStatus(activeSceneId), getScenarios(activeSceneId)]);
        if (cancelled) return;
        const nextScenarios = scenarioPayload.scenarios || [];
        setSceneStatus(statusPayload);
        setScenarios(nextScenarios);
        setSelectedScenarioId((current) => {
          if (nextScenarios.some((scenario) => scenario.scenario_id === current)) return current;
          return nextScenarios.find((scenario) => scenario.status === "ready")?.scenario_id || nextScenarios[0]?.scenario_id || "";
        });
      } catch (error) {
        if (!cancelled) {
          setSceneStatus(null);
          setScenarios([]);
          setSceneError(formatApiError(error));
        }
      } finally {
        if (!cancelled) setSceneLoading(false);
      }
    }
    loadScene();
    return () => {
      cancelled = true;
    };
  }, [activeSceneId, sceneRefreshKey]);

  useEffect(() => {
    let cancelled = false;

    async function loadThreatPlan() {
      setThreatPlanLoading(true);
      setThreatPlanError("");
      try {
        const plan = await getThreatInjectionPlan(activeSceneId);
        if (cancelled) return;
        setThreatPlan(plan);
      } catch (error) {
        if (!cancelled) {
          setThreatPlan(null);
          setThreatPlanError(formatApiError(error));
        }
      } finally {
        if (!cancelled) setThreatPlanLoading(false);
      }
    }

    void loadThreatPlan();
    return () => {
      cancelled = true;
    };
  }, [activeSceneId, sceneRefreshKey]);

  const handleLaunchScenario = async () => {
    if (!selectedScenarioId) return;
    setLaunching(true);
    setRunError("");
    setRun(null);
    setRunStream(null);
    setTelemetry(null);
    setRunArtifacts([]);
    setAar(null);
    try {
      const launchPayload = await launchScenario(activeSceneId, selectedScenarioId);
      setRun(launchPayload);
      setRunStream(launchPayload);
    } catch (error) {
      setRunError(formatApiError(error));
    } finally {
      setLaunching(false);
    }
  };

  useEffect(() => {
    if (!run?.run_id) return undefined;
    let cancelled = false;
    let timer = 0;

    const pollStream = async () => {
      try {
        const streamPayload = await getRunStream(run.stream?.poll_url || run.run_id);
        if (cancelled) return;
        setRunStream(streamPayload);
        if (streamPayload.stream?.status === "ready") {
          const [telemetryPayload, artifactPayload, aarPayload] = await Promise.all([
            getRunTelemetry(run.run_id),
            getRunArtifacts(run.run_id),
            getRunAar(run.run_id)
          ]);
          if (cancelled) return;
          setTelemetry(telemetryPayload);
          setRunArtifacts(artifactPayload.artifacts || []);
          setAar(aarPayload);
        } else if (streamPayload.stream?.status !== "failed") {
          timer = window.setTimeout(pollStream, 1800);
        }
      } catch (error) {
        if (!cancelled) {
          setRunError(formatApiError(error));
          timer = window.setTimeout(pollStream, 3000);
        }
      }
    };

    timer = window.setTimeout(pollStream, 600);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [run?.run_id, run?.stream?.poll_url]);

  const streamHref = artifactUrl(runStream?.stream?.embed_url);
  const aarArtifactHref = artifactUrl(runArtifacts.find((artifact) => artifact.artifact_type === "after_action_review")?.url);
  const threatAssets = threatPlan?.threat_assets?.slice(0, 5) || [];
  const threatAffordances = threatPlan?.scene_affordances?.slice(0, 6) || [];
  const threatSequence = threatPlan?.threat_sequence || [];
  const readinessItems = [
    ["reconstruction", "Cached reconstruction loaded"],
    ["assets", "Threat assets generated"],
    ["plan", "Threat injection plan compiled"],
    ["simulation", "Simulation ready"]
  ];

  return (
    <section className="capture-flow-shell" aria-labelledby="capture-flow-title">
      <div className="capture-flow-heading">
        <div>
          <p className="eyebrow">Capture To Simulation</p>
          <h1 id="capture-flow-title">Playable Threat Vignette</h1>
        </div>
        <div className="capture-config-pills" aria-label="API configuration">
          <span className="count-pill">{adaptsimApiConfig.mode}</span>
          <span className="count-pill">{adaptsimApiConfig.apiBase}</span>
        </div>
      </div>

      <section className="presenter-fast-forward" aria-labelledby="presenter-fast-forward-title">
        <div>
          <p className="eyebrow">Presenter Fast-Forward</p>
          <h2 id="presenter-fast-forward-title">Use Verified Reconstruction Checkpoint</h2>
          <p>
            Source upload and threat asset generation stay live. The expensive fVDB reconstruction step resumes from{" "}
            <code>{adaptsimApiConfig.cachedSceneId}</code> so the demo moves directly into Unreal and Pixel Streaming.
          </p>
          {sourceCaptureId && fastForwardEnabled && (
            <small>
              Source capture <code>{sourceCaptureId}</code> was uploaded and recorded; simulation is using the verified checkpoint.
            </small>
          )}
          {checkpointError && <p className="capture-error" role="alert">{checkpointError}</p>}
        </div>
        <div className="presenter-fast-forward-actions">
          <label className="switch-field">
            <input
              type="checkbox"
              checked={fastForwardEnabled}
              onChange={(event) => setFastForwardEnabled(event.target.checked)}
            />
            <span>Fast-forward fVDB reconstruction</span>
          </label>
          <button
            className="quiet-button"
            type="button"
            disabled={checkpointLoading}
            onClick={() => void loadCachedReconstructionCheckpoint()}
          >
            {checkpointLoading ? "Loading checkpoint" : "Load checkpoint"}
          </button>
        </div>
      </section>

      <div className="capture-flow-grid">
        <form className="capture-panel capture-create-panel" onSubmit={startCapture}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Capture Creation</p>
              <h2>Scene Source</h2>
            </div>
            <span className={`status-pill ${statusTone(flowState)}`}>{humanize(flowState)}</span>
          </div>

          <div className="capture-form-grid">
            <label className="field">
              <span>Display name</span>
              <input
                name="displayName"
                type="text"
                value={formState.displayName}
                onChange={handleFormChange}
                maxLength="120"
                required
              />
            </label>
            <label className="field">
              <span>Environment type</span>
              <select name="environmentType" value={formState.environmentType} onChange={handleFormChange}>
                {environmentOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Expected image count</span>
              <input
                name="expectedImageCount"
                type="number"
                min="1"
                step="1"
                value={formState.expectedImageCount}
                onChange={handleFormChange}
                required
              />
            </label>
            <label className="field">
              <span>Scale hint</span>
              <select name="scaleHintType" value={formState.scaleHintType} onChange={handleFormChange}>
                {scaleHintOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {formState.scaleHintType !== "unknown" && (
              <>
                <label className="field">
                  <span>Scale label</span>
                  <input
                    name="scaleHintLabel"
                    type="text"
                    value={formState.scaleHintLabel}
                    onChange={handleFormChange}
                    maxLength="96"
                  />
                </label>
                <label className="field">
                  <span>Distance in meters</span>
                  <input
                    name="scaleHintDistanceM"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={formState.scaleHintDistanceM}
                    onChange={handleFormChange}
                    required
                  />
                </label>
              </>
            )}
            <label className="field capture-notes-field">
              <span>Notes</span>
              <textarea name="notes" rows="4" maxLength="1000" value={formState.notes} onChange={handleFormChange}></textarea>
            </label>
          </div>

          <label
            className="capture-upload-dropzone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              handleFiles(event.dataTransfer.files);
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => handleFiles(event.target.files)}
            />
            <span className="capture-upload-mark" aria-hidden="true">
              +
            </span>
            <span>
              <strong>{files.length ? `${files.length} image${files.length === 1 ? "" : "s"} selected` : "Add reconstruction images"}</strong>
              <small>
                {files.length ? `${formatBytes(selectedBytes)} ready for signed PUT upload` : "JPG, PNG, HEIC, WebP, or TIFF"}
              </small>
            </span>
          </label>

          {files.length > 0 && Number(formState.expectedImageCount) !== files.length && (
            <p className="capture-inline-note">
              Expected {formState.expectedImageCount}; selected {files.length}.
            </p>
          )}

          {flowError && <p className="capture-error" role="alert">{flowError}</p>}

          <div className="button-row capture-actions">
            <button className="primary-button" type="submit" disabled={!canSubmitCapture}>
              {fastForwardEnabled ? "Upload Source And Load Checkpoint" : "Create Capture And Upload"}
            </button>
            <button className="quiet-button" type="button" onClick={resetCapture}>
              Reset
            </button>
          </div>

          {capture?.capture_id && (
            <dl className="capture-meta-list">
              <div>
                <dt>Capture ID</dt>
                <dd>{capture.capture_id}</dd>
              </div>
              <div>
                <dt>GCS prefix</dt>
                <dd>{captureStatus?.gcs_prefix || capture.gcs_prefix || "--"}</dd>
              </div>
            </dl>
          )}
        </form>

        <section className="capture-panel capture-progress-panel" aria-labelledby="capture-progress-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Progress</p>
              <h2 id="capture-progress-title">Reconstruction Status</h2>
            </div>
            <span className={`status-pill ${statusTone(captureStatus?.status)}`}>{captureStatus?.progress?.percent ?? 0}%</span>
          </div>

          <div className="capture-progress-summary">
            <strong>{captureStatus?.display_name || sceneStatus?.display_name || "Cached reconstruction loaded"}</strong>
            <span>
              {captureStatus?.progress?.message || "Cached reconstruction loaded; capture upload remains available for operator-provided environments."}
            </span>
            {captureStatus?.updated_at && <small>Updated {formatDate(captureStatus.updated_at)}</small>}
          </div>

          <div className="unified-flow-strip" aria-label="Unified MVP workflow">
            {unifiedMilestones.map((milestone, index) => (
              <article key={milestone.id} className="unified-flow-step" data-flow-state={milestone.state}>
                <span className="unified-flow-index">{index + 1}</span>
                <div>
                  <div className="unified-flow-step-head">
                    <strong>{milestone.label}</strong>
                    <span className={`status-pill ${workflowTone(milestone.state)}`}>{milestone.status}</span>
                  </div>
                  <p>{milestone.detail}</p>
                  <small>{milestone.meta}</small>
                </div>
              </article>
            ))}
          </div>

          <div className="phase-list" aria-label="Capture phases">
            {capturePhaseCatalog.map((phase, index) => {
              const isComplete = activePhaseIndex >= 0 && index < activePhaseIndex;
              const isActive = captureStatus?.status === phase.id;
              return (
                <div key={phase.id} className="phase-item" data-phase-state={isActive ? "active" : isComplete ? "complete" : "pending"}>
                  <span>{index + 1}</span>
                  <strong>{phase.label}</strong>
                </div>
              );
            })}
          </div>

          {failureCaptureStatuses.has(captureStatus?.status) && (
            <div className="capture-failure" role="alert">
              <strong>{humanize(captureStatus.status)}</strong>
              <span>{captureStatus.error?.message || captureStatus.progress?.message || "Capture processing failed."}</span>
            </div>
          )}

          {uploadEntries.length > 0 && (
            <div className="upload-list" aria-label="Signed upload progress">
              <div className="upload-list-head">
                <strong>Uploads</strong>
                <span>
                  {uploadedCount}/{uploadEntries.length}
                </span>
              </div>
              {uploadEntries.slice(0, 8).map((entry) => (
                <div key={`${entry.filename}-${entry.size}`} className="upload-entry" data-upload-state={entry.status}>
                  <span>{entry.filename}</span>
                  <small>{entry.status}</small>
                </div>
              ))}
              {uploadEntries.length > 8 && <p className="capture-inline-note">{uploadEntries.length - 8} more files queued.</p>}
            </div>
          )}

          {captureArtifactEntries.length > 0 && (
            <div className="artifact-list" aria-label="Capture artifacts">
              <div className="upload-list-head">
                <strong>Artifacts</strong>
                <span>{captureArtifactEntries.length}</span>
              </div>
              {captureArtifactEntries.map((entry) => (
                <div key={entry.id} className="artifact-entry">
                  <span>
                    <strong>{entry.label}</strong>
                    <small>{entry.contentType || entry.value}</small>
                  </span>
                  {entry.href ? (
                    <a href={entry.href} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  ) : (
                    <code>{entry.value}</code>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="capture-panel ready-scene-panel" aria-labelledby="ready-scene-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Ready Scene</p>
            <h2 id="ready-scene-title">Training Vignette Launch</h2>
          </div>
          <div className="button-row compact-actions">
            <button
              className="quiet-button"
              type="button"
              disabled={fastForwardEnabled}
              onClick={() => setActiveSceneId(adaptsimApiConfig.defaultSceneId)}
            >
              Demo Scene
            </button>
            {fastForwardEnabled && (
              <button className="quiet-button" type="button" onClick={() => void loadCachedReconstructionCheckpoint()}>
                Checkpoint Scene
              </button>
            )}
            {captureStatus?.status === "ready" && (
              <button className="quiet-button" type="button" onClick={() => setActiveSceneId(captureStatus.capture_id)}>
                {captureStatus.capture_id === adaptsimApiConfig.cachedSceneId ? "Cached Scene" : "Captured Scene"}
              </button>
            )}
            <button className="quiet-button" type="button" onClick={() => setSceneRefreshKey((value) => value + 1)}>
              Refresh
            </button>
          </div>
        </div>

        {sceneError && <p className="capture-error" role="alert">{sceneError}</p>}

        <div className="scene-launch-grid">
          <div className="scene-status-block">
            <div className="scene-status-head">
              <span className={`status-pill ${statusTone(sceneStatus?.status)}`}>{sceneLoading ? "Loading" : sceneStatus?.status || "Unknown"}</span>
              <code>{activeSceneId}</code>
            </div>
            <h3>{sceneStatus?.display_name || "Scene unavailable"}</h3>
            <dl className="scene-metric-grid">
              <div>
                <dt>Anchors</dt>
                <dd>{sceneStatus?.anchor_count ?? "--"}</dd>
              </div>
              <div>
                <dt>Scenarios</dt>
                <dd>{sceneStatus?.scenario_count ?? scenarios.length}</dd>
              </div>
              <div>
                <dt>Stream</dt>
                <dd>{sceneStatus?.stream?.status || "--"}</dd>
              </div>
              <div>
                <dt>Level</dt>
                <dd>{sceneStatus?.unreal_level_path || "--"}</dd>
              </div>
            </dl>

            <section className="threat-injection-panel" aria-labelledby="threat-injection-title">
              <div className="threat-panel-head">
                <div>
                  <p className="eyebrow">Threat Injection</p>
                  <h4 id="threat-injection-title">
                    {threatPlanLoading ? "Loading threat plan" : threatPlan ? "Threat injection plan compiled" : "Threat plan unavailable"}
                  </h4>
                </div>
                <span className={`status-pill ${threatPlanError ? "restricted" : threatPlanLoading ? "caution" : threatPlan ? "ready" : "neutral"}`}>
                  {threatPlanError ? "Review" : threatPlanLoading ? "Loading" : threatPlan ? "Compiled" : "Waiting"}
                </span>
              </div>

              <p className="threat-caveat">Plausible training threat. Scenario assumption, not calibrated intelligence truth.</p>

              <div className="demo-readiness-strip" aria-label="Cached demo readiness">
                {readinessItems.map(([id, label]) => (
                  <span key={id}>{label}</span>
                ))}
              </div>

              {threatPlanError && <p className="capture-error" role="alert">{threatPlanError}</p>}

              <div className="affordance-rack" aria-label="Scene understanding affordances">
                {threatAffordances.map((affordance) => (
                  <article key={`${affordance.anchor_id}-${affordance.role}`}>
                    <span>{affordance.tactical_label || humanize(affordance.role)}</span>
                    <strong>{humanize(affordance.role)}</strong>
                    {affordance.finding && <small>{affordance.finding}</small>}
                  </article>
                ))}
              </div>

              <div className="threat-asset-list" aria-label="Generated threat assets">
                {threatAssets.map((asset) => (
                  <article key={asset.asset_id} className="threat-asset-row">
                    <div className="threat-asset-title">
                      <strong>{asset.display_name}</strong>
                      <span className={`status-pill ${threatStatusTone(asset.generation_status)}`}>
                        {formatThreatStatus(asset.generation_status)}
                      </span>
                    </div>
                    <dl className="threat-asset-meta">
                      <div>
                        <dt>Category</dt>
                        <dd>{humanize(asset.threat_category)}</dd>
                      </div>
                      <div>
                        <dt>Movement</dt>
                        <dd>{humanize(asset.movement_domain)}</dd>
                      </div>
                      <div>
                        <dt>Role</dt>
                        <dd>{humanize(asset.tactical_role)}</dd>
                      </div>
                      <div>
                        <dt>Runtime binding</dt>
                        <dd>{formatRuntimeBinding(asset.runtime_binding)}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>

              <div className="gameplay-plan-grid" aria-label="Gameplay plan summary">
                <div>
                  <span>Objective</span>
                  <p>{threatPlan?.objective || "Threat injection plan objective will appear when the adapter returns data."}</p>
                </div>
                <div>
                  <span>Spawn / entry anchors</span>
                  <p>{(threatPlan?.spawn_entry_anchors || []).map(humanize).join(", ") || "Pending anchors"}</p>
                </div>
                <div>
                  <span>Triggers</span>
                  <p>{(threatPlan?.triggers || []).map(humanize).join(", ") || "Pending triggers"}</p>
                </div>
                <div>
                  <span>Expected trainee response</span>
                  <p>{threatPlan?.expected_trainee_response || "Identify, report, move to cover, and continue the objective."}</p>
                </div>
              </div>

              <div className="threat-sequence-list" aria-label="Threat sequence">
                {threatSequence.map((step) => (
                  <article key={`${step.step}-${step.action}-${step.anchor_id}`}>
                    <span>{String(step.step).padStart(2, "0")}</span>
                    <div>
                      <strong>{humanize(step.action)}</strong>
                      <small>
                        {humanize(step.trigger)} at {humanize(step.anchor_id)}
                      </small>
                      <p>{step.trainee_task}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <div className="scenario-list" role="radiogroup" aria-label="Training vignettes">
              {scenarios.length === 0 && <p className="capture-inline-note">No ready scenarios returned for this scene.</p>}
              {scenarios.map((scenario) => (
                <label key={scenario.scenario_id} className="scenario-option">
                  <input
                    type="radio"
                    name="scenario"
                    value={scenario.scenario_id}
                    checked={selectedScenarioId === scenario.scenario_id}
                    onChange={() => setSelectedScenarioId(scenario.scenario_id)}
                  />
                  <span>
                    <strong>{scenario.display_name || scenario.scenario_id}</strong>
                    <small>{scenario.training_objective}</small>
                  </span>
                  <em>{scenario.status}</em>
                </label>
              ))}
            </div>

            <button
              className="primary-button full-width"
              type="button"
              disabled={!selectedScenarioId || sceneStatus?.status !== "ready" || launching}
              onClick={handleLaunchScenario}
            >
              Enter Simulation
            </button>
          </div>

          <div className="run-output-block">
            <div className="run-output-head">
              <div>
                <p className="eyebrow">Runtime</p>
                <h3>{run?.run_id || "No run launched"}</h3>
              </div>
              <span className={`status-pill ${statusTone(runStream?.stream?.status || runStream?.status)}`}>
                {runStream?.stream?.status || runStream?.status || "idle"}
              </span>
            </div>

            {runError && <p className="capture-error" role="alert">{runError}</p>}

            {streamHref ? (
              <div className="stream-shell">
                <iframe
                  title={`Pixel Streaming run ${run?.run_id}`}
                  src={streamHref}
                  allow="autoplay; fullscreen; gamepad; clipboard-read; clipboard-write"
                ></iframe>
                <a className="stream-open-link" href={streamHref} target="_blank" rel="noreferrer">
                  Open simulation stream
                </a>
              </div>
            ) : (
              <div className="stream-placeholder">
                <strong>{run ? "Waiting for stream URL" : "Stream standby"}</strong>
                <span>{run ? "Polling run stream status." : "Enter a ready training vignette to attach the player."}</span>
              </div>
            )}

            <div className="run-artifact-grid">
              <section>
                <h4>Telemetry</h4>
                {telemetry?.events?.length ? (
                  <div className="telemetry-list">
                    {telemetry.events.slice(-5).map((event) => (
                      <div key={event.event_id || `${event.event_type}-${event.timestamp}`} className="telemetry-entry">
                        <strong>{humanize(event.event_type)}</strong>
                        <span>
                          {event.source || "sim"} · {event.sim_time_s ?? "--"}s
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="capture-inline-note">Telemetry links appear after launch.</p>
                )}
              </section>

              <section>
                <h4>Artifacts</h4>
                <div className="run-link-list">
                  {runArtifacts.map((artifact) => {
                    const href = artifactUrl(artifact.url);
                    return (
                      <a key={artifact.artifact_type} href={href} target="_blank" rel="noreferrer">
                        {humanize(artifact.artifact_type)}
                      </a>
                    );
                  })}
                  {aar?.markdown && aarArtifactHref && (
                    <a href={aarArtifactHref} target="_blank" rel="noreferrer">
                      AAR Markdown
                    </a>
                  )}
                </div>
              </section>
            </div>

            {aar?.markdown && (
              <details className="aar-preview">
                <summary>AAR Preview</summary>
                <pre>{aar.markdown}</pre>
              </details>
            )}
          </div>
        </div>
      </section>
    </section>
  );
}
