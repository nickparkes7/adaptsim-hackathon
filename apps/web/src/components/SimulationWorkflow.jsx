import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import {
  adaptsimApiConfig,
  artifactUrl,
  capturePhaseCatalog,
  createCapture,
  failureCaptureStatuses,
  formatApiError,
  getCaptureArtifacts,
  getCaptureStatus,
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

const SimulationWorkflowContext = createContext(null);

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

const fallbackDemoScenarios = [
  {
    scenario_id: "safety_park_mvp_001",
    display_name: "Safety Park Recon To Contact",
    status: "ready",
    training_objective:
      "Move from entry to exit while identifying aerial reconnaissance, avoiding the chokepoint, and responding to delayed contact."
  },
  {
    scenario_id: "scan_hallway_delay_001",
    display_name: "UAV Recon To Delayed Contact",
    status: "ready",
    training_objective:
      "Identify the aerial threat, move through the lane, and respond to delayed contact without lingering in the chokepoint."
  }
];

function fallbackDemoSceneStatus(sceneId = adaptsimApiConfig.cachedSceneId) {
  return {
    scene_id: sceneId,
    display_name: "Demo scene",
    status: "ready",
    source_scan_id: sceneId,
    unreal_level_path: "/Game/AdaptSim/Maps/L_SafetyPark_MVP",
    updated_at: new Date().toISOString(),
    anchor_count: 6,
    scenario_count: fallbackDemoScenarios.length,
    stream: {
      status: "available",
      provider: "unreal_pixel_streaming"
    },
    artifacts: {}
  };
}

function sceneDisplayName(sceneStatus, sceneId) {
  const displayName = sceneStatus?.display_name || "";
  if (sceneId === adaptsimApiConfig.cachedSceneId || /safety park|golden capture|cached/i.test(displayName)) {
    return "Demo scene";
  }
  return displayName || sceneId || "Scene";
}

function humanize(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeStatus(value) {
  return String(value || "").toLowerCase();
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

function workflowTone(state) {
  if (state === "ready" || state === "complete" || state === "submitted") return "ready";
  if (state === "running" || state === "queued" || state === "waiting") return "caution";
  if (state === "failed" || state === "blocked") return "restricted";
  return "neutral";
}

function friendlyApiError(error, fallback = "The AdaptSim service is unavailable. Check the service connection and retry.") {
  const message = formatApiError(error);
  if (/failed to fetch|networkerror|load failed/i.test(message)) return fallback;
  return message;
}

function readDemoCheckpointPreference() {
  if (typeof window === "undefined") return adaptsimApiConfig.fastForwardDefault;
  const stored = window.localStorage.getItem("adaptsim.fastForwardReconstruction");
  if (stored === "1") return true;
  if (stored === "0") return false;
  return adaptsimApiConfig.fastForwardDefault;
}

function writeDemoCheckpointPreference(value) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("adaptsim.fastForwardReconstruction", value ? "1" : "0");
}

function isImageFile(file) {
  return Boolean(file && (file.type?.startsWith("image/") || /\.(jpe?g|png|heic|webp|tiff?)$/i.test(file.name || "")));
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

function phaseIndex(status) {
  const index = capturePhaseCatalog.findIndex((phase) => phase.id === status);
  return index < 0 ? -1 : index;
}

function isAssetDatabaseReady(session) {
  return normalizeStatus(session?.status) === "asset_database_ready" || normalizeStatus(session?.generation?.status) === "complete";
}

function isGeneratedAssetSessionActive(session) {
  const sessionStatus = normalizeStatus(session?.status);
  const generationStatus = normalizeStatus(session?.generation?.status);
  const trellisStatus = normalizeStatus(session?.trellis?.status);
  return (
    sessionStatus === "generating_asset_database"
    || ["queued", "running"].includes(generationStatus)
    || ["queued", "running", "relaying"].includes(trellisStatus)
  );
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

function buildMilestones({ assetSession, captureStatus, checkpointLoading, demoCheckpointEnabled, sceneStatus, sceneLoading, threatPlan, threatPlanLoading, runStream }) {
  const threatAssetCount = threatPlan?.threat_assets?.length ?? 0;
  const sequenceCount = threatPlan?.threat_sequence?.length ?? 0;
  const assetCount = assetSession?.asset_database?.asset_cards?.length ?? threatAssetCount;
  const trellisCount = assetSession?.asset_database?.trellis_candidates?.length ?? threatAssetCount;
  const generationStatus = normalizeStatus(assetSession?.generation?.status || assetSession?.status);
  const trellisStatus = normalizeStatus(assetSession?.trellis?.status);
  const streamStatus = normalizeStatus(runStream?.stream?.status || runStream?.status);

  const reconstruction = {
    id: "reconstruction",
    label: demoCheckpointEnabled ? "Demo Scene" : "Photo Reconstruction",
    state: checkpointLoading || sceneLoading ? "running" : sceneStatus?.status === "ready" || captureStatus?.status === "ready" ? "ready" : "waiting",
    status: checkpointLoading || sceneLoading ? "Loading" : sceneStatus?.status === "ready" || captureStatus?.status === "ready" ? "Ready" : "Waiting",
    detail: demoCheckpointEnabled
      ? "A verified scene checkpoint is selected so the demo can move directly into training setup."
      : "Upload source images and queue reconstruction when a live capture is required.",
    meta: sceneDisplayName(sceneStatus, sceneStatus?.scene_id || captureStatus?.capture_id || adaptsimApiConfig.cachedSceneId)
  };

  const assetDb = isAssetDatabaseReady(assetSession)
    ? {
        id: "asset-db",
        label: "Threat Asset DB",
        state: "ready",
        status: "Generated",
        detail: assetSession?.asset_database?.session_summary || "Threat asset database is ready.",
        meta: `${assetCount} asset${assetCount === 1 ? "" : "s"}`
      }
    : isGeneratedAssetSessionActive(assetSession)
      ? {
          id: "asset-db",
          label: "Threat Asset DB",
          state: "running",
          status: generationStatus === "queued" ? "Queued" : "Generating",
          detail: "Generating the threat asset database from the confirmed source context.",
          meta: assetSession?.generation?.model || "gpt-5.5"
        }
      : threatAssetCount
        ? {
            id: "asset-db",
            label: "Threat Asset DB",
            state: "ready",
            status: "Cached",
            detail: "Cached demo threat assets are available for the selected scene.",
            meta: `${threatAssetCount} threat vector${threatAssetCount === 1 ? "" : "s"}`
          }
        : {
            id: "asset-db",
            label: "Threat Asset DB",
            state: "waiting",
            status: "Waiting",
            detail: "Start asset database generation from the Threats step.",
            meta: "No session"
          };

  const trellis = ["queued", "running", "relaying"].includes(trellisStatus)
    ? {
        id: "trellis",
        label: "Threat Visuals",
        state: "running",
        status: trellisStatus === "queued" ? "Queued" : "Running",
        detail: `${trellisCount} generated threat visual${trellisCount === 1 ? "" : "s"} prepared for relay.`,
        meta: assetSession?.trellis?.job_id || "VM relay"
      }
    : trellisStatus === "submitted"
      ? {
          id: "trellis",
          label: "Threat Visuals",
          state: "submitted",
          status: "Submitted",
          detail: "Threat visuals were submitted for generation.",
          meta: assetSession?.trellis?.job_id || "VM job"
        }
      : {
          id: "trellis",
          label: "Threat Visuals",
          state: threatAssetCount ? "ready" : "waiting",
          status: threatAssetCount ? "Ready" : "Waiting",
          detail: threatAssetCount ? "Threat visuals are generated or cached for the training vignette." : "Waiting for threat visual candidates.",
          meta: threatAssetCount ? "Available" : "No request"
        };

  const plan = {
    id: "threat-plan",
    label: "Threat Plan",
    state: threatPlanLoading ? "running" : threatPlan ? "ready" : "waiting",
    status: threatPlanLoading ? "Loading" : threatPlan ? "Compiled" : "Waiting",
    detail: threatPlan ? "Threat injection plan compiled from scene affordances and generated asset bindings." : "Waiting for scene affordances and threat assets.",
    meta: threatPlan ? `${sequenceCount} step${sequenceCount === 1 ? "" : "s"}` : "No plan"
  };

  const simulation = {
    id: "simulation",
    label: "Simulation",
    state: streamStatus === "ready" ? "ready" : ["launching", "queued"].includes(streamStatus) ? "running" : sceneStatus?.status === "ready" ? "ready" : "waiting",
    status: streamStatus === "ready" ? "Connected" : ["launching", "queued"].includes(streamStatus) ? "Launching" : sceneStatus?.status === "ready" ? "Ready" : "Waiting",
    detail: streamStatus === "ready" ? "Pixel Streaming is connected." : "Launch the selected training vignette when ready.",
    meta: runStream?.stream?.provider || sceneStatus?.stream?.provider || "Pixel Streaming"
  };

  return [reconstruction, assetDb, trellis, plan, simulation];
}

function navigateWorkflowStep(step) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("adaptsim:navigate-workflow-step", { detail: { step } }));
}

export function SimulationWorkflowProvider({ children }) {
  const [workbenchState, setWorkbenchState] = useState({
    sourceFiles: [],
    selectedSnapshot: null,
    workflow: {},
    assetSession: null
  });
  const [captureSettings, setCaptureSettings] = useState({
    displayName: "Training Hallway May 3",
    environmentType: "indoor_hallway",
    expectedImageCount: 12,
    notes: "Phone photos captured around the hallway with overlapping passes.",
    scaleHintType: "known_distance",
    scaleHintLabel: "door width",
    scaleHintDistanceM: "0.91"
  });
  const [demoCheckpointEnabled, setDemoCheckpointEnabled] = useState(() => readDemoCheckpointPreference());
  const [checkpointLoading, setCheckpointLoading] = useState(false);
  const [checkpointError, setCheckpointError] = useState("");
  const [flowState, setFlowState] = useState("idle");
  const [flowError, setFlowError] = useState("");
  const [capture, setCapture] = useState(null);
  const [captureStatus, setCaptureStatus] = useState(null);
  const [captureArtifacts, setCaptureArtifacts] = useState([]);
  const [sourceCaptureId, setSourceCaptureId] = useState("");
  const [uploadEntries, setUploadEntries] = useState([]);
  const [activeSceneId, setActiveSceneId] = useState(() =>
    readDemoCheckpointPreference() ? adaptsimApiConfig.cachedSceneId : adaptsimApiConfig.defaultSceneId
  );
  const [sceneRefreshKey, setSceneRefreshKey] = useState(0);
  const [sceneStatus, setSceneStatus] = useState(null);
  const [sceneLoading, setSceneLoading] = useState(false);
  const [sceneError, setSceneError] = useState("");
  const [rawSceneError, setRawSceneError] = useState("");
  const [threatPlan, setThreatPlan] = useState(null);
  const [threatPlanLoading, setThreatPlanLoading] = useState(false);
  const [threatPlanError, setThreatPlanError] = useState("");
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const [launching, setLaunching] = useState(false);
  const [run, setRun] = useState(null);
  const [runStream, setRunStream] = useState(null);
  const [runError, setRunError] = useState("");
  const [rawRunError, setRawRunError] = useState("");
  const [telemetry, setTelemetry] = useState(null);
  const [runArtifacts, setRunArtifacts] = useState([]);
  const [aar, setAar] = useState(null);
  const lastSimulationStateRef = useRef("");

  useEffect(() => {
    const handleSource = (event) => {
      setWorkbenchState((current) => ({ ...current, sourceFiles: event.detail?.sourceFiles || [] }));
    };
    const handleSnapshot = (event) => {
      setWorkbenchState((current) => ({
        ...current,
        selectedSnapshot: event.detail?.selectedSnapshot || null,
        workflow: event.detail?.workflow || {}
      }));
    };
    const handleAsset = (event) => {
      setWorkbenchState((current) => ({ ...current, assetSession: event.detail?.assetSession || null }));
    };
    window.addEventListener("adaptsim:source-files-changed", handleSource);
    window.addEventListener("adaptsim:snapshot-changed", handleSnapshot);
    window.addEventListener("adaptsim:asset-session-changed", handleAsset);
    window.dispatchEvent(new CustomEvent("adaptsim:request-workbench-state"));
    return () => {
      window.removeEventListener("adaptsim:source-files-changed", handleSource);
      window.removeEventListener("adaptsim:snapshot-changed", handleSnapshot);
      window.removeEventListener("adaptsim:asset-session-changed", handleAsset);
    };
  }, []);

  const sourceImageFiles = useMemo(
    () => workbenchState.sourceFiles.map((file) => file.blob).filter(isImageFile),
    [workbenchState.sourceFiles]
  );
  const uploadedCount = uploadEntries.filter((entry) => entry.status === "uploaded").length;
  const captureArtifactEntries = useMemo(
    () => normalizeArtifactEntries(captureStatus, captureArtifacts),
    [captureStatus, captureArtifacts]
  );
  const activePhaseIndex = phaseIndex(captureStatus?.status);
  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.scenario_id === selectedScenarioId) || null,
    [scenarios, selectedScenarioId]
  );
  const readyScenarioCount = scenarios.filter((scenario) => normalizeStatus(scenario.status) === "ready").length;
  const streamHref = artifactUrl(runStream?.stream?.embed_url);
  const aarArtifactHref = artifactUrl(runArtifacts.find((artifact) => artifact.artifact_type === "after_action_review")?.url);
  const milestones = useMemo(
    () =>
      buildMilestones({
        assetSession: workbenchState.assetSession,
        captureStatus,
        checkpointLoading,
        demoCheckpointEnabled,
        sceneStatus,
        sceneLoading,
        threatPlan,
        threatPlanLoading,
        runStream
      }),
    [captureStatus, checkpointLoading, demoCheckpointEnabled, sceneLoading, sceneStatus, threatPlan, threatPlanLoading, runStream, workbenchState.assetSession]
  );

  const canSubmitCapture = useMemo(() => {
    if (!captureSettings.displayName.trim()) return false;
    if (!Number.isInteger(Number(captureSettings.expectedImageCount)) || Number(captureSettings.expectedImageCount) < 1) return false;
    if (!sourceImageFiles.length) return false;
    if (captureSettings.scaleHintType !== "unknown" && !(Number(captureSettings.scaleHintDistanceM) > 0)) return false;
    return !["creating", "signing", "uploading", "submitting"].includes(flowState);
  }, [captureSettings, flowState, sourceImageFiles.length]);

  const refreshScene = useCallback(() => setSceneRefreshKey((value) => value + 1), []);

  const loadDemoCheckpoint = useCallback(async ({ preserveSource = true } = {}) => {
    const checkpointId = adaptsimApiConfig.cachedSceneId;
    setCheckpointLoading(true);
    setCheckpointError("");
    setFlowError("");
    setActiveSceneId(checkpointId);
    try {
      const [statusPayload, artifactPayload] = await Promise.all([
        getCaptureStatus(checkpointId),
        getCaptureArtifacts(checkpointId).catch((error) => {
          console.warn("Demo checkpoint artifact lookup failed.", error);
          return { artifacts: [] };
        })
      ]);
      const nextStatus = {
        ...statusPayload,
        progress: {
          ...(statusPayload.progress || {}),
          phase: statusPayload.progress?.phase || statusPayload.status,
          percent: statusPayload.progress?.percent ?? 100,
          message: "Verified demo scene checkpoint loaded."
        }
      };
      setCapture({
        capture_id: checkpointId,
        status: nextStatus.status,
        gcs_prefix: nextStatus.gcs_prefix
      });
      setCaptureStatus(nextStatus);
      setCaptureArtifacts(artifactPayload.artifacts || []);
      setFlowState("ready");
      if (!preserveSource) setSourceCaptureId("");
      refreshScene();
      return nextStatus;
    } catch (error) {
      console.warn("Demo checkpoint status unavailable; using frontend fallback.", error);
      const fallbackStatus = {
        contract_type: "capture_status",
        schema_version: "1.0",
        capture_id: checkpointId,
        display_name: "Demo scene",
        status: "ready",
        updated_at: new Date().toISOString(),
        gcs_prefix: "",
        progress: {
          phase: "ready",
          percent: 100,
          message: "Demo scene checkpoint selected from cached frontend metadata."
        },
        artifacts: {},
        unreal: {
          status: "ready",
          level_path: "/Game/AdaptSim/Maps/L_SafetyPark_MVP"
        },
        error: null
      };
      setCapture({
        capture_id: checkpointId,
        status: fallbackStatus.status,
        gcs_prefix: fallbackStatus.gcs_prefix
      });
      setCaptureStatus(fallbackStatus);
      setCaptureArtifacts([]);
      setFlowState("ready");
      setCheckpointError("");
      setFlowError("");
      refreshScene();
      return fallbackStatus;
    } finally {
      setCheckpointLoading(false);
    }
  }, [refreshScene]);

  useEffect(() => {
    writeDemoCheckpointPreference(demoCheckpointEnabled);
    if (demoCheckpointEnabled) {
      void loadDemoCheckpoint().catch(() => {});
    } else if (activeSceneId === adaptsimApiConfig.cachedSceneId && capture?.capture_id === adaptsimApiConfig.cachedSceneId) {
      setCapture(null);
      setCaptureStatus(null);
      setCaptureArtifacts([]);
      setActiveSceneId(adaptsimApiConfig.defaultSceneId);
      setFlowState("idle");
      refreshScene();
    }
  }, [activeSceneId, capture?.capture_id, demoCheckpointEnabled, loadDemoCheckpoint, refreshScene]);

  useEffect(() => {
    if (!capture?.capture_id || capture.capture_id === adaptsimApiConfig.cachedSceneId) return undefined;
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
          setActiveSceneId(status.capture_id);
          refreshScene();
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
          setFlowError(friendlyApiError(error));
          timer = window.setTimeout(poll, 4000);
        }
      }
    };

    timer = window.setTimeout(poll, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [capture?.capture_id, refreshScene]);

  useEffect(() => {
    let cancelled = false;
    async function loadScene() {
      setSceneLoading(true);
      setSceneError("");
      setRawSceneError("");
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
          if (demoCheckpointEnabled && activeSceneId === adaptsimApiConfig.cachedSceneId) {
            const fallbackStatus = fallbackDemoSceneStatus(activeSceneId);
            setSceneStatus(fallbackStatus);
            setScenarios(fallbackDemoScenarios);
            setSelectedScenarioId((current) =>
              fallbackDemoScenarios.some((scenario) => scenario.scenario_id === current)
                ? current
                : fallbackDemoScenarios[0]?.scenario_id || ""
            );
            setSceneError("");
          } else {
            setSceneStatus(null);
            setScenarios([]);
            setSceneError(friendlyApiError(error, "Scene readiness is unavailable. The demo threat plan may still be shown from cached data."));
          }
          setRawSceneError(formatApiError(error));
        }
      } finally {
        if (!cancelled) setSceneLoading(false);
      }
    }
    void loadScene();
    return () => {
      cancelled = true;
    };
  }, [activeSceneId, demoCheckpointEnabled, sceneRefreshKey]);

  useEffect(() => {
    const assetDatabaseReady = isAssetDatabaseReady(workbenchState.assetSession);
    if (!assetDatabaseReady) {
      setThreatPlan(null);
      setThreatPlanLoading(false);
      setThreatPlanError("");
      return undefined;
    }

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
          setThreatPlanError(friendlyApiError(error, "Threat plan is unavailable."));
        }
      } finally {
        if (!cancelled) setThreatPlanLoading(false);
      }
    }
    void loadThreatPlan();
    return () => {
      cancelled = true;
    };
  }, [activeSceneId, sceneRefreshKey, workbenchState.assetSession]);

  const handleCaptureSettingChange = (event) => {
    const { name, value } = event.target;
    setCaptureSettings((current) => ({ ...current, [name]: value }));
  };

  const startCapture = async (event) => {
    event?.preventDefault();
    if (!canSubmitCapture) return;

    const captureFiles = sourceImageFiles;
    setFlowError("");
    setCaptureArtifacts([]);
    setRun(null);
    setRunStream(null);
    setTelemetry(null);
    setRunArtifacts([]);
    setAar(null);

    try {
      setFlowState("creating");
      setUploadEntries(
        captureFiles.map((file) => ({
          filename: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
          status: "pending"
        }))
      );
      const createdCapture = await createCapture(buildCapturePayload(captureSettings));
      setSourceCaptureId(createdCapture.capture_id);
      setCapture(createdCapture);
      setCaptureStatus({
        capture_id: createdCapture.capture_id,
        display_name: captureSettings.displayName,
        status: createdCapture.status,
        progress: { phase: createdCapture.status, percent: 0, message: "Capture created." },
        gcs_prefix: createdCapture.gcs_prefix
      });

      setFlowState("signing");
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
      const uploadPairs = captureFiles.map((file) => ({ file, upload: uploadsByName.get(file.name) }));
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
          setUploadEntries((entries) => entries.map((entry, entryIndex) => (entryIndex === index ? { ...entry, status: "uploading", error: "" } : entry)));
          try {
            await uploadFileToSignedUrl(file, upload);
            setUploadEntries((entries) => entries.map((entry, entryIndex) => (entryIndex === index ? { ...entry, status: "uploaded", gcsUri: upload.gcs_uri } : entry)));
          } catch (error) {
            firstError = error;
            setUploadEntries((entries) => entries.map((entry, entryIndex) => (entryIndex === index ? { ...entry, status: "failed", error: formatApiError(error) } : entry)));
          }
        }
      });
      await Promise.all(workers);
      if (firstError) throw firstError;

      setFlowState("submitting");
      await submitCapture(createdCapture.capture_id, captureFiles.length, {
        startReconstruction: !demoCheckpointEnabled
      });
      if (demoCheckpointEnabled) {
        setFlowState("loading_demo_scene");
        await loadDemoCheckpoint();
        return;
      }
      setFlowState("polling");
    } catch (error) {
      setFlowState("failed");
      setFlowError(friendlyApiError(error));
    }
  };

  const handleLaunchScenario = useCallback(async () => {
    if (!selectedScenarioId) return;
    setLaunching(true);
    setRunError("");
    setRawRunError("");
    setRun(null);
    setRunStream(null);
    setTelemetry(null);
    setRunArtifacts([]);
    setAar(null);
    navigateWorkflowStep("04");
    try {
      const launchPayload = await launchScenario(activeSceneId, selectedScenarioId);
      setRun(launchPayload);
      setRunStream(launchPayload);
    } catch (error) {
      setRawRunError(formatApiError(error));
      setRunError(friendlyApiError(error, "Pixel Streaming launch is unavailable. Check the stream service connection, then retry."));
    } finally {
      setLaunching(false);
    }
  }, [activeSceneId, selectedScenarioId]);

  useEffect(() => {
    if (!run?.run_id) return undefined;
    if (!run?.stream?.poll_url && normalizeStatus(runStream?.stream?.status || runStream?.status) === "ready") return undefined;
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
          setRunError(friendlyApiError(error, "Stream status is unavailable. The run page will keep retrying."));
          setRawRunError(formatApiError(error));
          timer = window.setTimeout(pollStream, 3000);
        }
      }
    };

    timer = window.setTimeout(pollStream, 600);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [run?.run_id, run?.stream?.poll_url, runStream?.status, runStream?.stream?.status]);

  useEffect(() => {
    const simulationState = {
      demoCheckpointSelected: demoCheckpointEnabled,
      checkpointReady: captureStatus?.status === "ready" || sceneStatus?.status === "ready",
      sceneReady: sceneStatus?.status === "ready",
      threatPlanReady: Boolean(threatPlan),
      assetSessionReady: isAssetDatabaseReady(workbenchState.assetSession),
      assetSessionRunning: isGeneratedAssetSessionActive(workbenchState.assetSession),
      hasReadyScenario: readyScenarioCount > 0,
      selectedScenarioId,
      runLaunched: Boolean(run?.run_id),
      streamReady: normalizeStatus(runStream?.stream?.status || runStream?.status) === "ready"
    };
    const signature = JSON.stringify(simulationState);
    window.__adaptsimSimulationState = simulationState;
    if (lastSimulationStateRef.current !== signature) {
      lastSimulationStateRef.current = signature;
      window.dispatchEvent(new CustomEvent("adaptsim:simulation-state-changed", { detail: simulationState }));
    }
  }, [captureStatus?.status, demoCheckpointEnabled, readyScenarioCount, run?.run_id, runStream?.status, runStream?.stream?.status, sceneStatus?.status, selectedScenarioId, threatPlan, workbenchState.assetSession]);

  const value = useMemo(
    () => ({
      activePhaseIndex,
      activeSceneId,
      aar,
      aarArtifactHref,
      canSubmitCapture,
      capture,
      captureArtifactEntries,
      captureArtifacts,
      captureSettings,
      captureStatus,
      checkpointError,
      checkpointLoading,
      demoCheckpointEnabled,
      environmentOptions,
      flowError,
      flowState,
      handleCaptureSettingChange,
      handleLaunchScenario,
      isLaunching: launching,
      loadDemoCheckpoint,
      milestones,
      rawRunError,
      rawSceneError,
      readyScenarioCount,
      refreshScene,
      run,
      runArtifacts,
      runError,
      runStream,
      scaleHintOptions,
      scenarios,
      sceneError,
      sceneLoading,
      sceneStatus,
      selectedScenario,
      selectedScenarioId,
      setActiveSceneId,
      setDemoCheckpointEnabled,
      setSelectedScenarioId,
      sourceCaptureId,
      sourceFiles: workbenchState.sourceFiles,
      sourceImageFiles,
      startCapture,
      streamHref,
      telemetry,
      threatPlan,
      threatPlanError,
      threatPlanLoading,
      uploadEntries,
      uploadedCount,
      workbenchAssetSession: workbenchState.assetSession,
      workbenchSnapshot: workbenchState.selectedSnapshot,
      workbenchWorkflow: workbenchState.workflow
    }),
    [activePhaseIndex, activeSceneId, aar, aarArtifactHref, canSubmitCapture, capture, captureArtifactEntries, captureArtifacts, captureSettings, captureStatus, checkpointError, checkpointLoading, demoCheckpointEnabled, flowError, flowState, handleLaunchScenario, launching, loadDemoCheckpoint, milestones, rawRunError, rawSceneError, readyScenarioCount, refreshScene, run, runArtifacts, runError, runStream, scenarios, sceneError, sceneLoading, sceneStatus, selectedScenario, selectedScenarioId, sourceCaptureId, sourceImageFiles, streamHref, telemetry, threatPlan, threatPlanError, threatPlanLoading, uploadEntries, uploadedCount, workbenchState.assetSession, workbenchState.selectedSnapshot, workbenchState.sourceFiles, workbenchState.workflow]
  );

  return <SimulationWorkflowContext.Provider value={value}>{children}</SimulationWorkflowContext.Provider>;
}

