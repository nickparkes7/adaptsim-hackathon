import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

function phaseIndex(status) {
  const index = capturePhaseCatalog.findIndex((phase) => phase.id === status);
  return index < 0 ? -1 : index;
}

export function CaptureSimulationFlow() {
  const fileInputRef = useRef(null);
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
  const [uploadEntries, setUploadEntries] = useState([]);
  const [activeSceneId, setActiveSceneId] = useState(adaptsimApiConfig.defaultSceneId);
  const [sceneRefreshKey, setSceneRefreshKey] = useState(0);
  const [sceneStatus, setSceneStatus] = useState(null);
  const [sceneLoading, setSceneLoading] = useState(false);
  const [sceneError, setSceneError] = useState("");
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

  const resetCapture = () => {
    setFlowState("idle");
    setFlowError("");
    setCapture(null);
    setCaptureStatus(null);
    setCaptureArtifacts([]);
    setUploadEntries([]);
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const startCapture = async (event) => {
    event.preventDefault();
    if (!canSubmitCapture) return;

    setFlowError("");
    setCaptureArtifacts([]);
    setRun(null);
    setRunStream(null);
    setTelemetry(null);
    setRunArtifacts([]);
    setAar(null);

    try {
      setFlowState("creating");
      setUploadEntries((entries) => entries.map((entry) => ({ ...entry, status: "pending", error: "" })));
      const createdCapture = await createCapture(buildCapturePayload(formState));
      setCapture(createdCapture);
      setCaptureStatus({
        capture_id: createdCapture.capture_id,
        display_name: formState.displayName,
        status: createdCapture.status,
        progress: { phase: createdCapture.status, percent: 0, message: "Capture created." },
        gcs_prefix: createdCapture.gcs_prefix
      });

      setFlowState("signing");
      const uploadUrlPayload = await requestUploadUrls(createdCapture.capture_id, files);
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
      const uploadPairs = files.map((file) => ({
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
      await submitCapture(createdCapture.capture_id, files.length);
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

  return (
    <section className="capture-flow-shell" aria-labelledby="capture-flow-title">
      <div className="capture-flow-heading">
        <div>
          <p className="eyebrow">Capture To Simulation</p>
          <h1 id="capture-flow-title">Photo Capture Pipeline</h1>
        </div>
        <div className="capture-config-pills" aria-label="API configuration">
          <span className="count-pill">{adaptsimApiConfig.mode}</span>
          <span className="count-pill">{adaptsimApiConfig.apiBase}</span>
        </div>
      </div>

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
              Create Capture And Upload
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
            <strong>{captureStatus?.display_name || "No active capture"}</strong>
            <span>{captureStatus?.progress?.message || "Create a capture to start the reconstruction lifecycle."}</span>
            {captureStatus?.updated_at && <small>Updated {formatDate(captureStatus.updated_at)}</small>}
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
            <h2 id="ready-scene-title">Simulation Launch</h2>
          </div>
          <div className="button-row compact-actions">
            <button className="quiet-button" type="button" onClick={() => setActiveSceneId(adaptsimApiConfig.defaultSceneId)}>
              Demo Scene
            </button>
            {captureStatus?.status === "ready" && (
              <button className="quiet-button" type="button" onClick={() => setActiveSceneId(captureStatus.capture_id)}>
                Captured Scene
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

            <div className="scenario-list" role="radiogroup" aria-label="Scenarios">
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
              Launch Pixel Stream
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
                  Open Pixel Streaming URL
                </a>
              </div>
            ) : (
              <div className="stream-placeholder">
                <strong>{run ? "Waiting for stream URL" : "Stream standby"}</strong>
                <span>{run ? "Polling run stream status." : "Launch a ready scenario to attach the player."}</span>
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