function useSimulationWorkflow() {
  const context = useContext(SimulationWorkflowContext);
  if (!context) throw new Error("useSimulationWorkflow must be used inside SimulationWorkflowProvider.");
  return context;
}

export function SourceSimulationPanel() {
  const workflow = useSimulationWorkflow();

  return (
    <div className="source-demo-toggle" aria-label="Demo reconstruction mode">
      <label className="switch-field compact">
        <input
          type="checkbox"
          checked={workflow.demoCheckpointEnabled}
          onChange={(event) => workflow.setDemoCheckpointEnabled(event.target.checked)}
        />
        <span>Demo</span>
      </label>
    </div>
  );
}

export function SceneReadinessPanel() {
  const workflow = useSimulationWorkflow();

  return (
    <section className="workflow-support-panel scene-readiness-panel" aria-label="Scene readiness">
      <div className="support-panel-heading">
        <div>
          <h3>{sceneDisplayName(workflow.sceneStatus, workflow.activeSceneId)}</h3>
        </div>
      </div>
      {workflow.sceneError && <p className="capture-error" role="alert">{workflow.sceneError}</p>}
      <div className="scene-readiness-grid">
        <div>
          <span>Scene ID</span>
          <strong>{workflow.activeSceneId}</strong>
        </div>
        <div>
          <span>Anchors</span>
          <strong>{workflow.sceneStatus?.anchor_count ?? "--"}</strong>
        </div>
        <div>
          <span>Scenarios</span>
          <strong>{workflow.sceneStatus?.scenario_count ?? workflow.scenarios.length}</strong>
        </div>
        <div>
          <span>Stream</span>
          <strong>{workflow.sceneStatus?.stream?.status || "--"}</strong>
        </div>
      </div>
      <div className="unified-flow-strip compact" aria-label="Scene pipeline status">
        {workflow.milestones.map((milestone, index) => (
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
      <div className="button-row compact-actions">
        <Button className="quiet-button" variant="outline" type="button" disabled={!workflow.demoCheckpointEnabled} onClick={() => void workflow.loadDemoCheckpoint()}>
          Demo scene
        </Button>
        {workflow.captureStatus?.status === "ready" && (
          <Button className="quiet-button" variant="outline" type="button" onClick={() => workflow.setActiveSceneId(workflow.captureStatus.capture_id)}>
            Captured scene
          </Button>
        )}
        <Button className="quiet-button" variant="outline" type="button" onClick={workflow.refreshScene}>Refresh</Button>
      </div>
    </section>
  );
}

export function ThreatWorkflowPanel() {
  const workflow = useSimulationWorkflow();
  const assetDatabase = workflow.workbenchAssetSession?.asset_database || null;
  const assetDatabaseReady = isAssetDatabaseReady(workflow.workbenchAssetSession);
  const assetDatabaseRunning = isGeneratedAssetSessionActive(workflow.workbenchAssetSession);
  const threatAssets = assetDatabaseReady
    ? (assetDatabase?.asset_cards || []).slice(0, 5).map((asset, index) => ({
        asset_id: asset.asset_id || `generated_asset_${index + 1}`,
        display_name: asset.display_name || asset.name || asset.asset_id || `Generated Asset ${index + 1}`,
        threat_category: asset.threat_category || asset.category || asset.asset_category || "threat_vector",
        movement_domain: asset.movement_domain || "ground",
        tactical_role: asset.tactical_role || asset.role || "review",
        runtime_binding: asset.runtime_binding || asset.runtime_binding_hint || asset.spawn_policy || "pending_review"
      }))
    : [];
  const threatAffordances = assetDatabaseReady ? workflow.threatPlan?.scene_affordances?.slice(0, 6) || [] : [];
  const threatSequence = assetDatabaseReady ? workflow.threatPlan?.threat_sequence || [] : [];
  const showCompiledPlan = assetDatabaseReady && workflow.threatPlan;

  if (!assetDatabaseRunning && !assetDatabaseReady && !workflow.threatPlanError) return null;

  return (
    <section className="workflow-support-panel threats-panel" aria-label="Threat package">
      <div className="support-panel-heading">
        <div>
          <h3>{assetDatabaseRunning ? "Generating Threat Database" : "Threat Database"}</h3>
          <p>
            {assetDatabaseReady
              ? assetDatabase?.session_summary || "Generated threat database is ready for review."
              : "Building threat-vector assets from the confirmed location, source photos, and operation context."}
          </p>
        </div>
      </div>
      {workflow.threatPlanError && <p className="capture-error" role="alert">{workflow.threatPlanError}</p>}

      {assetDatabaseRunning && <div className="asset-generation-loading" role="status" aria-live="polite">
        <div className="loading-bars" aria-hidden="true"><span></span><span></span><span></span></div>
        <p>GPT asset generation is running. The generated database will appear here when the session completes.</p>
      </div>}

      {threatAffordances.length > 0 && (
        <div className="affordance-rack" aria-label="Scene affordances">
          {threatAffordances.map((affordance) => (
            <article key={`${affordance.anchor_id}-${affordance.role}`}>
              <span>{affordance.tactical_label || humanize(affordance.role)}</span>
              <strong>{humanize(affordance.role)}</strong>
              {affordance.finding && <small>{affordance.finding}</small>}
            </article>
          ))}
        </div>
      )}

      <div className="threat-asset-list" aria-label="Generated threat assets">
        {threatAssets.map((asset) => (
          <article key={asset.asset_id} className="threat-asset-row">
            <div className="threat-asset-title">
              <strong>{asset.display_name}</strong>
            </div>
            <dl className="threat-asset-meta">
              <div><dt>Category</dt><dd>{humanize(asset.threat_category)}</dd></div>
              <div><dt>Movement</dt><dd>{humanize(asset.movement_domain)}</dd></div>
              <div><dt>Role</dt><dd>{humanize(asset.tactical_role)}</dd></div>
              <div><dt>Runtime binding</dt><dd>{formatRuntimeBinding(asset.runtime_binding)}</dd></div>
            </dl>
          </article>
        ))}
      </div>

      {showCompiledPlan && (
        <div className="gameplay-plan-grid" aria-label="Gameplay plan summary">
          <div><span>Objective</span><p>{workflow.threatPlan.objective || "Threat injection plan objective will appear when data is available."}</p></div>
          <div><span>Spawn / entry anchors</span><p>{(workflow.threatPlan.spawn_entry_anchors || []).map(humanize).join(", ") || "Pending anchors"}</p></div>
          <div><span>Triggers</span><p>{(workflow.threatPlan.triggers || []).map(humanize).join(", ") || "Pending triggers"}</p></div>
          <div><span>Expected trainee response</span><p>{workflow.threatPlan.expected_trainee_response || "Identify, report, move to cover, and continue the objective."}</p></div>
        </div>
      )}

      {threatSequence.length > 0 && (
        <div className="threat-sequence-list" aria-label="Threat sequence">
          {threatSequence.map((step) => (
            <article key={`${step.step}-${step.action}-${step.anchor_id}`}>
              <span>{String(step.step).padStart(2, "0")}</span>
              <div>
                <strong>{humanize(step.action)}</strong>
                <small>{humanize(step.trigger)} at {humanize(step.anchor_id)}</small>
                <p>{step.trainee_task}</p>
              </div>
            </article>
          ))}
        </div>
      )}

      {assetDatabaseReady && <ScenarioPicker compact />}
    </section>
  );
}

export function ScenarioPicker({ compact = false }) {
  const workflow = useSimulationWorkflow();

  return (
    <section className={compact ? "scenario-picker compact" : "scenario-picker"} aria-label="Training vignette selection">
      <div className="support-panel-heading">
        <div>
          <h3>{workflow.selectedScenario?.display_name || "Scenario"}</h3>
        </div>
      </div>
      <div className="scenario-list" role="radiogroup" aria-label="Training vignettes">
        {workflow.scenarios.length === 0 && <p className="capture-inline-note">No ready scenarios returned for this scene.</p>}
        {workflow.scenarios.map((scenario) => (
          <label key={scenario.scenario_id} className="scenario-option">
            <input
              type="radio"
              name="scenario"
              value={scenario.scenario_id}
              checked={workflow.selectedScenarioId === scenario.scenario_id}
              onChange={() => workflow.setSelectedScenarioId(scenario.scenario_id)}
            />
            <span>
              <strong>{scenario.display_name || scenario.scenario_id}</strong>
              <small>{scenario.training_objective}</small>
            </span>
            <em>{scenario.status}</em>
          </label>
        ))}
      </div>
      <Button
        className="primary-button full-width"
        type="button"
        disabled={!workflow.selectedScenarioId || workflow.sceneStatus?.status !== "ready" || workflow.isLaunching}
        onClick={workflow.handleLaunchScenario}
      >
        {workflow.isLaunching ? "Launching Simulation" : "Enter Simulation"}
      </Button>
    </section>
  );
}

export function RunSimulationPage() {
  const workflow = useSimulationWorkflow();
  const streamStatus = normalizeStatus(workflow.runStream?.stream?.status || workflow.runStream?.status);
  const streamUnavailable = Boolean(workflow.runError) || streamStatus === "failed";
  const placeholderTitle = streamUnavailable
    ? "Pixel Streaming is not connected"
    : workflow.run
      ? "Waiting for stream URL"
      : "Simulation standby";
  const placeholderDetail = streamUnavailable
    ? "The run page is ready, but the Pixel Streaming service has not returned an interactive stream."
    : workflow.run
      ? "Polling Pixel Streaming status."
      : "Select a ready vignette and enter the simulation.";

  return (
    <section
      id="workflow-page-04"
      className="workflow-page run-workflow-page"
      data-step="04"
      data-workflow-page="04"
      aria-label="Run simulation page"
      aria-hidden="true"
      tabIndex={-1}
    >
      <div className="run-stage">
        <div className="run-stage-main">
          {workflow.runError && <p className="capture-error" role="alert">{workflow.runError}</p>}

          {workflow.streamHref ? (
            <div className="full-stream-shell">
              <iframe
                title={`Pixel Streaming run ${workflow.run?.run_id}`}
                src={workflow.streamHref}
                allow="autoplay; fullscreen; gamepad; pointer-lock; clipboard-read; clipboard-write"
                allowFullScreen
              ></iframe>
            </div>
          ) : (
            <div className={streamUnavailable ? "full-stream-placeholder stream-unavailable" : "full-stream-placeholder"}>
              <strong>{placeholderTitle}</strong>
              <span>{placeholderDetail}</span>
              <Button
                className="primary-button"
                type="button"
                disabled={!workflow.selectedScenarioId || workflow.sceneStatus?.status !== "ready" || workflow.isLaunching}
                onClick={workflow.handleLaunchScenario}
              >
                {workflow.isLaunching ? "Launching Simulation" : streamUnavailable ? "Retry Launch" : "Enter Simulation"}
              </Button>
            </div>
          )}
        </div>

        <aside className="run-side-panel" aria-label="Run telemetry and review">
          <ScrollArea className="run-side-scroll">
          <details open>
            <summary>Run Brief</summary>
            <div className="run-brief">
              <span>Scene</span>
              <strong>{sceneDisplayName(workflow.sceneStatus, workflow.activeSceneId)}</strong>
              <span>Scenario</span>
              <strong>{workflow.selectedScenario?.display_name || "--"}</strong>
              <p>{workflow.selectedScenario?.training_objective || workflow.threatPlan?.objective || "Ready scenario details appear here."}</p>
            </div>
          </details>

          <details>
            <summary>Telemetry</summary>
            {workflow.telemetry?.events?.length ? (
              <div className="telemetry-list">
                {workflow.telemetry.events.slice(-6).map((event) => (
                  <div key={event.event_id || `${event.event_type}-${event.timestamp}`} className="telemetry-entry">
                    <strong>{humanize(event.event_type)}</strong>
                    <span>{event.source || "sim"} / {event.sim_time_s ?? "--"}s</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="capture-inline-note">Telemetry appears after launch.</p>
            )}
          </details>

          <details>
            <summary>Artifacts</summary>
            <div className="run-link-list">
              {workflow.streamHref && <a href={workflow.streamHref} target="_blank" rel="noreferrer">Open stream in new tab</a>}
              {workflow.runArtifacts.map((artifact) => {
                const href = artifactUrl(artifact.url);
                return <a key={artifact.artifact_type} href={href} target="_blank" rel="noreferrer">{humanize(artifact.artifact_type)}</a>;
              })}
              {workflow.aar?.markdown && workflow.aarArtifactHref && <a href={workflow.aarArtifactHref} target="_blank" rel="noreferrer">AAR Markdown</a>}
            </div>
          </details>

          {workflow.aar?.markdown && (
            <details>
              <summary>AAR Preview</summary>
              <pre>{workflow.aar.markdown}</pre>
            </details>
          )}
          </ScrollArea>
        </aside>
      </div>
    </section>
  );
}
