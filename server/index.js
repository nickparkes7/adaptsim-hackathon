const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { execFile, spawn } = require("node:child_process");

let createTesseractWorker = null;
let tesseractPsm = null;
let sharp = null;
try {
  ({ createWorker: createTesseractWorker, PSM: tesseractPsm } = require("tesseract.js"));
} catch {}
try {
  sharp = require("sharp");
} catch {}

const serverDir = __dirname;
const projectRoot = path.resolve(serverDir, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const contents = fs.readFileSync(filePath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (Object.prototype.hasOwnProperty.call(process.env, key)) continue;
    let value = rawValue.trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.join(projectRoot, ".env"));

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";
const contractsExamplesDir = path.join(projectRoot, "contracts", "examples");
const webDistDir = path.join(projectRoot, "apps/web/dist");
const webPublicDir = path.join(projectRoot, "apps/web/public");
const dataDir = process.env.DATA_DIR || path.join(webPublicDir, "data");
const safetyParkZipPath = process.env.ADAPTSIM_SAFETY_PARK_ZIP || path.join(projectRoot, "data", "safety_park", "safety_park.zip");
const staticRoot = process.env.STATIC_ROOT || webDistDir;
const maxBodyBytes = Number(process.env.MAX_BODY_BYTES || 32 * 1024);
const maxVisionBodyBytes = Number(process.env.MAX_VISION_BODY_BYTES || 8 * 1024 * 1024);
const maxAssetSessionBodyBytes = Number(process.env.MAX_ASSET_SESSION_BODY_BYTES || 36 * 1024 * 1024);
const maxCsvBytes = Number(process.env.MAX_CSV_BYTES || 2 * 1024 * 1024);
const maxRows = Number(process.env.MAX_SYNC_ROWS || 2000);
const upstreamTimeoutMs = Number(process.env.UPSTREAM_TIMEOUT_MS || 15000);
const assetGenerationTimeoutMs = Number(process.env.OPENAI_ASSET_TIMEOUT_MS || 180000);
const openGeoLookupTimeoutMs = Number(process.env.OPEN_GEO_LOOKUP_TIMEOUT_MS || 6500);
const openGeoImageLookupEnabled = process.env.OPEN_GEO_IMAGE_LOOKUP !== "0";
const commonsApiUrl = process.env.WIKIMEDIA_COMMONS_API_URL || "https://commons.wikimedia.org/w/api.php";
const commonsUserAgent = process.env.COMMONS_USER_AGENT || "AdaptSim/0.1 local open-geolocation evidence prototype";
const openPlaceEvidencePath = process.env.OPEN_PLACE_EVIDENCE_PATH || path.join(dataDir, "open-place-evidence.json");
const generatedSessionRoot = process.env.ADAPTSIM_SESSION_DIR || path.join(projectRoot, ".adaptsim", "generated-sessions");
const openAiAssetModel = process.env.OPENAI_ASSET_MODEL || "gpt-5.5";
const trellisVmEndpoint = String(process.env.TRELLIS_VM_ENDPOINT || "").trim().replace(/\/+$/, "");
const trellisVmApiKey = String(process.env.TRELLIS_VM_API_KEY || "").trim();
const schemaVersion = "1.0";
const gcsBucket = process.env.GCS_BUCKET || "aiscanners-hackathon2025";
const gcsCapturePrefix = String(process.env.GCS_CAPTURE_PREFIX || "adaptsim-captures").replace(/^\/+|\/+$/g, "");
const gcsSigningServiceAccount = process.env.GCS_SIGNING_SERVICE_ACCOUNT || "photogrammetry-test@gecko-dev-fde.iam.gserviceaccount.com";
const gcsSigningRegion = process.env.GCS_SIGNING_REGION || "us";
const gcsSignedUrlDuration = process.env.GCS_SIGNED_URL_DURATION || "1h";
const pixelStreamUrl = process.env.ADAPTSIM_PIXEL_STREAM_URL || "http://127.0.0.1:8080/";
const streamReadyDelayMs = Number(process.env.ADAPTSIM_STREAM_READY_DELAY_MS || 0);
const streamTtlMs = Number(process.env.ADAPTSIM_STREAM_TTL_MS || 90 * 60 * 1000);
const workerTriggersEnabled = process.env.ADAPTSIM_ENABLE_WORKER_TRIGGERS === "1";
const workerTriggerTimeoutMs = Number(process.env.ADAPTSIM_WORKER_TRIGGER_TIMEOUT_MS || 15000);
const a100Instance = process.env.ADAPTSIM_A100_INSTANCE || "a100-instance-02";
const a100Zone = process.env.ADAPTSIM_A100_ZONE || "us-east1-b";
const a100Project = process.env.ADAPTSIM_GCP_PROJECT || "gecko-dev-fde";
const l4Instance = process.env.ADAPTSIM_L4_INSTANCE || "linux-pixel-streaming";
const l4Zone = process.env.ADAPTSIM_L4_ZONE || "us-east1-d";
const l4Project = process.env.ADAPTSIM_GCP_PROJECT || "gecko-dev-fde";
const l4RepoRoot = process.env.ADAPTSIM_L4_REPO_ROOT || "/home/nicholas.parkes/adaptsim/repos/adaptsim-hackathon";
const l4UnrealProjectRoot = process.env.ADAPTSIM_L4_UNREAL_PROJECT_ROOT || "/home/nicholas.parkes/Documents/Unreal Projects/AdaptSim";
const l4ContractExamplesRoot = process.env.ADAPTSIM_L4_CONTRACT_EXAMPLES_ROOT || `${l4UnrealProjectRoot}/Saved/AdaptSimContractExamples`;
const l4CaptureDataRoot = process.env.ADAPTSIM_L4_CAPTURE_DATA_ROOT || "/home/nicholas.parkes/adaptsim/data/captures";
const defaultPixelStreamingMapPath = process.env.ADAPTSIM_DEFAULT_MAP_PATH || "/Game/AdaptSim/Maps/L_HorrorCorridor_Imported";
const defaultPixelStreamingSemanticEnvironmentPath = process.env.ADAPTSIM_DEFAULT_SEMANTIC_ENVIRONMENT_PATH || path.posix.join(l4ContractExamplesRoot, "semantic_environments", "horror_corridor_imported.json");
const pixelStreamingResX = process.env.ADAPTSIM_PS_RES_X || "1280";
const pixelStreamingResY = process.env.ADAPTSIM_PS_RES_Y || "720";
const pixelStreamingEncoderCodec = process.env.ADAPTSIM_PS_ENCODER_CODEC || "H264";
const pixelStreamingWebrtcMinBitrate = process.env.ADAPTSIM_PS_WEBRTC_MIN_BITRATE || "3000000";
const pixelStreamingWebrtcMaxBitrate = process.env.ADAPTSIM_PS_WEBRTC_MAX_BITRATE || "10000000";
const pixelStreamingEncoderMaxBitrate = process.env.ADAPTSIM_PS_ENCODER_MAX_BITRATE || "10000000";
const pixelStreamingEncoderTargetBitrate = process.env.ADAPTSIM_PS_ENCODER_TARGET_BITRATE || "";
const l4StatusTimeoutMs = Number(process.env.ADAPTSIM_L4_STATUS_TIMEOUT_MS || workerTriggerTimeoutMs);
const demoSceneId = "scan_hallway_alpha";
const demoScenarioIds = ["scan_hallway_delay_001", "scan_hallway_observer_002"];
const demoRunId = "run_hallway_delay_001";
const safetyParkDemoImageNames = [
  "000060.jpg",
  "000067.jpg",
  "000076.jpg",
  "000081.jpg",
  "000091.jpg",
  "000101.jpg",
  "000128.jpg",
  "000153.jpg"
];
const launchedRuns = new Map();
const defaultAllowedOrigins = [
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:8787",
  "http://localhost:8787",
];
const allowedOrigins = new Set(
  String(process.env.ALLOWED_ORIGINS || defaultAllowedOrigins.join(","))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);
const assetSessionJobs = new Map();
const unrealImportTriggerPromises = new Map();

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".md": "text/markdown; charset=utf-8",
  ".ico": "image/x-icon",
};

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function setSecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("Origin-Agent-Cluster", "?1");
  response.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()"
  );
}

function getAllowedCorsOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return "";

  try {
    const originUrl = new URL(origin);
    if (request.headers.host && originUrl.host === request.headers.host) return origin;
    if (["localhost", "127.0.0.1", "::1"].includes(originUrl.hostname)) return origin;
  } catch {}

  return allowedOrigins.has(origin) ? origin : "";
}

function isAllowedOrigin(request) {
  return !request.headers.origin || Boolean(getAllowedCorsOrigin(request));
}

function setCorsHeaders(request, response) {
  const origin = getAllowedCorsOrigin(request);
  if (!origin) return;
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Vary", "Origin");
}

function sendJson(request, response, statusCode, payload) {
  setSecurityHeaders(response);
  setCorsHeaders(request, response);
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function sendFile(response, filePath, { body = true } = {}) {
  const extension = path.extname(filePath).toLowerCase();
  const contentType = contentTypes[extension] || "application/octet-stream";
  setSecurityHeaders(response);
  response.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": extension === ".html" ? "no-store" : "no-cache",
  });
  if (!body) {
    response.end();
    return;
  }
  const stream = fs.createReadStream(filePath);
  stream.on("error", () => {
    if (!response.headersSent) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    }
    response.end("Could not read file.");
  });
  stream.pipe(response);
}

function handleSafetyParkDemoSourceImages(request, response) {
  if (!fs.existsSync(safetyParkZipPath)) {
    throw new HttpError(503, `Safety Park dataset zip was not found at ${safetyParkZipPath}.`);
  }

  sendJson(request, response, 200, {
    dataset_id: "safety_park_fvdb_tutorial",
    display_name: "Safety Park FVDB tutorial source photos",
    archive_path: safetyParkZipPath,
    source_url: "https://fvdb-reality-capture.readthedocs.io/latest/tutorials/radiance_field_and_mesh_reconstruction.html",
    image_count: safetyParkDemoImageNames.length,
    embedded_gps: false,
    notes:
      "The FVDB tutorial JPGs do not carry WGS84 EXIF GPS in the sampled files; AdaptSim still runs metadata, vision, and open-image geolocation passes after staging.",
    images: safetyParkDemoImageNames.map((filename) => ({
      filename,
      content_type: "image/jpeg",
      size_bytes: null,
      url: `/api/v1/demo/safety-park/source-images/${filename}`
    }))
  });
}

function streamSafetyParkDemoImage(request, response, filename) {
  const safeFilename = path.basename(filename || "");
  if (!safetyParkDemoImageNames.includes(safeFilename)) {
    throw new HttpError(404, `Safety Park demo image ${safeFilename || filename} was not found.`);
  }
  if (!fs.existsSync(safetyParkZipPath)) {
    throw new HttpError(503, `Safety Park dataset zip was not found at ${safetyParkZipPath}.`);
  }

  const zipEntry = `images_raw/${safeFilename}`;
  const unzip = spawn("unzip", ["-p", safetyParkZipPath, zipEntry], {
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  let didWriteHead = false;

  unzip.stderr.on("data", (chunk) => {
    stderr += String(chunk || "");
  });
  unzip.on("error", (error) => {
    if (!response.headersSent) {
      sendJson(request, response, 500, { error: `Could not read Safety Park demo image: ${error.message}` });
    } else {
      response.destroy(error);
    }
  });
  unzip.on("close", (code) => {
    if (code !== 0 && !didWriteHead && !response.headersSent) {
      sendJson(request, response, 500, { error: stderr.trim() || `unzip exited with code ${code}` });
    }
  });

  setSecurityHeaders(response);
  setCorsHeaders(request, response);
  response.writeHead(200, {
    "Content-Type": "image/jpeg",
    "Cache-Control": "no-cache"
  });
  didWriteHead = true;
  response.on("close", () => {
    if (!response.writableEnded && !unzip.killed) unzip.kill();
  });
  unzip.stdout.pipe(response);
}

function getPathname(urlPath) {
  try {
    return decodeURIComponent(new URL(urlPath || "/", "http://local").pathname);
  } catch {
    return null;
  }
}

function isSafePath(root, candidate) {
  const relativeToRoot = path.relative(root, candidate);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    return false;
  }
  return true;
}

function staticCandidate(root, pathname) {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const candidate = path.resolve(root, relative);
  return isSafePath(root, candidate) ? candidate : null;
}

function resolveStaticPath(urlPath) {
  const pathname = getPathname(urlPath);
  if (!pathname || pathname.startsWith("/api/")) return null;

  const builtAsset = staticCandidate(staticRoot, pathname);
  if (builtAsset && fs.existsSync(builtAsset) && fs.statSync(builtAsset).isFile()) {
    return builtAsset;
  }

  const publicAsset = staticCandidate(webPublicDir, pathname);
  if (publicAsset && fs.existsSync(publicAsset) && fs.statSync(publicAsset).isFile()) {
    return publicAsset;
  }

  const indexPath = path.join(staticRoot, "index.html");
  return fs.existsSync(indexPath) ? indexPath : null;
}

function parseCsvRow(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((line) => line.trim());
  if (!lines.length) {
    return [];
  }

  const headers = parseCsvRow(lines[0]).map((header) => header.trim()).filter(Boolean);
  if (!headers.length) {
    return [];
  }

  return lines.slice(1, maxRows + 1).map((line) => {
    const cells = parseCsvRow(line);
    return headers.reduce((row, header, index) => {
      row[header] = cells[index] ?? "";
      return row;
    }, {});
  });
}

function readJsonBody(request, maxBytes = maxBodyBytes) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let received = 0;
    let tooLarge = false;

    request.on("data", (chunk) => {
      if (tooLarge) return;
      received += chunk.length;
      if (received > maxBytes) {
        tooLarge = true;
        reject(new HttpError(413, "Request body is too large."));
        request.resume();
        return;
      }
      raw += chunk;
    });
    request.on("end", () => {
      if (tooLarge) return;
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new HttpError(400, "Request body was not valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function validateCalendarRequest(body) {
  const sheetId = String(body.sheetId || "").trim();
  const gid = String(body.gid || "0").trim();

  if (!/^[A-Za-z0-9_-]{20,160}$/.test(sheetId)) {
    throw new HttpError(400, "A valid Google Sheet ID is required.");
  }

  if (!/^\d{1,20}$/.test(gid)) {
    throw new HttpError(400, "The Calendar tab gid must be numeric.");
  }

  return { sheetId, gid };
}

async function fetchWithTimeout(url, options = {}, timeoutMessage = "Upstream request timed out.") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), upstreamTimeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new HttpError(504, timeoutMessage);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithCustomTimeout(url, options = {}, timeoutMs = upstreamTimeoutMs, timeoutMessage = "Upstream request timed out.") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new HttpError(504, timeoutMessage);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function handleCalendarSync(request, response) {
  if (!String(request.headers["content-type"] || "").includes("application/json")) {
    sendJson(request, response, 415, { error: "Content-Type must be application/json." });
    return;
  }

  const body = await readJsonBody(request);
  const { sheetId, gid } = validateCalendarRequest(body);
  const sourceUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${encodeURIComponent(gid)}`;
  const upstream = await fetchWithTimeout(
    sourceUrl,
    {
      headers: {
        "user-agent": "AdaptSim Sheets Bridge",
        accept: "text/csv,text/plain;q=0.9,*/*;q=0.8",
      },
    },
    "Google Sheets request timed out."
  );

  if (!upstream.ok) {
    sendJson(request, response, 502, { error: `Google Sheets returned ${upstream.status}.` });
    return;
  }

  const contentLength = Number(upstream.headers.get("content-length") || 0);
  if (contentLength > maxCsvBytes) {
    sendJson(request, response, 413, { error: "Google Sheets CSV export is too large for this local bridge." });
    return;
  }

  const text = await upstream.text();
  if (text.length > maxCsvBytes) {
    sendJson(request, response, 413, { error: "Google Sheets CSV export is too large for this local bridge." });
    return;
  }

  if (/<!doctype html>|<html/i.test(text)) {
    sendJson(request, response, 400, {
      error:
        "Google returned an HTML sign-in page instead of CSV. The sheet or tab needs to be publicly accessible or published for this starter connector.",
    });
    return;
  }

  const rows = parseCsv(text);
  sendJson(request, response, 200, {
    sourceName: String(body.sheetUrl || sourceUrl).slice(0, 500),
    rowCount: rows.length,
    truncated: text.split(/\r\n|\r|\n/).filter((line) => line.trim()).length - 1 > rows.length,
    rows,
  });
}

function validateVisionRequest(body) {
  const fileName = String(body.fileName || "source image").slice(0, 180);
  const imageDataUrl = String(body.imageDataUrl || "");
  const mimeType = String(body.mimeType || "").toLowerCase();
  const allowedImagePattern = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;

  if (!allowedImagePattern.test(imageDataUrl) || !/^image\/(png|jpe?g|webp|gif)$/.test(mimeType)) {
    throw new HttpError(400, "A PNG, JPEG, WEBP, or non-animated GIF image is required.");
  }

  return {
    fileName,
    mimeType,
    imageDataUrl,
    gps: body.gps && typeof body.gps === "object" ? body.gps : null
  };
}

function extractOutputText(payload) {
  if (payload?.output_text) return String(payload.output_text);
  const textItems = [];
  for (const item of payload?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (content?.type === "output_text" && content.text) textItems.push(content.text);
    }
  }
  return textItems.join("\n").trim();
}

function parseVisionJson(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function clampApiText(value, maxLength, fallback = "") {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  return text.length > maxLength ? text.slice(0, maxLength).trim() : text;
}

function toSlug(value, fallback = "session") {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 52);
  return slug || fallback;
}

function hashPayload(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJsonAtomic(filePath, payload) {
  ensureDirectory(path.dirname(filePath));
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`);
  fs.renameSync(tempPath, filePath);
}

function generatedSessionPath(sessionId, fileName = "session.json") {
  const safeSessionId = toSlug(sessionId, "session");
  return path.join(generatedSessionRoot, safeSessionId, fileName);
}

function readGeneratedSession(sessionId) {
  const filePath = generatedSessionPath(sessionId);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function saveGeneratedSession(record) {
  const now = new Date().toISOString();
  const nextRecord = {
    ...record,
    updated_at: now
  };
  writeJsonAtomic(generatedSessionPath(nextRecord.session_id), nextRecord);
  return nextRecord;
}

function listGeneratedSessions() {
  if (!fs.existsSync(generatedSessionRoot)) return [];
  return fs.readdirSync(generatedSessionRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readGeneratedSession(entry.name))
    .filter(Boolean)
    .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
    .slice(0, 30);
}

function normalizeSessionGps(gps) {
  const lat = Number(gps?.lat);
  const lon = Number(gps?.lon);
  if (!isValidCoordinatePair(lat, lon)) return null;
  return {
    lat,
    lon,
    source: clampApiText(gps?.source, 120, "source coordinate")
  };
}

function sanitizeImageDataUrl(value) {
  const text = String(value || "");
  if (!/^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/i.test(text)) return "";
  if (text.length > 20_971_520) return "";
  return text;
}

function sanitizeSourceForAssetSession(source) {
  const imageDataUrl = sanitizeImageDataUrl(source?.imageDataUrl);
  const mimeType = clampApiText(source?.type || source?.mimeType, 120, "");
  return {
    id: clampApiText(source?.id, 120, ""),
    name: clampApiText(source?.name, 180, "source"),
    type: mimeType,
    kind: clampApiText(source?.kind, 40, "Source"),
    size: Math.max(0, Number(source?.size || 0)),
    lastModified: Math.max(0, Number(source?.lastModified || 0)),
    addedAt: clampApiText(source?.addedAt, 40, ""),
    gps: normalizeSessionGps(source?.gps),
    vision: source?.vision && typeof source.vision === "object"
      ? {
          summary: clampApiText(source.vision.summary, 600, ""),
          what: clampApiText(source.vision.what, 180, ""),
          facilityType: clampApiText(source.vision.facilityType, 140, ""),
          visualClues: Array.isArray(source.vision.visualClues)
            ? source.vision.visualClues.map((item) => clampApiText(item, 220, "")).filter(Boolean).slice(0, 10)
            : [],
          possibleLocations: Array.isArray(source.vision.possibleLocations)
            ? source.vision.possibleLocations.map((location) => ({
                name: clampApiText(location?.name, 140, ""),
                country: clampApiText(location?.country, 90, ""),
                lat: location?.lat == null ? null : Number(location.lat),
                lon: location?.lon == null ? null : Number(location.lon),
                confidence: clampApiText(location?.confidence, 30, "low"),
                reason: clampApiText(location?.reason, 320, "")
              })).slice(0, 8)
            : [],
          cautions: Array.isArray(source.vision.cautions)
            ? source.vision.cautions.map((item) => clampApiText(item, 220, "")).filter(Boolean).slice(0, 6)
            : []
        }
      : null,
    textExtract: clampApiText(source?.textExtract, 2400, ""),
    imageDataUrl
  };
}

function buildSessionInputManifest(body) {
  const sourceFiles = Array.isArray(body?.sourceFiles)
    ? body.sourceFiles.map(sanitizeSourceForAssetSession).filter((source) => source.name).slice(0, 24)
    : [];
  if (!sourceFiles.length) {
    throw new HttpError(400, "At least one source file is required to create a generated asset session.");
  }

  const manifestSources = sourceFiles.map(({ imageDataUrl: _imageDataUrl, ...source }) => source);
  const context = body?.context && typeof body.context === "object" ? body.context : {};
  const militaryContext = context.militaryContext && typeof context.militaryContext === "object"
    ? {
        forces: Array.isArray(context.militaryContext.forces)
          ? context.militaryContext.forces.map((item) => clampApiText(item, 260, "")).filter(Boolean).slice(0, 12)
          : [],
        forceDisposition: Array.isArray(context.militaryContext.forceDisposition)
          ? context.militaryContext.forceDisposition.map((item) => clampApiText(item, 360, "")).filter(Boolean).slice(0, 12)
          : [],
        hardware: Array.isArray(context.militaryContext.hardware)
          ? context.militaryContext.hardware.map((item) => clampApiText(item, 360, "")).filter(Boolean).slice(0, 16)
          : [],
        weaponsSystems: Array.isArray(context.militaryContext.weaponsSystems)
          ? context.militaryContext.weaponsSystems.map((item) => clampApiText(item, 360, "")).filter(Boolean).slice(0, 16)
          : [],
        openSourceQueries: Array.isArray(context.militaryContext.openSourceQueries)
          ? context.militaryContext.openSourceQueries.map((item) => clampApiText(item, 220, "")).filter(Boolean).slice(0, 20)
          : [],
        openSourceSources: Array.isArray(context.militaryContext.openSourceSources)
          ? context.militaryContext.openSourceSources.map((source) => ({
              title: clampApiText(source?.title, 220, ""),
              url: clampApiText(source?.url, 500, "")
            })).filter((source) => source.title || source.url).slice(0, 20)
          : []
      }
    : null;
  const manifest = {
    requested_at: new Date().toISOString(),
    operator_id: clampApiText(body?.operatorId || context.operatorId, 120, "local_user"),
    display_name: clampApiText(body?.displayName || context.displayName, 140, "AdaptSim input session"),
    notes: clampApiText(body?.notes || context.notes, 1800, ""),
    location: context.location && typeof context.location === "object"
      ? {
          label: clampApiText(context.location.label, 180, ""),
          country: clampApiText(context.location.country, 90, ""),
          lat: context.location.lat == null ? null : Number(context.location.lat),
          lon: context.location.lon == null ? null : Number(context.location.lon)
        }
      : null,
    militaryContext,
    sourceFiles: manifestSources
  };
  return {
    manifest,
    sourceFiles
  };
}

function createGeneratedSessionRecord(body) {
  const { manifest, sourceFiles } = buildSessionInputManifest(body);
  const inputFingerprint = hashPayload(manifest);
  const timestamp = new Date().toISOString();
  const sessionId = `asset_${timestamp.replace(/[-:.TZ]/g, "").slice(0, 14)}_${inputFingerprint.slice(0, 10)}`;
  const sessionDir = path.dirname(generatedSessionPath(sessionId));
  ensureDirectory(sessionDir);
  writeJsonAtomic(path.join(sessionDir, "input_manifest.json"), manifest);

  const record = {
    session_id: sessionId,
    status: "generating_asset_database",
    created_at: timestamp,
    updated_at: timestamp,
    input_fingerprint: inputFingerprint,
    storage_path: sessionDir,
    status_url: `/api/generative-assets/sessions/${sessionId}`,
    input_manifest_url: `/api/generative-assets/sessions/${sessionId}`,
    generation: {
      provider: "openai",
      model: openAiAssetModel,
      status: "queued",
      started_at: "",
      completed_at: "",
      error: ""
    },
    asset_database: null,
    trellis: {
      model: "microsoft/TRELLIS.2-4B",
      status: "not_started",
      endpoint_configured: Boolean(trellisVmEndpoint),
      job_id: "",
      request_path: "",
      response: null,
      error: ""
    }
  };
  saveGeneratedSession(record);
  return { record, sourceFiles, manifest };
}

function assetDatabaseResponseSchema() {
  const textArray = { type: "array", items: { type: "string" }, maxItems: 24 };
  const threatCategory = {
    type: "string",
    enum: [
      "dismounted_personnel",
      "uav",
      "fpv_drone",
      "quadcopter",
      "ugv",
      "vehicle",
      "usv",
      "weapon_equipment",
      "sensor_payload"
    ]
  };
  const movementDomain = { type: "string", enum: ["ground", "air", "water", "interior"] };
  const tacticalRole = { type: "string", enum: ["recon", "harassment", "ambush", "patrol", "breach", "overwatch", "decoy"] };
  const safetyNote = { type: "string", enum: ["non-operational training simulation"] };
  const threatMetadata = {
    type: "object",
    additionalProperties: false,
    properties: {
      threat_id: { type: "string", pattern: "^[a-z][a-z0-9_]{2,63}$" },
      threat_domain: { type: "string", enum: ["air", "ground", "maritime", "equipment", "personnel", "unknown"] },
      threat_category: { type: "string", pattern: "^[a-z][a-z0-9_]{1,63}$" },
      platform_family: { type: "string" },
      training_role: { type: "string" },
      visual_fidelity_goal: { type: "string" },
      source_asset_id: { type: ["string", "null"] },
      source_database_path: { type: ["string", "null"] },
      source_rationale: { type: ["string", "null"] },
      demo_priority: { type: "integer", minimum: 0, maximum: 10 },
      runtime_note: { type: "string" }
    },
    required: [
      "threat_id",
      "threat_domain",
      "threat_category",
      "platform_family",
      "training_role",
      "visual_fidelity_goal",
      "source_asset_id",
      "source_database_path",
      "source_rationale",
      "demo_priority",
      "runtime_note"
    ]
  };
  const modifierWeights = {
    type: "array",
    maxItems: 12,
    items: {
      type: "object",
      additionalProperties: false,
      properties: {
        tag: { type: "string" },
        weight: { type: "number" }
      },
      required: ["tag", "weight"]
    }
  };
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      contract_type: { type: "string", enum: ["generated_asset_database"] },
      schema_version: { type: "string", enum: ["1.0"] },
      session_summary: { type: "string" },
      input_evidence: textArray,
      asset_cards: {
        type: "array",
        maxItems: 16,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            contract_type: { type: "string", enum: ["asset_card"] },
            schema_version: { type: "string", enum: ["1.0"] },
            asset_id: { type: "string", pattern: "^[a-z][a-z0-9_]{2,63}$" },
            category: { type: "string", enum: ["threat_vector", "adversary_role", "static_prop", "equipment", "effect", "objective_marker", "training_marker"] },
            display_name: { type: "string" },
            description: { type: "string" },
            unreal_asset_path: { type: ["string", "null"] },
            spawn_policy: { type: "string", enum: ["never_spawn", "scenario_director_whitelist"] },
            gameplay_tags: textArray,
            capabilities: textArray,
            equipment: textArray,
            preferred_affordances: textArray,
            constraints: textArray,
            behavior_profiles: textArray,
            likelihood_modifiers: modifierWeights,
            collision_profile: { type: "string", enum: ["none", "block_all", "overlap_only", "pawn"] },
            bounds_m: {
              type: ["object", "null"],
              additionalProperties: false,
              properties: {
                x: { type: "number" },
                y: { type: "number" },
                z: { type: "number" }
              },
              required: ["x", "y", "z"]
            },
            ingestion_status: { type: "string", enum: ["ready", "prototype", "placeholder"] },
            threat_category: threatCategory,
            movement_domain: movementDomain,
            tactical_role: tacticalRole,
            visual_generation_prompt: { type: "string" },
            runtime_binding_hint: { type: "string" },
            spawn_affordances: textArray,
            behavior_profile_candidates: textArray,
            safety_note: safetyNote,
            threat_metadata: threatMetadata,
            source_rationale: { type: "string" }
          },
          required: [
            "contract_type",
            "schema_version",
            "asset_id",
            "category",
            "display_name",
            "description",
            "unreal_asset_path",
            "spawn_policy",
            "gameplay_tags",
            "capabilities",
            "equipment",
            "preferred_affordances",
            "constraints",
            "behavior_profiles",
            "likelihood_modifiers",
            "collision_profile",
            "bounds_m",
            "ingestion_status",
            "threat_category",
            "movement_domain",
            "tactical_role",
            "visual_generation_prompt",
            "runtime_binding_hint",
            "spawn_affordances",
            "behavior_profile_candidates",
            "safety_note",
            "threat_metadata",
            "source_rationale"
          ]
        }
      },
      trellis_candidates: {
        type: "array",
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            asset_id: { type: "string", pattern: "^[a-z][a-z0-9_]{2,63}$" },
            display_name: { type: "string" },
            threat_category: threatCategory,
            movement_domain: movementDomain,
            tactical_role: tacticalRole,
            visual_generation_prompt: { type: "string" },
            generation_prompt: { type: "string" },
            visual_descriptor: { type: "string" },
            geometry_descriptor: { type: "string" },
            material_descriptor: { type: "string" },
            texture_descriptor: { type: "string" },
            scale_descriptor: { type: "string" },
            scene_context: { type: "string" },
            detail_checklist: textArray,
            negative_prompt: { type: "string" },
            source_asset_id: { type: "string" },
            target_format: { type: "string", enum: ["glb"] },
            resolution: { type: "string", enum: ["512", "1024", "1536"] },
            texture_size: { type: "integer", enum: [1024, 2048, 4096] },
            runtime_binding_hint: { type: "string" },
            spawn_affordances: textArray,
            behavior_profile_candidates: textArray,
            safety_note: safetyNote,
            asset_category: { type: "string", enum: ["equipment", "threat_vector", "static_prop", "training_marker"] },
            equipment: textArray,
            threat_metadata: threatMetadata,
            allow_cached_demo_output: { type: "boolean" },
            cached_demo_key: { type: "string" },
            safety_notes: textArray
          },
          required: [
            "asset_id",
            "display_name",
            "threat_category",
            "movement_domain",
            "tactical_role",
            "visual_generation_prompt",
            "generation_prompt",
            "visual_descriptor",
            "geometry_descriptor",
            "material_descriptor",
            "texture_descriptor",
            "scale_descriptor",
            "scene_context",
            "detail_checklist",
            "negative_prompt",
            "source_asset_id",
            "target_format",
            "resolution",
            "texture_size",
            "runtime_binding_hint",
            "spawn_affordances",
            "behavior_profile_candidates",
            "safety_note",
            "asset_category",
            "equipment",
            "threat_metadata",
            "allow_cached_demo_output",
            "cached_demo_key",
            "safety_notes"
          ]
        }
      },
      behavior_profiles: textArray,
      scenario_seed_notes: textArray,
      cautions: textArray
    },
    required: [
      "contract_type",
      "schema_version",
      "session_summary",
      "input_evidence",
      "asset_cards",
      "trellis_candidates",
      "behavior_profiles",
      "scenario_seed_notes",
      "cautions"
    ]
  };
}

function buildAssetGenerationPrompt(manifest) {
  return [
    "You are AdaptSim's asset-database generator. Produce a strict JSON generated_asset_database for a training simulation authoring pipeline.",
    "The primary users are military training and analysis teams. Generate explicit, inspectable defensive-training assets centered on realistic threat vectors, not tourism scenery.",
    "Use the uploaded photos, video/file metadata, extracted coordinates, and analyst notes only as source cues. Generate training-relevant threat-vector assets, not live intelligence.",
    "Use manifest.militaryContext as the Step 02 source of truth for threat-vector themes. Prefer inert weapon/equipment cues, vehicles, drones, equipment cases, sensor shells, communications markers, and other equipment-oriented training assets over location-specific place cards.",
    "Do not create asset cards whose primary value is a country, city, port, airport, landmark, or base name. Geographic context may explain why the simulation needs a vector, but the asset itself should be a reusable threat vector, equipment cue, vehicle cue, or training prop.",
    "The output must be suitable for later validation against AdaptSim asset-card contracts and for offline Trellis/TRELLIS.2 static asset generation.",
    "Prefer asset_cards with category threat_vector. Use adversary_role for abstract OPFOR/persona metadata, equipment for inert representative equipment, effect for simulated non-damaging cues, and objective_marker/training_marker for evaluator controls. static_prop is allowed only when it is a reviewed physical training cue, not the primary database framing.",
    "Generate threat-vector assets for non-operational military training simulation. Do not frame the database as decorative props, generic barricades, crates, caution signs, objective placards, or set dressing.",
    "Asset coverage should include UAV/FPV drone/quadcopter assets, UGV or light vehicle assets, USV assets only where water or maritime context is relevant, inert weapon/equipment visual assets, sensor or payload visuals, and dismounted personnel metadata for the existing Unreal adversary runtime.",
    "Threat-vector assets should describe realistic defensive-training concerns such as surveillance cue, small UAS cue, vehicle checkpoint concern, concealment indicator, restricted-area probe, communications disruption marker, access-control concern, perimeter observation cue, and evacuation friction cue.",
    "Every asset_card must include threat_category, movement_domain, tactical_role, visual_generation_prompt, runtime_binding_hint, spawn_affordances, behavior_profile_candidates, safety_note exactly \"non-operational training simulation\", and threat_metadata.",
    "Each threat_vector must include observable indicators, training purpose, likely trainee decision point, and simulation-safe constraints in description, capabilities, preferred_affordances, constraints, gameplay_tags, and source_rationale.",
    "For the demo, ensure trellis_candidates include at least one air threat visual such as a small quadcopter or FPV drone and at least one ground vehicle/equipment visual such as a light UGV, rover, cart, sensor payload, or inert equipment case. If the source input is sparse, mark source_rationale as a generic demo fallback rather than implying real-world presence.",
    "Allowed movement_domain values are ground, air, water, and interior. Allowed tactical_role values are recon, harassment, ambush, patrol, breach, overwatch, and decoy.",
    "Use runtime_binding_hint to describe the intended Unreal binding surface at a high level, such as placeholder pawn, skeletal actor, static mesh visual, sensor payload mesh, Niagara-safe effect shell, or reviewed Blueprint path requirement.",
    "Use spawn_affordances for placement cues such as concealment, line_of_sight, rooftop, doorway, open_floor, vehicle_route, waterway, dock_edge, fallback_route, or objective_area. Use behavior_profile_candidates for compatible behavior names, not operational instructions.",
    "For every trellis_candidate, write descriptors detailed enough for high-quality 3D generation: silhouette, component breakdown, proportions, dimensions in meters, materials, surface texture, color palette, wear/weathering, seams, handles, fasteners, labels or markings if visible, and scene placement context.",
    "Each trellis_candidate.visual_generation_prompt and generation_prompt should describe a non-operational visual training asset in roughly 80-140 words. Include the threat-vector type, key geometry, scale, material stack, texture style, age/wear, and what should be emphasized from the source cue. Each trellis_candidate must include asset_category, equipment, threat_metadata, allow_cached_demo_output, and cached_demo_key.",
    "Use detail_checklist to enumerate the concrete geometry/texture details Trellis should preserve. Keep descriptors static and visual; do not include instructions for functionality, damage effects, targeting, real-world unit markings, weapon operation, sensor exploitation, or payload use.",
    "Do not generate live force disposition, target-specific vulnerabilities, ingress/egress attack guidance, standoff distances, timing guidance, weapon employment, construction details, evasion steps, real-world attack plans, operational readiness claims, or location-specific security gaps.",
    "For real landmarks, public venues, bases, or sensitive locations, keep threat vectors generic and training-focused. Do not identify exploitable weak points, optimal attack positions, or location-specific security gaps.",
    "session_summary must state that the database is a military training threat-vector asset database and must name the main training threat themes in non-operational language.",
    "Do not mark generated assets as scenario_director_whitelist unless a reviewed Unreal /Game path is already known. Use never_spawn and placeholder/prototype status for generated candidates.",
    "Do not include dismounted personnel as Trellis candidates for this demo. Soldiers should use existing Unreal adversary runtime unless a reviewed rigged asset is already available. Represent personnel only as asset-card metadata and runtime_binding_hint. For weapon/equipment visuals, depict inert exterior forms only, with no working mechanisms or assembly detail.",
    `Input manifest JSON:\n${JSON.stringify(manifest, null, 2)}`
  ].join("\n\n");
}

function buildOpenAiAssetInput(manifest, sourceFiles) {
  const content = [
    {
      type: "input_text",
      text: buildAssetGenerationPrompt(manifest)
    }
  ];

  sourceFiles
    .filter((source) => source.imageDataUrl)
    .slice(0, 4)
    .forEach((source) => {
      content.push({
        type: "input_image",
        image_url: source.imageDataUrl,
        detail: "low"
      });
    });

  return [{ role: "user", content }];
}

function threatDomainFromMovement(movementDomain, threatCategory) {
  const category = String(threatCategory || "");
  if (movementDomain === "air" || ["uav", "fpv_drone", "quadcopter"].includes(category)) return "air";
  if (movementDomain === "water" || category === "usv") return "maritime";
  if (["weapon_equipment", "sensor_payload"].includes(category)) return "equipment";
  if (category === "dismounted_personnel") return "personnel";
  if (movementDomain === "ground" || ["ugv", "vehicle"].includes(category)) return "ground";
  return "unknown";
}

function cachedDemoKeyForThreat(threatCategory, movementDomain) {
  const category = String(threatCategory || "");
  if (["uav", "fpv_drone", "quadcopter"].includes(category) || movementDomain === "air") return "fpv_quadcopter";
  if (["ugv", "vehicle"].includes(category) || movementDomain === "ground") return "light_ugv";
  if (["weapon_equipment", "sensor_payload"].includes(category)) return "equipment_visual";
  return "generic_static_prop";
}

function normalizeThreatMetadata(source, fallback = {}) {
  const metadata = source?.threat_metadata && typeof source.threat_metadata === "object" ? source.threat_metadata : {};
  const threatCategory = toSlug(metadata.threat_category || source?.threat_category || fallback.threat_category || "vehicle", "vehicle");
  const movementDomain = metadata.threat_domain
    || threatDomainFromMovement(source?.movement_domain || fallback.movement_domain, threatCategory);
  const threatId = toSlug(metadata.threat_id || source?.asset_id || fallback.asset_id || `threat_${threatCategory}`, "threat_vector");
  const sourceAssetId = metadata.source_asset_id || source?.source_asset_id || fallback.source_asset_id || source?.asset_id || null;
  return {
    threat_id: threatId,
    threat_domain: ["air", "ground", "maritime", "equipment", "personnel", "unknown"].includes(movementDomain)
      ? movementDomain
      : "unknown",
    threat_category: threatCategory,
    platform_family: clampApiText(metadata.platform_family || source?.display_name || fallback.display_name, 96, threatId),
    training_role: clampApiText(
      metadata.training_role || source?.tactical_role || fallback.tactical_role,
      180,
      "Visual recognition training cue; no operational behavior is encoded."
    ),
    visual_fidelity_goal: clampApiText(
      metadata.visual_fidelity_goal || source?.visual_descriptor || source?.visual_generation_prompt,
      240,
      "Recognizable silhouette and approximate scale for non-operational demo review."
    ),
    source_asset_id: sourceAssetId ? toSlug(sourceAssetId, "source_asset") : null,
    source_database_path: metadata.source_database_path || null,
    source_rationale: clampApiText(metadata.source_rationale || source?.source_rationale || fallback.source_rationale, 500, ""),
    demo_priority: Math.max(0, Math.min(10, Number(metadata.demo_priority ?? fallback.demo_priority ?? 5) || 0)),
    runtime_note: clampApiText(
      metadata.runtime_note || source?.runtime_binding_hint || fallback.runtime_binding_hint,
      240,
      "Visual prototype only; runtime behavior, collision, scale, and spawn whitelist require Unreal review."
    )
  };
}

function normalizeGeneratedAssetDatabase(database) {
  const fallback = {
    contract_type: "generated_asset_database",
    schema_version: "1.0",
    session_summary: "No generated database returned.",
    input_evidence: [],
    asset_cards: [],
    trellis_candidates: [],
    behavior_profiles: [],
    scenario_seed_notes: [],
    cautions: ["Generation did not return a usable asset database."]
  };
  const merged = { ...fallback, ...(database && typeof database === "object" ? database : {}) };
  merged.asset_cards = Array.isArray(merged.asset_cards)
    ? merged.asset_cards.map((card) => {
        if (!card || typeof card !== "object") return card;
        let nextCard = card;
        if (Array.isArray(card.likelihood_modifiers)) {
          nextCard = {
            ...card,
            likelihood_modifiers: Object.fromEntries(
              card.likelihood_modifiers
                .filter((entry) => entry && typeof entry === "object" && typeof entry.tag === "string")
                .map((entry) => [entry.tag, Number(entry.weight) || 0])
            )
          };
        } else if (!card.likelihood_modifiers || typeof card.likelihood_modifiers !== "object") {
          nextCard = { ...card, likelihood_modifiers: {} };
        }
        return {
          ...nextCard,
          threat_metadata: normalizeThreatMetadata(nextCard)
        };
      })
    : [];
  merged.trellis_candidates = Array.isArray(merged.trellis_candidates)
    ? merged.trellis_candidates.map((candidate) => {
        if (!candidate || typeof candidate !== "object") return candidate;
        const detailChecklist = Array.isArray(candidate.detail_checklist)
          ? candidate.detail_checklist.map((item) => clampApiText(item, 160)).filter(Boolean).slice(0, 24)
          : [];
        const threatMetadata = normalizeThreatMetadata(candidate);
        return {
          ...candidate,
          visual_generation_prompt: clampApiText(candidate.visual_generation_prompt, 1600, candidate.generation_prompt || ""),
          generation_prompt: clampApiText(candidate.generation_prompt, 1600),
          visual_descriptor: clampApiText(candidate.visual_descriptor, 800),
          geometry_descriptor: clampApiText(candidate.geometry_descriptor, 800),
          material_descriptor: clampApiText(candidate.material_descriptor, 800),
          texture_descriptor: clampApiText(candidate.texture_descriptor, 800),
          scale_descriptor: clampApiText(candidate.scale_descriptor, 500),
          scene_context: clampApiText(candidate.scene_context, 500),
          detail_checklist: detailChecklist,
          negative_prompt: clampApiText(candidate.negative_prompt, 800),
          asset_category: candidate.asset_category || "threat_vector",
          equipment: Array.isArray(candidate.equipment)
            ? candidate.equipment.map((item) => toSlug(item, "equipment")).filter(Boolean).slice(0, 24)
            : [],
          threat_metadata: threatMetadata,
          allow_cached_demo_output: candidate.allow_cached_demo_output !== false,
          cached_demo_key: clampApiText(
            candidate.cached_demo_key,
            80,
            cachedDemoKeyForThreat(candidate.threat_category, candidate.movement_domain)
          )
        };
      })
    : [];
  merged.input_evidence = Array.isArray(merged.input_evidence) ? merged.input_evidence : [];
  merged.behavior_profiles = Array.isArray(merged.behavior_profiles) ? merged.behavior_profiles : [];
  merged.scenario_seed_notes = Array.isArray(merged.scenario_seed_notes) ? merged.scenario_seed_notes : [];
  merged.cautions = Array.isArray(merged.cautions) ? merged.cautions : [];
  return merged;
}

async function callOpenAiAssetGenerator(manifest, sourceFiles) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new HttpError(503, "OPENAI_API_KEY is not configured; generated asset database is queued but cannot run.");
  }

  const upstream = await fetchWithCustomTimeout(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: openAiAssetModel,
        store: false,
        reasoning: {
          effort: process.env.OPENAI_ASSET_REASONING_EFFORT || "low"
        },
        text: {
          format: {
            type: "json_schema",
            name: "adaptsim_generated_asset_database",
            strict: true,
            schema: assetDatabaseResponseSchema()
          }
        },
        input: buildOpenAiAssetInput(manifest, sourceFiles)
      })
    },
    assetGenerationTimeoutMs,
    "OpenAI asset database generation timed out."
  );

  const payload = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    throw new HttpError(upstream.status, payload?.error?.message || `OpenAI asset generation returned ${upstream.status}.`);
  }

  const outputText = extractOutputText(payload);
  const parsed = parseVisionJson(outputText);
  if (!parsed) {
    throw new HttpError(502, "OpenAI asset generation did not return parseable JSON.");
  }
  return normalizeGeneratedAssetDatabase(parsed);
}

function buildDetailedTrellisPrompt(candidate) {
  const detailChecklist = Array.isArray(candidate.detail_checklist) ? candidate.detail_checklist.filter(Boolean) : [];
  return [
    candidate.visual_generation_prompt || candidate.generation_prompt,
    candidate.visual_descriptor ? `Visual descriptor: ${candidate.visual_descriptor}` : "",
    candidate.geometry_descriptor ? `Geometry and proportions: ${candidate.geometry_descriptor}` : "",
    candidate.material_descriptor ? `Materials: ${candidate.material_descriptor}` : "",
    candidate.texture_descriptor ? `Texture, color, and wear: ${candidate.texture_descriptor}` : "",
    candidate.scale_descriptor ? `Scale: ${candidate.scale_descriptor}` : "",
    candidate.scene_context ? `Scene context: ${candidate.scene_context}` : "",
    candidate.threat_category ? `Threat category: ${candidate.threat_category}.` : "",
    candidate.movement_domain ? `Movement domain: ${candidate.movement_domain}.` : "",
    candidate.tactical_role ? `Tactical role for training metadata: ${candidate.tactical_role}.` : "",
    candidate.runtime_binding_hint ? `Runtime binding hint: ${candidate.runtime_binding_hint}.` : "",
    detailChecklist.length ? `Required preserved details: ${detailChecklist.join("; ")}.` : "",
    "Generate a static, watertight, simulation-ready GLB visual asset with clear silhouette, believable bevels, usable UVs, and no animated, operational, targeting, or functional behavior."
  ].filter(Boolean).join("\n");
}

function buildDetailedTrellisNegativePrompt(candidate) {
  return [
    candidate.negative_prompt,
    "identifiable faces, photoreal real persons, readable real-world insignia, national or organizational markings, functional weapon mechanisms, firing internals, targeting aids, live maps, operational labels, assembly instructions, excessive text, low-detail geometry, melted surfaces, floating parts, distorted proportions, unsafe sharp artifacts, glossy plastic look unless specified"
  ].filter(Boolean).join(", ");
}

function buildTrellisRelayPayload(record) {
  const database = record.asset_database || {};
  const candidates = Array.isArray(database.trellis_candidates) ? database.trellis_candidates : [];
  const sourceCards = new Map(
    (Array.isArray(database.asset_cards) ? database.asset_cards : [])
      .filter((card) => card && typeof card === "object" && typeof card.asset_id === "string")
      .map((card) => [card.asset_id, card])
  );
  const sessionId = toSlug(record.session_id, "asset_session");
  const captureId = toSlug(record.capture_id || record.session_id, "asset_session");
  const requestId = toSlug(`trellis_${sessionId}`, "trellis_request");
  const gcsRoot = `gs://${gcsBucket}/${gcsCapturePrefix}`;
  return {
    contract_type: "trellis_asset_generation_request",
    schema_version: "1.0",
    request_id: requestId,
    capture_id: captureId,
    session_id: sessionId,
    requested_at: new Date().toISOString(),
    requester_id: "local_control_api",
    input_fingerprint: record.input_fingerprint,
    source_database_path: path.join(record.storage_path, "asset_database.json"),
    gcs_root: gcsRoot,
    model: "microsoft/TRELLIS.2-4B",
    batch_output_prefix: `${gcsRoot}/captures/${captureId}/asset-generation/${requestId}/`,
    model_capabilities: {
      modality: "image_to_3d_or_text_conditioned_static_asset",
      target_formats: ["glb"],
      preferred_gpu: "A100",
      notes: [
        "TRELLIS.2-4B should run on the VM or worker, not in the browser.",
        "Generated outputs require Unreal ingestion review before scenario spawning.",
        "Demo requests allow cached GLB fallbacks when Trellis is unavailable or too slow."
      ]
    },
    assets: candidates.map((candidate, index) => {
      const assetId = toSlug(candidate.asset_id || `trellis_asset_${index + 1}`, "trellis_asset");
      const sourceCard = sourceCards.get(candidate.source_asset_id) || sourceCards.get(candidate.asset_id) || {};
      const threatMetadata = normalizeThreatMetadata(candidate, sourceCard);
      const cachedDemoKey = cachedDemoKeyForThreat(
        sourceCard.threat_category || candidate.threat_category,
        sourceCard.movement_domain || candidate.movement_domain
      );
      return {
        asset_id: assetId,
        request_id: toSlug(`${requestId}_${index + 1}_${assetId}`, "asset_request"),
        display_name: clampApiText(candidate.display_name, 96, sourceCard.display_name || "Generated Trellis Asset"),
        source_asset_id: candidate.source_asset_id || sourceCard.asset_id || "",
        asset_kind: "threat_vector_visual",
        prop_kind: toSlug(sourceCard.threat_category || candidate.threat_category || sourceCard.asset_id || candidate.source_asset_id || assetId, "threat_vector"),
        asset_label: assetId,
        prompt: buildDetailedTrellisPrompt(candidate),
        visual_generation_prompt: candidate.visual_generation_prompt || candidate.generation_prompt || "",
        threat_category: sourceCard.threat_category || candidate.threat_category || "",
        movement_domain: sourceCard.movement_domain || candidate.movement_domain || "",
        tactical_role: sourceCard.tactical_role || candidate.tactical_role || "",
        asset_category: candidate.asset_category || sourceCard.category || "threat_vector",
        visual_descriptor: candidate.visual_descriptor,
        geometry_descriptor: candidate.geometry_descriptor,
        material_descriptor: candidate.material_descriptor,
        texture_descriptor: candidate.texture_descriptor,
        scale_descriptor: candidate.scale_descriptor,
        scene_context: candidate.scene_context,
        detail_checklist: candidate.detail_checklist || [],
        runtime_binding_hint: sourceCard.runtime_binding_hint || candidate.runtime_binding_hint || "",
        spawn_affordances: Array.isArray(sourceCard.spawn_affordances) ? sourceCard.spawn_affordances : candidate.spawn_affordances || [],
        behavior_profile_candidates: Array.isArray(sourceCard.behavior_profile_candidates)
          ? sourceCard.behavior_profile_candidates
          : candidate.behavior_profile_candidates || [],
        negative_prompt: buildDetailedTrellisNegativePrompt(candidate),
        target_format: candidate.target_format || "glb",
        resolution: candidate.resolution || "1024",
        texture_size: candidate.texture_size || 4096,
        output_prefix: `${gcsRoot}/captures/${captureId}/asset-generation/${requestId}/assets/${assetId}/`,
        bounds_m: sourceCard.bounds_m || null,
        equipment: Array.isArray(candidate.equipment)
          ? candidate.equipment
          : Array.isArray(sourceCard.equipment)
            ? sourceCard.equipment
            : [],
        gameplay_tags: Array.isArray(sourceCard.gameplay_tags)
          ? sourceCard.gameplay_tags
          : ["threat_vector", candidate.threat_category, candidate.movement_domain, candidate.tactical_role].filter(Boolean),
        capabilities: Array.isArray(sourceCard.capabilities) ? sourceCard.capabilities : [],
        preferred_affordances: Array.isArray(sourceCard.spawn_affordances)
          ? sourceCard.spawn_affordances
          : Array.isArray(sourceCard.preferred_affordances)
            ? sourceCard.preferred_affordances
            : candidate.spawn_affordances || [],
        constraints: Array.isArray(sourceCard.constraints)
          ? Array.from(new Set([...sourceCard.constraints, "requires_scale_review", "requires_pivot_review", "requires_collision"]))
          : ["requires_collision", "requires_scale_review", "requires_pivot_review"],
        collision_profile: sourceCard.collision_profile || "block_all",
        ingestion_status: "prototype",
        spawn_policy: "never_spawn",
        safety_note: sourceCard.safety_note || candidate.safety_note || "non-operational training simulation",
        threat_metadata: {
          ...threatMetadata,
          source_database_path: path.join(record.storage_path, "asset_database.json")
        },
        allow_cached_demo_output: candidate.allow_cached_demo_output !== false,
        cached_demo_key: candidate.cached_demo_key || cachedDemoKey,
        safety_notes: [
          sourceCard.safety_note || candidate.safety_note || "non-operational training simulation",
          ...(candidate.safety_notes || [])
        ]
      };
    })
  };
}

async function queueTrellisRelay(record) {
  const payload = buildTrellisRelayPayload(record);
  const requestPath = path.join(record.storage_path, "trellis_request.json");
  writeJsonAtomic(requestPath, payload);

  let nextRecord = saveGeneratedSession({
    ...record,
    trellis: {
      ...record.trellis,
      status: payload.assets.length ? "queued" : "skipped",
      endpoint_configured: Boolean(trellisVmEndpoint),
      job_id: payload.assets.length ? payload.request_id : "",
      request_path: requestPath,
      error: payload.assets.length ? "" : "No Trellis-suitable static asset candidates were generated."
    }
  });

  if (!payload.assets.length || !trellisVmEndpoint) {
    nextRecord = saveGeneratedSession({
      ...nextRecord,
      trellis: {
        ...nextRecord.trellis,
        status: payload.assets.length ? "awaiting_vm_endpoint" : "skipped",
        error: payload.assets.length ? "TRELLIS_VM_ENDPOINT is not configured; request is stored locally for VM relay." : nextRecord.trellis.error
      }
    });
    return nextRecord;
  }

  try {
    const upstream = await fetchWithCustomTimeout(
      `${trellisVmEndpoint}/generate-assets`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(trellisVmApiKey ? { Authorization: `Bearer ${trellisVmApiKey}` } : {})
        },
        body: JSON.stringify(payload)
      },
      Number(process.env.TRELLIS_VM_TIMEOUT_MS || 20000),
      "Trellis VM relay timed out."
    );
    const responsePayload = await upstream.json().catch(() => ({}));
    nextRecord = saveGeneratedSession({
      ...nextRecord,
      trellis: {
        ...nextRecord.trellis,
        status: upstream.ok ? "submitted" : "failed",
        response: responsePayload,
        error: upstream.ok ? "" : responsePayload?.error || `Trellis VM returned ${upstream.status}.`
      }
    });
  } catch (error) {
    nextRecord = saveGeneratedSession({
      ...nextRecord,
      trellis: {
        ...nextRecord.trellis,
        status: "failed",
        error: error.message || "Trellis VM relay failed."
      }
    });
  }

  return nextRecord;
}

async function runGeneratedAssetSession(sessionId, manifest, sourceFiles) {
  let record = readGeneratedSession(sessionId);
  if (!record) return;

  record = saveGeneratedSession({
    ...record,
    generation: {
      ...record.generation,
      status: "running",
      started_at: new Date().toISOString(),
      error: ""
    }
  });

  try {
    const database = await callOpenAiAssetGenerator(manifest, sourceFiles);
    writeJsonAtomic(path.join(record.storage_path, "asset_database.json"), database);
    record = saveGeneratedSession({
      ...record,
      status: "asset_database_ready",
      asset_database: database,
      generation: {
        ...record.generation,
        status: "complete",
        completed_at: new Date().toISOString(),
        error: ""
      }
    });
    await queueTrellisRelay(record);
  } catch (error) {
    saveGeneratedSession({
      ...record,
      status: "asset_database_failed",
      generation: {
        ...record.generation,
        status: "failed",
        completed_at: new Date().toISOString(),
        error: error.message || "Generated asset database failed."
      }
    });
  } finally {
    assetSessionJobs.delete(sessionId);
  }
}

function startGeneratedAssetSessionJob(sessionId, manifest, sourceFiles) {
  if (assetSessionJobs.has(sessionId)) return;
  const job = runGeneratedAssetSession(sessionId, manifest, sourceFiles).catch((error) => {
    const record = readGeneratedSession(sessionId);
    if (record) {
      saveGeneratedSession({
        ...record,
        status: "asset_database_failed",
        generation: {
          ...record.generation,
          status: "failed",
          completed_at: new Date().toISOString(),
          error: error.message || "Generated asset database failed."
        }
      });
    }
    assetSessionJobs.delete(sessionId);
  });
  assetSessionJobs.set(sessionId, job);
}

async function handleCreateGeneratedAssetSession(request, response) {
  if (!String(request.headers["content-type"] || "").includes("application/json")) {
    sendJson(request, response, 415, { error: "Content-Type must be application/json." });
    return;
  }

  const body = await readJsonBody(request, maxAssetSessionBodyBytes);
  const { record, sourceFiles, manifest } = createGeneratedSessionRecord(body);
  startGeneratedAssetSessionJob(record.session_id, manifest, sourceFiles);
  sendJson(request, response, 202, {
    session_id: record.session_id,
    status: record.status,
    status_url: record.status_url,
    storage_path: record.storage_path,
    generation: record.generation,
    trellis: record.trellis
  });
}

async function handleGeneratedAssetSession(request, response, sessionId) {
  const record = readGeneratedSession(sessionId);
  if (!record) {
    sendJson(request, response, 404, { error: "Generated asset session was not found." });
    return;
  }
  sendJson(request, response, 200, record);
}

async function handleListGeneratedAssetSessions(request, response) {
  sendJson(request, response, 200, { sessions: listGeneratedSessions() });
}

async function handleRelayTrellisSession(request, response, sessionId) {
  const record = readGeneratedSession(sessionId);
  if (!record) {
    sendJson(request, response, 404, { error: "Generated asset session was not found." });
    return;
  }
  if (!record.asset_database) {
    sendJson(request, response, 409, { error: "Asset database is not ready for Trellis relay." });
    return;
  }
  const nextRecord = await queueTrellisRelay(record);
  sendJson(request, response, trellisVmEndpoint ? 202 : 200, nextRecord.trellis);
}

function imageBufferFromDataUrl(imageDataUrl) {
  const match = String(imageDataUrl || "").match(/^data:(image\/(?:png|jpe?g|webp|gif));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) throw new HttpError(400, "Image data URL is invalid.");
  return {
    mimeType: match[1].toLowerCase(),
    buffer: Buffer.from(match[2], "base64")
  };
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        timeout: options.timeout || 3500,
        maxBuffer: options.maxBuffer || 128 * 1024
      },
      (error, stdout = "", stderr = "") => {
        if (error?.code === "ENOENT") {
          resolve({ command, available: false, ok: false, exitCode: "ENOENT", stdout: "", stderr: "not installed" });
          return;
        }
        resolve({
          command,
          available: true,
          ok: !error,
          exitCode: error?.code || 0,
          stdout: String(stdout).slice(0, options.textLimit || 12000),
          stderr: String(stderr || error?.message || "").slice(0, 1000)
        });
      }
    );
  });
}

function requireJsonRequest(request) {
  if (!String(request.headers["content-type"] || "").includes("application/json")) {
    throw new HttpError(415, "Content-Type must be application/json.");
  }
}

function nowIso() {
  return new Date().toISOString();
}

function parseDurationMs(value) {
  const match = String(value || "").trim().match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)?$/i);
  if (!match) return 60 * 60 * 1000;
  const amount = Number(match[1]);
  const unit = (match[2] || "s").toLowerCase();
  const multipliers = { ms: 1, s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
  return amount * (multipliers[unit] || 1000);
}

function expiresAtFromDuration(duration) {
  return new Date(Date.now() + parseDurationMs(duration)).toISOString();
}

function validateIdentifier(value, label = "identifier") {
  const text = String(value || "").trim();
  if (!/^[a-z][a-z0-9_]{2,63}$/.test(text)) {
    throw new HttpError(400, `${label} must match ^[a-z][a-z0-9_]{2,63}$.`);
  }
  return text;
}

function validateTag(value, label = "tag") {
  const text = String(value || "").trim();
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(text)) {
    throw new HttpError(400, `${label} must match ^[a-z][a-z0-9_]{1,63}$.`);
  }
  return text;
}

function captureIdFromDisplayName(displayName) {
  let slug = String(displayName || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");
  if (!slug || !/^[a-z]/.test(slug)) slug = `capture_${slug || "scan"}`;
  if (slug.length < 3) slug = `${slug}_scan`;
  return slug.slice(0, 64).replace(/_+$/g, "") || "capture_scan";
}

function sanitizeFilename(filename) {
  const text = String(filename || "").trim();
  if (!/^[A-Za-z0-9_. -]{1,160}$/.test(text) || text === "." || text === "..") {
    throw new HttpError(400, "Each filename must be 1-160 characters and contain only letters, numbers, spaces, dots, underscores, or hyphens.");
  }
  return text;
}

function validateContentType(contentType) {
  const text = String(contentType || "").toLowerCase().trim();
  if (!["image/jpeg", "image/png", "image/heic", "image/heif"].includes(text)) {
    throw new HttpError(400, "Supported capture image content types are image/jpeg, image/png, image/heic, and image/heif.");
  }
  return text;
}

function validatePositiveInt(value, label, { min = 1, max = 5000 } = {}) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new HttpError(400, `${label} must be an integer between ${min} and ${max}.`);
  }
  return number;
}

function validateScaleHint(value) {
  const hint = value && typeof value === "object" ? value : { type: "unknown" };
  const type = String(hint.type || "unknown").trim();
  if (!["known_distance", "calibration_marker", "unknown"].includes(type)) {
    throw new HttpError(400, "scale_hint.type must be known_distance, calibration_marker, or unknown.");
  }

  const distance = hint.distance_m == null ? null : Number(hint.distance_m);
  if (type !== "unknown" && (!Number.isFinite(distance) || distance <= 0)) {
    throw new HttpError(400, `${type} scale_hint requires a positive distance_m.`);
  }
  if (type === "unknown" && distance != null) {
    throw new HttpError(400, "unknown scale_hint must not include distance_m.");
  }

  return {
    type,
    label: hint.label == null ? null : String(hint.label).slice(0, 96),
    distance_m: distance,
    confidence: ["operator_provided", "estimated", "unknown"].includes(hint.confidence)
      ? hint.confidence
      : type === "unknown" ? "unknown" : "operator_provided"
  };
}

function gcsRootUri() {
  return `gs://${gcsBucket}/${gcsCapturePrefix}`;
}

function captureGcsPrefix(captureId) {
  return `${gcsRootUri()}/captures/${captureId}/`;
}

function captureObjectUri(captureId, relativePath) {
  return `${captureGcsPrefix(captureId)}${String(relativePath || "").replace(/^\/+/, "")}`;
}

function readFixtureJson(...parts) {
  return JSON.parse(fs.readFileSync(path.join(contractsExamplesDir, ...parts), "utf8"));
}

function readFixtureText(...parts) {
  return fs.readFileSync(path.join(contractsExamplesDir, ...parts), "utf8");
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function writeTempJson(payload) {
  return fs.promises.mkdtemp(path.join(os.tmpdir(), "adaptsim-gcs-")).then(async (tempDir) => {
    const filePath = path.join(tempDir, "payload.json");
    await fs.promises.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    return { tempDir, filePath };
  });
}

async function writeJsonToGcs(gcsUri, payload) {
  const { tempDir, filePath } = await writeTempJson(payload);
  try {
    const result = await runCommand("gcloud", ["storage", "cp", filePath, gcsUri], {
      timeout: 30000,
      maxBuffer: 1024 * 1024,
      textLimit: 20000
    });
    if (!result.available) {
      throw new HttpError(503, "gcloud CLI is required for GCS-backed AdaptSim state.");
    }
    if (!result.ok) {
      throw new HttpError(502, `Could not write ${gcsUri}: ${result.stderr || result.stdout || "gcloud storage cp failed"}`);
    }
  } finally {
    fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function readJsonFromGcs(gcsUri, { optional = false } = {}) {
  const result = await runCommand("gcloud", ["storage", "cat", gcsUri], {
    timeout: 30000,
    maxBuffer: 4 * 1024 * 1024,
    textLimit: 4 * 1024 * 1024
  });
  if (!result.available) {
    throw new HttpError(503, "gcloud CLI is required for GCS-backed AdaptSim state.");
  }
  if (!result.ok) {
    if (optional && /No URLs matched|NotFound|No such object|404/i.test(`${result.stderr}\n${result.stdout}`)) return null;
    throw new HttpError(502, `Could not read ${gcsUri}: ${result.stderr || result.stdout || "gcloud storage cat failed"}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new HttpError(502, `${gcsUri} did not contain valid JSON.`);
  }
}

function extractSignedUrl(stdout) {
  const text = String(stdout || "").trim();
  try {
    const parsed = JSON.parse(text);
    const first = Array.isArray(parsed) ? parsed[0] : parsed;
    const url = first?.signed_url || first?.signedUrl || first?.url || first?.URL;
    if (url) return String(url);
  } catch {}

  const match = text.match(/https:\/\/storage\.googleapis\.com\/\S+/);
  if (match) return match[0];
  return "";
}

async function signGcsUrl(gcsUri, { method = "GET", contentType = null, duration = gcsSignedUrlDuration } = {}) {
  const args = [
    "storage",
    "sign-url",
    gcsUri,
    `--http-verb=${method}`,
    `--duration=${duration}`,
    `--region=${gcsSigningRegion}`,
    `--impersonate-service-account=${gcsSigningServiceAccount}`,
    "--format=json"
  ];
  if (contentType) args.splice(4, 0, `--headers=content-type=${contentType}`);

  const result = await runCommand("gcloud", args, {
    timeout: 30000,
    maxBuffer: 1024 * 1024,
    textLimit: 200000
  });
  if (!result.available) {
    throw new HttpError(503, "gcloud CLI is required for signed GCS URLs.");
  }
  if (!result.ok) {
    throw new HttpError(502, `Could not sign ${gcsUri}: ${result.stderr || result.stdout || "gcloud storage sign-url failed"}`);
  }
  const signedUrl = extractSignedUrl(result.stdout);
  if (!signedUrl) {
    throw new HttpError(502, "gcloud storage sign-url returned no signed URL.");
  }
  return signedUrl;
}

const capturePhaseMessages = {
  created: "Capture created. Request upload URLs when images are selected.",
  uploading: "Signed upload URLs issued. Browser uploads should go directly to GCS.",
  uploaded: "Upload marked complete.",
  queued_reconstruction: "Capture queued for A100 reconstruction.",
  validating_images: "Validating uploaded images.",
  sfm_solving: "Solving camera poses with SfM.",
  reconstructing_splat: "Running splat reconstruction.",
  exporting_splat: "Exporting splat artifacts.",
  extracting_mesh: "Running mesh extraction.",
  postprocessing_mesh: "Postprocessing mesh for Unreal import.",
  ready_for_unreal_import: "Reconstruction artifacts are ready for Unreal import.",
  importing_unreal: "Importing reconstructed scene into Unreal.",
  imported_unreal: "Unreal import complete.",
  ready: "Scene is ready for launch.",
  failed: "Capture processing failed.",
  sfm_failed: "SfM failed."
};

const captureDefaultPercents = {
  created: 0,
  uploading: 5,
  uploaded: 10,
  queued_reconstruction: 15,
  validating_images: 25,
  sfm_solving: 40,
  reconstructing_splat: 52,
  exporting_splat: 58,
  extracting_mesh: 68,
  postprocessing_mesh: 78,
  ready_for_unreal_import: 86,
  importing_unreal: 92,
  imported_unreal: 98,
  ready: 100,
  failed: 100,
  sfm_failed: 100
};

function buildCaptureStatus(metadata, status, { message, percent, sfm = null, artifacts = null, unreal = null, error = null } = {}) {
  return {
    contract_type: "capture_status",
    schema_version: schemaVersion,
    capture_id: metadata.capture_id,
    display_name: metadata.display_name,
    status,
    updated_at: nowIso(),
    gcs_prefix: metadata.gcs_prefix,
    progress: {
      phase: status,
      message: message || capturePhaseMessages[status] || "Capture status updated.",
      percent: percent == null ? captureDefaultPercents[status] || 0 : percent
    },
    sfm: sfm || {
      input_images: Number(metadata.uploaded_image_count || 0),
      registered_images: null
    },
    artifacts: artifacts || {
      raw_metadata_uri: captureObjectUri(metadata.capture_id, "raw/metadata.json"),
      sfm_report_uri: null,
      splat_ply_uri: null,
      splat_usdz_url: null,
      mesh_preview_url: null,
      unreal_mesh_url: null,
      reconstruction_manifest_uri: null,
      unreal_import_report_uri: null,
      semantic_environment_uri: null
    },
    unreal: unreal || {
      status: "not_started",
      level_path: null,
      import_report_uri: null
    },
    error
  };
}

function captureStatusWithPhase(status, phase, { message, percent, unreal = {}, artifacts = {}, error = null } = {}) {
  const next = cloneJson(status);
  next.status = phase;
  next.updated_at = nowIso();
  next.progress = {
    ...(next.progress || {}),
    phase,
    message: message || capturePhaseMessages[phase] || "Capture status updated.",
    percent: percent == null ? captureDefaultPercents[phase] || 0 : percent
  };
  next.artifacts = {
    ...(next.artifacts || {}),
    ...artifacts
  };
  next.unreal = {
    ...(next.unreal || {}),
    ...unreal
  };
  next.error = error;
  return next;
}

function captureHasReadyUnrealImport(status) {
  const artifacts = status?.artifacts || {};
  return status?.status === "ready"
    && status?.unreal?.status === "ready"
    && Boolean(status?.unreal?.level_path)
    && Boolean(status?.unreal?.import_report_uri || artifacts.unreal_import_report_uri)
    && Boolean(artifacts.semantic_environment_uri);
}

function validateCaptureCreateBody(body) {
  const displayName = String(body.display_name || "").trim();
  if (!displayName || displayName.length > 120) {
    throw new HttpError(400, "display_name is required and must be at most 120 characters.");
  }
  const captureId = body.capture_id
    ? validateIdentifier(body.capture_id, "capture_id")
    : validateIdentifier(captureIdFromDisplayName(displayName), "generated capture_id");
  return {
    capture_id: captureId,
    display_name: displayName,
    operator_id: validateIdentifier(body.operator_id || "hackathon_demo", "operator_id"),
    environment_type: validateTag(body.environment_type || "indoor_hallway", "environment_type"),
    expected_image_count: validatePositiveInt(body.expected_image_count || 1, "expected_image_count"),
    scale_hint: validateScaleHint(body.scale_hint),
    notes: body.notes == null ? null : String(body.notes).slice(0, 1000)
  };
}

function buildCaptureMetadata(input) {
  return {
    contract_type: "capture_metadata",
    schema_version: schemaVersion,
    capture_id: input.capture_id,
    display_name: input.display_name,
    operator_id: input.operator_id,
    created_at: nowIso(),
    environment_type: input.environment_type,
    expected_image_count: input.expected_image_count,
    uploaded_image_count: 0,
    scale_hint: input.scale_hint,
    notes: input.notes,
    gcs_bucket: gcsBucket,
    gcs_capture_prefix: gcsCapturePrefix,
    gcs_prefix: captureGcsPrefix(input.capture_id),
    signing_service_account: gcsSigningServiceAccount,
    signing_region: gcsSigningRegion,
    images: []
  };
}

function validateUploadUrlBody(body) {
  if (!Array.isArray(body.files) || !body.files.length || body.files.length > 5000) {
    throw new HttpError(400, "files must contain between 1 and 5000 upload entries.");
  }
  const seen = new Set();
  return body.files.map((file) => {
    const filename = sanitizeFilename(file.filename);
    const key = filename.toLowerCase();
    if (seen.has(key)) throw new HttpError(400, `Duplicate upload filename: ${filename}.`);
    seen.add(key);
    return {
      filename,
      content_type: validateContentType(file.content_type || file.contentType),
      size_bytes: validatePositiveInt(file.size_bytes, `size_bytes for ${filename}`, { min: 1, max: 50 * 1024 * 1024 * 1024 })
    };
  });
}

function buildCaptureArtifacts(captureId) {
  const prefix = captureGcsPrefix(captureId);
  const definitions = [
    ["raw_metadata", "application/json", "raw/metadata.json"],
    ["sfm_report", "application/json", "sfm/colmap/report.json"],
    ["splat_ply", "application/octet-stream", "reconstruction/splat.ply"],
    ["splat_usdz", "model/vnd.usdz+zip", "reconstruction/splat.usdz"],
    ["mesh_dlnr_ply", "application/octet-stream", "reconstruction/mesh_dlnr.ply"],
    ["reconstruction_report", "application/json", "reconstruction/report.json"],
    ["unreal_mesh_glb", "model/gltf-binary", "unreal-import/scene_mesh.glb"],
    ["unreal_mesh_decimated_glb", "model/gltf-binary", "unreal-import/scene_mesh_decimated.glb"],
    ["collision_proxy_obj", "text/plain", "unreal-import/collision_proxy.obj"],
    ["reconstruction_manifest", "application/json", "unreal-import/reconstruction_manifest.json"],
    ["unreal_import_report", "application/json", "unreal/import_report.json"],
    ["semantic_environment", "application/json", "unreal/semantic_environment.json"]
  ];
  return definitions.map(([artifactType, contentType, relativePath]) => {
    const gcsUri = `${prefix}${relativePath}`;
    return {
      artifact_type: artifactType,
      content_type: contentType,
      gcs_uri: gcsUri,
      url: `/api/v1/captures/${captureId}/artifacts/${artifactType}`
    };
  });
}

function artifactDefinitionForType(captureId, artifactType) {
  return buildCaptureArtifacts(captureId).find((artifact) => artifact.artifact_type === artifactType) || null;
}

function buildRemoteCommand(template, fallback, variables = {}) {
  let command = String(template || fallback);
  Object.entries(variables).forEach(([key, value]) => {
    command = command.replaceAll(`{${key}}`, String(value));
  });
  return command;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function remoteEnvAssignment(name, value) {
  if (value == null || value === "") return "";
  return `${name}=${shellQuote(value)}`;
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim() || "";
}

function launchPathFromBody(body, ...keys) {
  if (!body || typeof body !== "object") return "";
  for (const key of keys) {
    const value = key.split(".").reduce((current, part) => (
      current && typeof current === "object" ? current[part] : undefined
    ), body);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function normalizeVmLaunchPath(value, fieldName) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length > 1000 || text.includes("\0")) {
    throw new HttpError(400, `${fieldName} is not a valid VM path.`);
  }
  if (!text.startsWith("/") && !text.startsWith("~/")) {
    throw new HttpError(400, `${fieldName} must be an absolute VM path.`);
  }
  return text;
}

function localCapturePath(captureId, ...parts) {
  return path.posix.join(l4CaptureDataRoot, captureId, ...parts);
}

function localCapturePathFromGcsUri(gcsUri, captureId) {
  const text = String(gcsUri || "").trim();
  const prefix = captureGcsPrefix(captureId);
  if (!text.startsWith(prefix)) return "";
  const relativePath = text.slice(prefix.length).replace(/^\/+/, "");
  if (!relativePath) return "";
  return localCapturePath(captureId, relativePath);
}

function normalizeSelectedManifestPath(value, captureId) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.startsWith("gs://")) {
    const localPath = localCapturePathFromGcsUri(text, captureId);
    if (!localPath) {
      throw new HttpError(400, "scenario_manifest_path GCS URI must be under the selected capture prefix.");
    }
    return localPath;
  }
  return normalizeVmLaunchPath(text, "scenario_manifest_path");
}

function selectedScenarioManifestPathFromBody(body, captureId) {
  return normalizeSelectedManifestPath(
    firstString(
      launchPathFromBody(body, "scenario_manifest_path"),
      launchPathFromBody(body, "scenarioManifestPath"),
      launchPathFromBody(body, "selected_manifest_path"),
      launchPathFromBody(body, "selectedManifestPath"),
      launchPathFromBody(body, "manifest_path"),
      launchPathFromBody(body, "manifestPath"),
      launchPathFromBody(body, "scenario_manifest.path"),
      launchPathFromBody(body, "scenario_manifest.local_path"),
      launchPathFromBody(body, "selected_manifest.path"),
      launchPathFromBody(body, "selected_manifest.local_path"),
      launchPathFromBody(body, "manifest.path"),
      launchPathFromBody(body, "manifest.local_path")
    ),
    captureId
  );
}

function normalizeSemanticEnvironmentPath(value, captureId) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.startsWith("gs://") && captureId) {
    const localPath = localCapturePathFromGcsUri(text, captureId);
    if (!localPath) {
      throw new HttpError(400, "semantic_environment_path GCS URI must be under the selected capture prefix.");
    }
    return localPath;
  }
  return normalizeVmLaunchPath(text, "semantic_environment_path");
}

function selectedSemanticEnvironmentPathFromBody(body, captureId) {
  return normalizeSemanticEnvironmentPath(
    firstString(
      launchPathFromBody(body, "semantic_environment_path"),
      launchPathFromBody(body, "semanticEnvironmentPath"),
      launchPathFromBody(body, "semantic_environment.path"),
      launchPathFromBody(body, "semantic_environment.local_path")
    ),
    captureId
  );
}

function selectedMapPathFromBody(body) {
  return normalizeVmLaunchPath(
    firstString(
      launchPathFromBody(body, "map_path"),
      launchPathFromBody(body, "mapPath"),
      launchPathFromBody(body, "unreal_level_path"),
      launchPathFromBody(body, "unrealLevelPath")
    ),
    "map_path"
  );
}

function buildPixelStreamingFallbackCommand({ mapPath, scenarioManifestPath, semanticEnvironmentPath }) {
  const envAssignments = [
    remoteEnvAssignment("PROJECT", l4UnrealProjectRoot),
    remoteEnvAssignment("ADAPTSIM_MAP_PATH", mapPath),
    remoteEnvAssignment("ADAPTSIM_SCENARIO_MANIFEST", scenarioManifestPath),
    remoteEnvAssignment("ADAPTSIM_SEMANTIC_ENVIRONMENT", semanticEnvironmentPath),
    remoteEnvAssignment("ADAPTSIM_PS_RES_X", pixelStreamingResX),
    remoteEnvAssignment("ADAPTSIM_PS_RES_Y", pixelStreamingResY),
    remoteEnvAssignment("ADAPTSIM_PS_ENCODER_CODEC", pixelStreamingEncoderCodec),
    remoteEnvAssignment("ADAPTSIM_PS_WEBRTC_MIN_BITRATE", pixelStreamingWebrtcMinBitrate),
    remoteEnvAssignment("ADAPTSIM_PS_WEBRTC_MAX_BITRATE", pixelStreamingWebrtcMaxBitrate),
    remoteEnvAssignment("ADAPTSIM_PS_ENCODER_MAX_BITRATE", pixelStreamingEncoderMaxBitrate),
    remoteEnvAssignment("ADAPTSIM_PS_ENCODER_TARGET_BITRATE", pixelStreamingEncoderTargetBitrate)
  ].filter(Boolean).join(" ");
  const extraUnrealArgs = [
    `-PixelStreamingWebRTCMinBitrate=${pixelStreamingWebrtcMinBitrate}`,
    `-PixelStreamingWebRTCMaxBitrate=${pixelStreamingWebrtcMaxBitrate}`,
    `-PixelStreamingEncoderMaxBitrate=${pixelStreamingEncoderMaxBitrate}`,
    pixelStreamingEncoderTargetBitrate
      ? `-PixelStreamingEncoderTargetBitrate=${pixelStreamingEncoderTargetBitrate}`
      : ""
  ].filter(Boolean).map((arg) => `--extra-unreal-arg ${shellQuote(arg)}`).join(" ");

  return [
    `cd ${shellQuote(l4RepoRoot)}`,
    `${envAssignments} scripts/pixel-streaming/adaptsim-pixel-streaming.sh restart ${extraUnrealArgs}`.trim()
  ].join(" && ");
}

function buildPixelStreamingStatusCommand() {
  const fallback = `cd ${shellQuote(l4RepoRoot)} && scripts/pixel-streaming/adaptsim-pixel-streaming.sh status`;
  return buildRemoteCommand(process.env.ADAPTSIM_L4_STATUS_COMMAND, fallback, {});
}

function parseJsonObjectFromText(text) {
  const source = String(text || "").trim();
  if (!source) return null;
  try {
    return JSON.parse(source);
  } catch {}

  const firstBrace = source.indexOf("{");
  const lastBrace = source.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) return null;
  try {
    return JSON.parse(source.slice(firstBrace, lastBrace + 1));
  } catch {
    return null;
  }
}

function commandOutputHint(result, fallback = "No command output was captured.") {
  const text = [
    result?.stderr,
    result?.stdout,
    result?.exitCode && result.exitCode !== 0 ? `exit=${result.exitCode}` : ""
  ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return (text || fallback).slice(0, 500);
}

function l4LogHint(statusPayload, result = null) {
  const components = statusPayload?.components || {};
  const logs = [
    components.signalling?.log_file ? `signalling=${components.signalling.log_file}` : "",
    components.unreal?.log_file ? `unreal=${components.unreal.log_file}` : ""
  ].filter(Boolean).join(", ");
  if (logs) return `L4 status=${statusPayload.status || "unknown"}; logs: ${logs}`;
  if (result && !result.ok) return `L4 status command failed: ${commandOutputHint(result)}`;
  return "";
}

function resolvePixelStreamingLaunchContext({ sceneId, scenarioId, body, captureStatus }) {
  const selectedManifestPath = selectedScenarioManifestPathFromBody(body, sceneId);
  const bodyMapPath = selectedMapPathFromBody(body);
  const bodySemanticPath = selectedSemanticEnvironmentPathFromBody(body, sceneId);

  if (captureStatus) {
    const mapPath = bodyMapPath || captureStatus.unreal?.level_path || "";
    if (!mapPath) {
      throw new HttpError(409, `Scene ${sceneId} has no imported Unreal level path yet.`);
    }
    const semanticEnvironmentPath = bodySemanticPath
      || localCapturePathFromGcsUri(captureStatus.artifacts?.semantic_environment_uri, sceneId)
      || localCapturePath(sceneId, "unreal", "semantic_environment.json");
    return {
      mapPath,
      scenarioManifestPath: selectedManifestPath || localCapturePath(sceneId, "scenario_manifests", `${scenarioId}.json`),
      semanticEnvironmentPath
    };
  }

  return {
    mapPath: bodyMapPath || defaultPixelStreamingMapPath,
    scenarioManifestPath: selectedManifestPath || path.posix.join(l4ContractExamplesRoot, "scenario_manifests", `${scenarioId}.json`),
    semanticEnvironmentPath: bodySemanticPath || defaultPixelStreamingSemanticEnvironmentPath
  };
}

async function runGcloudSshTrigger({ instance, zone, project, command, timeout = workerTriggerTimeoutMs }) {
  if (!workerTriggersEnabled) {
    return { enabled: false, ok: true };
  }
  const result = await runCommand("gcloud", [
    "compute",
    "ssh",
    instance,
    `--zone=${zone}`,
    `--project=${project}`,
    "--tunnel-through-iap",
    "--command",
    command
  ], {
    timeout,
    maxBuffer: 256 * 1024,
    textLimit: 12000
  });
  return { enabled: true, ...result };
}

function triggerReconstructionWorker(captureId) {
  const fallback = `cd ~/adaptsim/repos/adaptsim-hackathon && workers/a100-reconstruction/adaptsim-reconstruct --capture-id ${captureId} --gcs-root ${gcsRootUri()}`;
  const command = buildRemoteCommand(process.env.ADAPTSIM_A100_RECONSTRUCT_COMMAND, fallback, {
    capture_id: captureId,
    gcs_root: gcsRootUri()
  });
  return runGcloudSshTrigger({
    instance: a100Instance,
    zone: a100Zone,
    project: a100Project,
    command
  });
}

function triggerUnrealImportWorker(captureId) {
  const workerCommand = `workers/l4-unreal-import/adaptsim-import-capture --capture-id ${shellQuote(captureId)} --gcs-root ${shellQuote(gcsRootUri())}`;
  const fallback = [
    `cd ${shellQuote(l4RepoRoot)}`,
    "test -x workers/l4-unreal-import/adaptsim-import-capture",
    "mkdir -p ~/adaptsim/logs/l4-unreal-import",
    `(nohup ${workerCommand} > ~/adaptsim/logs/l4-unreal-import/${captureId}.log 2>&1 < /dev/null &)`
  ].join(" && ");
  const command = buildRemoteCommand(process.env.ADAPTSIM_L4_IMPORT_COMMAND, fallback, {
    capture_id: captureId,
    gcs_root: gcsRootUri()
  });
  return runGcloudSshTrigger({
    instance: l4Instance,
    zone: l4Zone,
    project: l4Project,
    command
  });
}

function triggerFailureMessage(label, resultOrError) {
  if (resultOrError instanceof Error) {
    return `${label}: ${resultOrError.message}`.slice(0, 500);
  }
  const detail = resultOrError?.stderr || resultOrError?.stdout || resultOrError?.exitCode || "unknown trigger failure";
  return `${label}: ${detail}`.slice(0, 500);
}

async function markUnrealImportTriggerFailure(captureId, resultOrError) {
  const latestStatus = await loadCaptureStatus(captureId).catch(() => null);
  if (!latestStatus || captureHasReadyUnrealImport(latestStatus) || latestStatus.status === "failed") return;
  if (!["ready_for_unreal_import", "importing_unreal"].includes(latestStatus.status)) return;

  const failedStatus = captureStatusWithPhase(latestStatus, "failed", {
    message: "L4 Unreal import trigger failed.",
    percent: 100,
    unreal: {
      ...(latestStatus.unreal || {}),
      status: "failed"
    },
    error: {
      code: "unreal_import_trigger_failed",
      message: triggerFailureMessage("L4 Unreal import trigger failed", resultOrError),
      failed_phase: "importing_unreal",
      retryable: true
    }
  });
  await writeJsonToGcs(captureObjectUri(captureId, "status.json"), failedStatus);
}

async function maybeStartUnrealImportHandoff(status) {
  if (status?.status !== "ready_for_unreal_import") return status;
  if (!workerTriggersEnabled) return status;

  const captureId = validateIdentifier(status.capture_id, "capture_id");
  if (unrealImportTriggerPromises.has(captureId)) return status;

  const importingStatus = captureStatusWithPhase(status, "importing_unreal", {
    message: "Reconstruction complete; L4 Unreal import trigger dispatched.",
    percent: captureDefaultPercents.importing_unreal,
    unreal: {
      ...(status.unreal || {}),
      status: "importing",
      level_path: null,
      import_report_uri: null
    }
  });

  unrealImportTriggerPromises.set(captureId, Promise.resolve());
  try {
    await writeJsonToGcs(captureObjectUri(captureId, "status.json"), importingStatus);
  } catch (error) {
    unrealImportTriggerPromises.delete(captureId);
    throw error;
  }

  const triggerPromise = triggerUnrealImportWorker(captureId).then((result) => {
    if (result.enabled && !result.ok) {
      console.error(`L4 Unreal import trigger failed for ${captureId}: ${result.stderr || result.stdout || result.exitCode}`);
      return markUnrealImportTriggerFailure(captureId, result).catch((statusError) => {
        console.error(`Could not write L4 import trigger failure status for ${captureId}: ${statusError.message}`);
      });
    }
    return null;
  }).catch((error) => {
    console.error(`L4 Unreal import trigger failed for ${captureId}: ${error.message}`);
    return markUnrealImportTriggerFailure(captureId, error).catch((statusError) => {
      console.error(`Could not write L4 import trigger failure status for ${captureId}: ${statusError.message}`);
    });
  }).finally(() => {
    unrealImportTriggerPromises.delete(captureId);
  });
  unrealImportTriggerPromises.set(captureId, triggerPromise);
  return importingStatus;
}

function triggerPixelStreamingLaunch({ sceneId, scenarioId, runId, mapPath, scenarioManifestPath, semanticEnvironmentPath }) {
  const fallback = buildPixelStreamingFallbackCommand({ mapPath, scenarioManifestPath, semanticEnvironmentPath });
  const command = buildRemoteCommand(process.env.ADAPTSIM_L4_LAUNCH_COMMAND, fallback, {
    scene_id: sceneId,
    scenario_id: scenarioId,
    run_id: runId,
    map_path: mapPath || "",
    scenario_manifest_path: scenarioManifestPath || "",
    semantic_environment_path: semanticEnvironmentPath || ""
  });
  return runGcloudSshTrigger({
    instance: l4Instance,
    zone: l4Zone,
    project: l4Project,
    command
  });
}

function fetchPixelStreamingStatus(run) {
  const command = buildRemoteCommand(process.env.ADAPTSIM_L4_STATUS_COMMAND, buildPixelStreamingStatusCommand(), {
    scene_id: run.scene_id,
    scenario_id: run.scenario_id,
    run_id: run.run_id,
    map_path: run.launch_context?.mapPath || "",
    scenario_manifest_path: run.launch_context?.scenarioManifestPath || "",
    semantic_environment_path: run.launch_context?.semanticEnvironmentPath || ""
  });
  return runGcloudSshTrigger({
    instance: l4Instance,
    zone: l4Zone,
    project: l4Project,
    command,
    timeout: l4StatusTimeoutMs
  });
}

function loadScenarioManifest(scenarioId) {
  const safeScenarioId = validateIdentifier(scenarioId, "scenario_id");
  const fileName = `${safeScenarioId}.json`;
  const filePath = path.join(contractsExamplesDir, "scenario_manifests", fileName);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listScenarioManifestsForScene(sceneId) {
  const safeSceneId = validateIdentifier(sceneId, "scene_id");
  const scenarioDir = path.join(contractsExamplesDir, "scenario_manifests");
  if (!fs.existsSync(scenarioDir)) return [];

  const manifests = [];
  for (const entry of fs.readdirSync(scenarioDir)) {
    if (!entry.endsWith(".json")) continue;
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(scenarioDir, entry), "utf8"));
      if (manifest?.environment_id === safeSceneId) manifests.push(manifest);
    } catch {}
  }

  manifests.sort((left, right) => String(left.scenario_id || "").localeCompare(String(right.scenario_id || "")));
  return manifests;
}

function summarizeScenario(manifest) {
  const severities = (manifest.events || []).map((event) => Number(event.severity || 0));
  return {
    scenario_id: manifest.scenario_id,
    display_name: manifest.display_name,
    status: "ready",
    training_objective: manifest.training_objective,
    event_count: Array.isArray(manifest.events) ? manifest.events.length : 0,
    severity_max: severities.length ? Math.max(...severities) : 0,
    manifest_url: `/api/v1/scenarios/${manifest.scenario_id}/manifest`
  };
}

function loadDemoSceneStatus() {
  const semanticEnvironment = readFixtureJson("semantic_environments", "scanned_hallway_alpha.json");
  return {
    scene_id: semanticEnvironment.environment_id,
    display_name: "Horror Corridor",
    status: "ready",
    source_scan_id: semanticEnvironment.source_scan_id,
    unreal_level_path: semanticEnvironment.unreal_level_path,
    updated_at: "2026-05-02T16:45:00-07:00",
    anchor_count: Array.isArray(semanticEnvironment.anchors) ? semanticEnvironment.anchors.length : 0,
    scenario_count: demoScenarioIds.length,
    stream: {
      status: "available",
      provider: "unreal_pixel_streaming"
    },
    artifacts: {
      semantic_environment_url: "/api/v1/artifacts/semantic_environments/scan_hallway_alpha"
    }
  };
}

function loadThreatInjectionPlan(sceneId) {
  const safeSceneId = validateIdentifier(sceneId, "scene_id");
  const filePath = path.join(contractsExamplesDir, "gameplay_intelligence", safeSceneId, "threat_injection_plan.json");
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function buildSceneStatusFromCapture(captureStatus) {
  const ready = captureHasReadyUnrealImport(captureStatus);
  const scenarioCount = ready ? listScenarioManifestsForScene(captureStatus.capture_id).length : 0;
  const semanticEnvironment = ready ? loadSemanticEnvironmentFixture(captureStatus.capture_id) : null;
  const reconstructingStatuses = new Set([
    "queued_reconstruction",
    "validating_images",
    "sfm_solving",
    "reconstructing_splat",
    "exporting_splat",
    "extracting_mesh",
    "postprocessing_mesh"
  ]);
  const compiledStatuses = new Set(["ready_for_unreal_import", "importing_unreal", "imported_unreal", "ready"]);
  const sceneStatus = ready
    ? "ready"
    : ["failed", "sfm_failed"].includes(captureStatus.status)
      ? "failed"
      : compiledStatuses.has(captureStatus.status)
        ? "compiled"
        : reconstructingStatuses.has(captureStatus.status)
          ? "reconstructing"
          : "uploading";
  return {
    scene_id: captureStatus.capture_id,
    display_name: captureStatus.display_name,
    status: sceneStatus,
    source_scan_id: captureStatus.capture_id,
    unreal_level_path: captureStatus.unreal?.level_path || null,
    updated_at: captureStatus.updated_at,
    anchor_count: Array.isArray(semanticEnvironment?.anchors) ? semanticEnvironment.anchors.length : 0,
    scenario_count: scenarioCount,
    stream: {
      status: ready ? "available" : "unavailable",
      provider: "unreal_pixel_streaming"
    },
    artifacts: {
      semantic_environment_url: captureStatus.artifacts?.semantic_environment_uri
        ? `/api/v1/captures/${captureStatus.capture_id}/artifacts/semantic_environment`
        : null
    }
  };
}

function loadSemanticEnvironmentFixture(sceneId) {
  const safeSceneId = validateIdentifier(sceneId, "scene_id");
  const filePath = path.join(contractsExamplesDir, "semantic_environments", `${safeSceneId}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function runRecordForId(runId) {
  if (launchedRuns.has(runId)) return launchedRuns.get(runId);
  if (runId === demoRunId) {
    return {
      run_id: demoRunId,
      scene_id: demoSceneId,
      scenario_id: "scan_hallway_delay_001",
      created_at_ms: Date.now() - streamReadyDelayMs,
      status: "ready"
    };
  }
  return null;
}

function buildRunId(scenarioId) {
  const suffix = crypto.randomBytes(3).toString("hex");
  return `run_${scenarioId}_${Date.now().toString(36)}_${suffix}`.slice(0, 96);
}

function streamEmbedUrl(runId) {
  const url = new URL(pixelStreamUrl);
  url.searchParams.set("run_id", runId);
  return url.toString();
}

function streamSignalingUrl() {
  if (process.env.ADAPTSIM_PIXEL_SIGNALING_URL) return process.env.ADAPTSIM_PIXEL_SIGNALING_URL;
  const url = new URL(pixelStreamUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/signalling";
  url.search = "";
  return url.toString();
}

async function resolveRunStreamState(run) {
  if (!workerTriggersEnabled) {
    const ready = Date.now() - run.created_at_ms >= streamReadyDelayMs;
    return {
      ready,
      status: ready ? "ready" : "launching",
      logHint: "",
      l4Status: null
    };
  }

  if (run.launch?.status === "failed") {
    return {
      ready: false,
      status: "failed",
      logHint: run.launch.log_hint || "Pixel Streaming launch command failed.",
      l4Status: run.l4_status || null
    };
  }

  let result;
  try {
    result = await fetchPixelStreamingStatus(run);
  } catch (error) {
    return {
      ready: false,
      status: "launching",
      logHint: `L4 status command errored: ${error.message}`,
      l4Status: run.l4_status || null
    };
  }

  const statusPayload = result.ok ? parseJsonObjectFromText(result.stdout) : null;
  if (statusPayload) run.l4_status = statusPayload;

  if (!result.ok || !statusPayload) {
    return {
      ready: false,
      status: "launching",
      logHint: l4LogHint(statusPayload, result) || `L4 status command returned no usable status: ${commandOutputHint(result)}`,
      l4Status: statusPayload || run.l4_status || null
    };
  }

  const l4Status = String(statusPayload.status || "").toLowerCase();
  if (statusPayload.ready === true || l4Status === "ready") {
    return {
      ready: true,
      status: "ready",
      logHint: l4LogHint(statusPayload),
      l4Status: statusPayload
    };
  }

  const failedByStatus = ["failed", "error"].includes(l4Status);
  const stoppedAfterLaunch = l4Status === "stopped" && run.launch?.status === "submitted";
  return {
    ready: false,
    status: failedByStatus || stoppedAfterLaunch ? "failed" : "launching",
    logHint: l4LogHint(statusPayload) || (stoppedAfterLaunch ? "L4 Pixel Streaming stopped after launch." : ""),
    l4Status: statusPayload
  };
}

function rewriteTelemetryForRun(payload, run) {
  const telemetry = cloneJson(payload);
  telemetry.run_id = run.run_id;
  telemetry.scenario_id = run.scenario_id;
  telemetry.events = (telemetry.events || []).map((event) => ({
    ...event,
    run_id: run.run_id,
    scenario_id: run.scenario_id
  }));
  return telemetry;
}

function readAsciiFromBuffer(buffer, offset, length) {
  return buffer.subarray(offset, offset + length).toString("ascii").replace(/\0/g, "");
}

function parseExifGpsFromBuffer(buffer) {
  if (buffer.length < 12 || buffer.readUInt16BE(0) !== 0xffd8) return null;

  let offset = 2;
  while (offset + 4 < buffer.length) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer[offset + 1];
    const segmentLength = buffer.readUInt16BE(offset + 2);
    const segmentStart = offset + 4;
    if (marker === 0xe1 && readAsciiFromBuffer(buffer, segmentStart, 6) === "Exif") {
      return parseExifTiffGpsFromBuffer(buffer, segmentStart + 6);
    }
    offset += 2 + segmentLength;
  }
  return null;
}

function parseExifTiffGpsFromBuffer(buffer, tiffStart) {
  const endian = readAsciiFromBuffer(buffer, tiffStart, 2);
  const littleEndian = endian === "II";
  if (!littleEndian && endian !== "MM") return null;
  const get16 = (offset) => buffer.readUInt16BE(offset) && (littleEndian ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset));
  const get32 = (offset) => littleEndian ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
  const firstIfdOffset = get32(tiffStart + 4);
  const gpsIfdOffset = findExifTagValue(buffer, tiffStart, tiffStart + firstIfdOffset, 0x8825, get16, get32);
  if (!gpsIfdOffset) return null;

  const gpsIfdStart = tiffStart + gpsIfdOffset;
  const latRef = findExifTagValue(buffer, tiffStart, gpsIfdStart, 0x0001, get16, get32);
  const lat = findExifTagValue(buffer, tiffStart, gpsIfdStart, 0x0002, get16, get32);
  const lonRef = findExifTagValue(buffer, tiffStart, gpsIfdStart, 0x0003, get16, get32);
  const lon = findExifTagValue(buffer, tiffStart, gpsIfdStart, 0x0004, get16, get32);
  if (!Array.isArray(lat) || !Array.isArray(lon)) return null;
  return {
    lat: gpsDmsToDecimal(lat, latRef),
    lon: gpsDmsToDecimal(lon, lonRef),
    source: "Server EXIF GPS"
  };
}

function findExifTagValue(buffer, tiffStart, ifdStart, tag, get16, get32) {
  if (ifdStart < 0 || ifdStart + 2 > buffer.length) return null;
  const entryCount = get16(ifdStart);
  for (let index = 0; index < entryCount; index += 1) {
    const entry = ifdStart + 2 + index * 12;
    if (entry + 12 > buffer.length || get16(entry) !== tag) continue;
    return readExifTagValue(buffer, tiffStart, entry, get16, get32);
  }
  return null;
}

function readExifTagValue(buffer, tiffStart, entry, get16, get32) {
  const type = get16(entry + 2);
  const count = get32(entry + 4);
  const valueOffset = entry + 8;
  const typeSizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  const byteLength = (typeSizes[type] || 1) * count;
  const dataOffset = byteLength <= 4 ? valueOffset : tiffStart + get32(valueOffset);
  if (dataOffset < 0 || dataOffset + byteLength > buffer.length) return null;
  if (type === 2) return readAsciiFromBuffer(buffer, dataOffset, count);
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
  const sign = /^[SW]/i.test(String(ref || "")) ? -1 : 1;
  return sign * (Number(parts[0] || 0) + Number(parts[1] || 0) / 60 + Number(parts[2] || 0) / 3600);
}

function normalizeForCue(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function clampServerText(value, maxLength, fallback = "") {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...` : text;
}

function sanitizeHttpUrl(value, fallback = "") {
  const text = clampServerText(value, 1200, "");
  if (!text) return fallback;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : fallback;
  } catch {
    return fallback;
  }
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function isValidCoordinatePair(lat, lon) {
  const latitude = Number(lat);
  const longitude = Number(lon);
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180;
}

function loadLocationGazetteer() {
  const entries = [];
  try {
    const profiles = JSON.parse(fs.readFileSync(path.join(dataDir, "snapshot-profiles.json"), "utf8")).profiles || [];
    profiles.forEach((profile) => {
      entries.push({
        name: profile.country,
        country: profile.country,
        iso3: profile.iso3,
        lat: profile.center?.lat,
        lon: profile.center?.lon,
        type: "country"
      });
      (profile.locations || []).forEach((location) => {
        entries.push({
          name: location.label,
          country: profile.country,
          iso3: profile.iso3,
          lat: location.lat,
          lon: location.lon,
          type: "profile location"
        });
      });
    });
  } catch {}

  try {
    const disposition = JSON.parse(fs.readFileSync(path.join(dataDir, "military-disposition-index.json"), "utf8"));
    (disposition.entities || []).forEach((entity) => {
      entries.push({
        name: entity.name,
        country: entity.name,
        iso3: entity.iso3 || entity.entityId,
        type: "country/entity"
      });
    });
  } catch {}

  return entries.filter((entry) => entry.name);
}

function extractLocationCandidatesFromText(text) {
  const normalizedText = normalizeForCue(text);
  const gazetteer = loadLocationGazetteer();
  const candidates = [];
  const seen = new Set();
  const addCandidate = (candidate) => {
    const key = normalizeForCue(`${candidate.name} ${candidate.country}`);
    if (!key || seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  };

  gazetteer
    .filter((entry) => normalizeForCue(entry.name).length >= 3 && normalizedText.includes(normalizeForCue(entry.name)))
    .slice(0, 8)
    .forEach((entry) => addCandidate({
      name: entry.name,
      country: entry.country,
      lat: Number.isFinite(Number(entry.lat)) ? Number(entry.lat) : null,
      lon: Number.isFinite(Number(entry.lon)) ? Number(entry.lon) : null,
      confidence: entry.lat != null && entry.lon != null ? "medium" : "low",
      reason: `Matched local gazetteer cue: ${entry.name}.`
    }));

  const country = candidates.find((candidate) => candidate.country)?.country || "";
  const blocked = new Set(["Exif", "JFIF", "JPEG", "TIFF", "Photoshop", "Canon", "Nikon", "Apple", "Image", "Mock", "GPS", "Data", "Standard", "ASCII", "ICC", "Ducky"]);
  const phrasePattern = /\b[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’-]{2,}(?:[\s,_-]+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’-]{2,}){0,2}\b/g;
  for (const match of text.matchAll(phrasePattern)) {
    const phrase = match[0].replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    if (
      !phrase
      || phrase.split(/\s+/).some((part) => blocked.has(part))
      || candidates.some((candidate) => normalizeForCue(candidate.name) === normalizeForCue(phrase))
    ) continue;
    if (country || /\b(city|capital|base|airport|harbor|port|station)\b/i.test(text.slice(Math.max(0, match.index - 40), match.index + 80))) {
      addCandidate({
        name: phrase.replace(/^Mock\s+/i, ""),
        country,
        lat: null,
        lon: null,
        confidence: "low",
        reason: "Capitalized text cue found in file strings/OCR; needs geocoding or analyst review."
      });
    }
  }

  return candidates.slice(0, 5);
}

function mergeVisionAnalysis(localAnalysis, modelAnalysis) {
  if (!modelAnalysis) return localAnalysis;
  const locations = [...(localAnalysis.possibleLocations || []), ...(modelAnalysis.possibleLocations || [])];
  const seen = new Set();
  const evidence = [...(localAnalysis.geoEvidence || []), ...(modelAnalysis.geoEvidence || [])];
  const seenEvidence = new Set();
  return {
    ...localAnalysis,
    ...modelAnalysis,
    summary: [localAnalysis.summary, modelAnalysis.summary].filter(Boolean).join(" "),
    visualClues: [...new Set([...(localAnalysis.visualClues || []), ...(modelAnalysis.visualClues || [])])].slice(0, 12),
    possibleLocations: locations.filter((location) => {
      const key = normalizeForCue(`${location.name} ${location.country} ${location.lat} ${location.lon}`);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 6),
    geoEvidence: evidence.filter((item) => {
      const key = normalizeForCue(`${item.source} ${item.title} ${item.url} ${item.lat} ${item.lon}`);
      if (!key || seenEvidence.has(key)) return false;
      seenEvidence.add(key);
      return true;
    }).slice(0, 8),
    cautions: [...new Set([...(localAnalysis.cautions || []), ...(modelAnalysis.cautions || [])])].slice(0, 8)
  };
}

function loadOpenPlaceEvidence() {
  try {
    const payload = JSON.parse(fs.readFileSync(openPlaceEvidencePath, "utf8"));
    return Array.isArray(payload.places) ? payload.places : [];
  } catch {
    return [];
  }
}

function textFromAnalysis(analysis, extraText = "") {
  return [
    extraText,
    analysis?.summary,
    analysis?.what,
    analysis?.facilityType,
    ...(analysis?.visualClues || []),
    ...(analysis?.possibleLocations || []).flatMap((location) => [
      location.name,
      location.country,
      location.reason
    ])
  ].filter(Boolean).join("\n");
}

function getPlaceAliases(place) {
  return [
    place?.name,
    place?.address,
    ...(Array.isArray(place?.aliases) ? place.aliases : [])
  ].filter(Boolean);
}

function scoreTextAgainstAlias(text, alias) {
  const normalizedText = normalizeForCue(text);
  const normalizedAlias = normalizeForCue(alias);
  const tokens = tokenizeGeoQuery(alias);
  if (!normalizedText || !normalizedAlias || !tokens.length) return 0;
  if (normalizedText.includes(normalizedAlias)) return 0.95;
  const overlap = tokenOverlapRatio(text, tokens);
  const distinctiveMatches = tokens.filter((token) => token.length >= 5 && normalizedText.includes(token)).length;
  if (overlap < 0.58 || distinctiveMatches < Math.min(2, tokens.length)) return 0;
  return Math.min(0.9, 0.25 + overlap * 0.58 + Math.min(0.12, distinctiveMatches * 0.04));
}

function scoreOpenPlaceEvidence(place, text) {
  let best = { score: 0, alias: "" };
  for (const alias of getPlaceAliases(place)) {
    const score = scoreTextAgainstAlias(text, alias);
    if (score > best.score) best = { score, alias };
  }

  const normalizedText = normalizeForCue(text);
  const contextBoosts = [
    place?.city && normalizedText.includes(normalizeForCue(place.city)) ? 0.04 : 0,
    place?.country && normalizedText.includes(normalizeForCue(place.country)) ? 0.04 : 0,
    place?.category && normalizedText.includes(normalizeForCue(place.category)) ? 0.03 : 0
  ];
  return {
    score: Math.min(0.98, best.score + contextBoosts.reduce((sum, value) => sum + value, 0)),
    alias: best.alias
  };
}

function placeEvidenceFromRecord(place, match) {
  if (!isValidCoordinatePair(place?.lat, place?.lon)) return null;
  const confidence = match.score >= 0.82 ? "high" : match.score >= 0.58 ? "medium" : "low";
  const primarySource = Array.isArray(place.sources) ? place.sources[0] : null;
  const sourceLinks = Array.isArray(place.sources)
    ? place.sources
        .slice(0, 4)
        .map((source) => (source && typeof source === "object"
          ? {
              ...source,
              url: sanitizeHttpUrl(source.url)
            }
          : {
              title: clampServerText(source, 160),
              url: sanitizeHttpUrl(source)
            }))
        .filter((source) => source.url || source.title)
    : [];
  return {
    source: "Open place evidence",
    database: "AdaptSim open place evidence",
    title: clampServerText(place.name, 160, "Known place"),
    url: sanitizeHttpUrl(primarySource?.url),
    thumbnailUrl: "",
    lat: Number(place.lat),
    lon: Number(place.lon),
    confidence,
    score: Number(match.score.toFixed(3)),
    reason: `Matched readable/interpretable image clue "${match.alias || place.name}" to a sourced place record${place.address ? ` at ${place.address}` : ""}.`,
    matchedQuery: clampServerText(match.alias || place.name, 140),
    license: "",
    sourceLinks
  };
}

function enrichWithOpenPlaceEvidence(analysis, { fileName = "", forensicText = "" } = {}) {
  const text = textFromAnalysis(analysis, [fileName, forensicText].filter(Boolean).join("\n"));
  const matches = loadOpenPlaceEvidence()
    .map((place) => ({ place, match: scoreOpenPlaceEvidence(place, text) }))
    .filter(({ match }) => match.score >= 0.58)
    .sort((left, right) => right.match.score - left.match.score)
    .slice(0, 4);
  if (!matches.length) return analysis;

  const placeEvidence = matches
    .map(({ place, match }) => placeEvidenceFromRecord(place, match))
    .filter(Boolean);
  const inferredLocations = placeEvidence
    .filter((item) => item.confidence !== "low")
    .map((item) => ({
      name: item.title,
      country: matches.find(({ place }) => place.name === item.title)?.place?.country || "",
      lat: item.lat,
      lon: item.lon,
      confidence: item.confidence,
      reason: `${item.database}: ${item.reason}`,
      source: item.source,
      url: item.url
    }));

  const seenLocations = new Set();
  const possibleLocations = [...inferredLocations, ...(analysis.possibleLocations || [])]
    .filter((location) => {
      const key = normalizeForCue(`${location.name} ${location.country} ${location.lat} ${location.lon}`);
      if (!key || seenLocations.has(key)) return false;
      seenLocations.add(key);
      return true;
    })
    .slice(0, 8);

  const seenEvidence = new Set();
  const geoEvidence = [...placeEvidence, ...(analysis.geoEvidence || [])]
    .filter((item) => {
      const key = normalizeForCue(`${item.source} ${item.title} ${item.url} ${item.lat} ${item.lon}`);
      if (!key || seenEvidence.has(key)) return false;
      seenEvidence.add(key);
      return true;
    })
    .slice(0, 8);

  return {
    ...analysis,
    summary: `${analysis.summary || "Image intake complete."} Open place evidence matched ${placeEvidence.length} sourced location record${placeEvidence.length === 1 ? "" : "s"}.`,
    possibleLocations,
    geoEvidence,
    confidence: placeEvidence.some((item) => item.confidence === "high") ? "high" : analysis.confidence,
    cautions: [
      ...(analysis.cautions || []),
      "Readable text/place-record matches are strong clues when sourced, but should still be reviewed against the image."
    ].filter(Boolean).slice(0, 8)
  };
}

function getCommonsPages(payload) {
  return Object.values(payload?.query?.pages || {})
    .filter((page) => page && page.title)
    .sort((left, right) => Number(left.index ?? 9999) - Number(right.index ?? 9999));
}

function getCommonsMetadata(page) {
  return page?.imageinfo?.[0]?.extmetadata || {};
}

function parseCommonsCoordinate(page) {
  const coordinates = Array.isArray(page?.coordinates) ? page.coordinates : [];
  const primary = coordinates.find((coordinate) => Object.prototype.hasOwnProperty.call(coordinate, "primary"));
  const coordinate = primary || coordinates[0];
  if (isValidCoordinatePair(coordinate?.lat, coordinate?.lon)) {
    return { lat: Number(coordinate.lat), lon: Number(coordinate.lon) };
  }

  const metadata = getCommonsMetadata(page);
  const lat = metadata.GPSLatitude?.value;
  const lon = metadata.GPSLongitude?.value;
  if (isValidCoordinatePair(lat, lon)) {
    return { lat: Number(lat), lon: Number(lon) };
  }

  return null;
}

function cleanCommonsTitle(title) {
  return String(title || "")
    .replace(/^File:/i, "")
    .replace(/\.[A-Za-z0-9]{2,5}$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getCommonsText(page) {
  const metadata = getCommonsMetadata(page);
  return [
    cleanCommonsTitle(page?.title),
    metadata.ObjectName?.value,
    metadata.ImageDescription?.value,
    metadata.Categories?.value
  ].map(stripHtml).filter(Boolean).join(" ");
}

function tokenizeGeoQuery(query) {
  const blocked = new Set([
    "a", "an", "and", "api", "browser", "data", "exif", "file", "forensic", "gps", "image", "jpeg", "jpg",
    "local", "metadata", "photo", "png", "source", "the", "vision", "webp", "with"
  ]);
  return normalizeForCue(query)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !blocked.has(token));
}

function tokenOverlapRatio(text, tokens) {
  if (!tokens.length) return 0;
  const normalizedText = ` ${normalizeForCue(text)} `;
  const matches = tokens.filter((token) => normalizedText.includes(` ${token} `)).length;
  return matches / tokens.length;
}

function isGenericGeoQuery(query) {
  const normalized = normalizeForCue(query);
  if (normalized.length < 3) return true;
  if (/^(source image forensic analysis|browser side forensic image intake|visual analysis)$/i.test(query.trim())) return true;
  if (/\b(file signature|optional tools|binwalk|stegdetect|tesseract|jpeg image|png image|webp riff image)\b/i.test(query)) return true;
  const tokens = tokenizeGeoQuery(query);
  return !tokens.length;
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = openGeoLookupTimeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) return null;
    return await response.json().catch(() => null);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchCommonsJson(params) {
  const url = new URL(commonsApiUrl);
  Object.entries({
    action: "query",
    format: "json",
    origin: "*",
    ...params
  }).forEach(([key, value]) => {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  });

  return fetchJsonWithTimeout(url, {
    headers: {
      "user-agent": commonsUserAgent,
      accept: "application/json"
    }
  });
}

function commonsEvidenceFromPage(page, context = {}) {
  const coordinate = parseCommonsCoordinate(page);
  if (!coordinate) return null;

  const metadata = getCommonsMetadata(page);
  const imageInfo = page?.imageinfo?.[0] || {};
  const title = cleanCommonsTitle(page.title);
  const evidenceText = getCommonsText(page);
  const queryTokens = tokenizeGeoQuery(context.query || context.name || "");
  const overlap = tokenOverlapRatio(evidenceText, queryTokens);
  const hasMetadataGps = Boolean(metadata.GPSLatitude?.value && metadata.GPSLongitude?.value);
  const hasLicense = Boolean(metadata.LicenseShortName?.value || metadata.UsageTerms?.value);
  const indexBoost = Number(page.index ?? 99) <= 2 ? 0.05 : 0;
  const score = Math.min(
    0.95,
    (context.mode === "nearby" ? 0.5 : 0.34)
      + overlap * 0.42
      + (hasMetadataGps ? 0.08 : 0)
      + (hasLicense ? 0.03 : 0)
      + indexBoost
  );

  const confidence = score >= 0.72 ? "high" : score >= 0.48 ? "medium" : "low";
  const reason = context.mode === "nearby"
    ? `Geotagged Commons media found near interpreted candidate ${context.name || context.query || "location"}.`
    : `Geotagged Commons media matched interpreted cue "${context.query}".`;

  return {
    source: "Wikimedia Commons",
    database: "Wikimedia Commons geotagged media",
    title: clampServerText(title, 160, "Commons geotagged media"),
    url: sanitizeHttpUrl(
      imageInfo.descriptionurl || imageInfo.descriptionshorturl,
      `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`
    ),
    thumbnailUrl: sanitizeHttpUrl(imageInfo.thumburl),
    lat: coordinate.lat,
    lon: coordinate.lon,
    confidence,
    score: Number(score.toFixed(3)),
    reason,
    matchedQuery: clampServerText(context.query || context.name || "", 140),
    license: clampServerText(stripHtml(metadata.LicenseShortName?.value || metadata.UsageTerms?.value || ""), 90)
  };
}

async function searchCommonsGeotaggedMedia(query) {
  if (!query || isGenericGeoQuery(query)) return [];
  const payload = await fetchCommonsJson({
    generator: "search",
    gsrnamespace: 6,
    gsrlimit: 8,
    gsrsearch: query,
    prop: "coordinates|imageinfo",
    coprimary: "all",
    iiprop: "url|extmetadata",
    iiurlwidth: 240
  });
  return getCommonsPages(payload)
    .map((page) => commonsEvidenceFromPage(page, { mode: "search", query }))
    .filter(Boolean);
}

async function searchCommonsNearLocation(location) {
  if (!isValidCoordinatePair(location?.lat, location?.lon)) return [];
  const payload = await fetchCommonsJson({
    generator: "geosearch",
    ggsprimary: "all",
    ggsnamespace: 6,
    ggsradius: 5000,
    ggslimit: 8,
    ggscoord: `${location.lat}|${location.lon}`,
    prop: "coordinates|imageinfo",
    coprimary: "all",
    iiprop: "url|extmetadata",
    iiurlwidth: 240
  });
  return getCommonsPages(payload)
    .map((page) => commonsEvidenceFromPage(page, {
      mode: "nearby",
      name: [location.name, location.country].filter(Boolean).join(", ")
    }))
    .filter(Boolean);
}

function buildOpenGeoImageQueries(analysis, fileName) {
  const queries = [];
  const seen = new Set();
  const addQuery = (value) => {
    const query = String(value || "")
      .replace(/\b(OCR text|String cue|File signature):/gi, " ")
      .replace(/\.[A-Za-z0-9]{2,5}\b/g, " ")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const key = normalizeForCue(query);
    if (!query || query.length > 140 || seen.has(key) || isGenericGeoQuery(query)) return;
    seen.add(key);
    queries.push(query);
  };

  (analysis?.possibleLocations || []).forEach((location) => {
    if (
      isValidCoordinatePair(location?.lat, location?.lon)
      && /\b(gazetteer|geocoder|country\/entity|profile location)\b/i.test(location.reason || "")
    ) return;
    addQuery([location.name, location.country].filter(Boolean).join(" "));
  });
  (analysis?.visualClues || []).forEach(addQuery);
  addQuery([analysis?.what, analysis?.facilityType].filter(Boolean).join(" "));
  addQuery(String(fileName || "").replace(/\.[A-Za-z0-9]{2,5}$/i, ""));

  return queries.slice(0, 3);
}

function buildOpenGeoNearbyCandidates(analysis) {
  return (analysis?.possibleLocations || [])
    .filter((location) =>
      isValidCoordinatePair(location?.lat, location?.lon)
      && !/\b(gps|exif)\b/i.test(`${location.name || ""} ${location.reason || ""}`)
      && !/\b(gazetteer|geocoder|country\/entity|profile location)\b/i.test(location.reason || "")
    )
    .slice(0, 2);
}

function dedupeOpenGeoEvidence(items) {
  const seen = new Set();
  return items
    .filter((item) => isValidCoordinatePair(item?.lat, item?.lon))
    .sort((left, right) => Number(right.score || 0) - Number(left.score || 0))
    .filter((item) => {
      const key = normalizeForCue(`${item.source} ${item.title} ${item.lat.toFixed(5)} ${item.lon.toFixed(5)}`);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

function hasReliableGpsSignal(gps, analysis) {
  if (isValidCoordinatePair(gps?.lat, gps?.lon)) return true;
  return (analysis?.possibleLocations || []).some((location) =>
    isValidCoordinatePair(location?.lat, location?.lon)
    && String(location.confidence || "").toLowerCase() === "high"
    && /\b(gps|exif)\b/i.test(`${location.name || ""} ${location.reason || ""}`)
  );
}

async function queryOpenGeoImageSources(analysis, { fileName = "", gps = null } = {}) {
  if (!openGeoImageLookupEnabled || hasReliableGpsSignal(gps, analysis)) {
    return { evidence: [], queries: [], skipped: true };
  }

  const queries = buildOpenGeoImageQueries(analysis, fileName);
  const nearbyCandidates = buildOpenGeoNearbyCandidates(analysis);
  if (!queries.length && !nearbyCandidates.length) {
    return { evidence: [], queries: [], skipped: false };
  }

  const results = [];
  for (const query of queries) {
    results.push(...await searchCommonsGeotaggedMedia(query).catch(() => []));
    if (results.length >= 6) break;
    await delay(120);
  }
  for (const location of nearbyCandidates) {
    results.push(...await searchCommonsNearLocation(location).catch(() => []));
    if (results.length >= 8) break;
    await delay(120);
  }

  const evidence = dedupeOpenGeoEvidence(results);
  return { evidence, queries, skipped: false };
}

function mergeOpenGeoImageEvidence(analysis, lookup) {
  const evidence = lookup?.evidence || [];
  const queries = lookup?.queries || [];
  const existingLocations = analysis?.possibleLocations || [];
  const inferredLocations = evidence
    .filter((item) => item.confidence !== "low")
    .map((item) => ({
      name: item.title,
      country: "",
      lat: item.lat,
      lon: item.lon,
      confidence: item.confidence,
      reason: `${item.database}: ${item.reason}`,
      source: item.source,
      url: item.url
    }));

  const seen = new Set();
  const possibleLocations = [...existingLocations, ...inferredLocations]
    .filter((location) => {
      const key = normalizeForCue(`${location.name} ${location.country} ${location.lat} ${location.lon}`);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);

  const cautions = [
    ...(analysis?.cautions || []),
    evidence.length
      ? "Open geotagged-image matches are supporting evidence based on interpreted cues and known media coordinates, not proof of an identical viewpoint."
      : queries.length
        ? "Open geotagged-image lookup returned no coordinate-bearing matches."
        : lookup?.skipped
          ? ""
          : "Open geotagged-image lookup skipped because no specific searchable location cue was available."
  ].filter(Boolean);

  const seenEvidence = new Set();
  const geoEvidence = [...(analysis.geoEvidence || []), ...evidence]
    .filter((item) => {
      const key = normalizeForCue(`${item.source} ${item.title} ${item.url} ${item.lat} ${item.lon}`);
      if (!key || seenEvidence.has(key)) return false;
      seenEvidence.add(key);
      return true;
    })
    .slice(0, 8);

  return {
    ...analysis,
    summary: evidence.length
      ? `${analysis.summary || "Image intake complete."} Open geotagged-image lookup found ${evidence.length} known-location reference${evidence.length === 1 ? "" : "s"}.`
      : analysis.summary,
    possibleLocations,
    geoEvidence,
    cautions: [...new Set(cautions)].slice(0, 8)
  };
}

async function enrichWithOpenGeoImageSources(analysis, options = {}) {
  const lookup = await queryOpenGeoImageSources(analysis, options).catch(() => ({ evidence: [], queries: [], skipped: false }));
  return mergeOpenGeoImageEvidence(analysis, lookup);
}

function cropBox(width, height, leftRatio, topRatio, widthRatio, heightRatio) {
  const left = Math.max(0, Math.round(width * leftRatio));
  const top = Math.max(0, Math.round(height * topRatio));
  const cropWidth = Math.max(24, Math.min(width - left, Math.round(width * widthRatio)));
  const cropHeight = Math.max(24, Math.min(height - top, Math.round(height * heightRatio)));
  return { left, top, width: cropWidth, height: cropHeight };
}

async function createOcrVariants(filePath, tempDir) {
  if (!sharp) return [filePath];
  const metadata = await sharp(filePath).metadata();
  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  if (!width || !height) return [filePath];

  const variants = [];
  const addVariant = async (name, pipeline) => {
    const outPath = path.join(tempDir, `${name}.png`);
    await pipeline.png().toFile(outPath);
    variants.push(outPath);
  };

  await addVariant(
    "ocr-full-enhanced",
    sharp(filePath)
      .rotate()
      .resize({ width: Math.min(2800, Math.max(width, 1800)), withoutEnlargement: false })
      .grayscale()
      .normalize()
      .sharpen()
  );
  await addVariant(
    "ocr-full-threshold",
    sharp(filePath)
      .rotate()
      .resize({ width: Math.min(2800, Math.max(width, 1800)), withoutEnlargement: false })
      .grayscale()
      .normalize()
      .threshold(145)
  );

  const crops = [
    ["ocr-lower-left", cropBox(width, height, 0.0, 0.42, 0.72, 0.42)],
    ["ocr-lower-middle", cropBox(width, height, 0.18, 0.42, 0.62, 0.42)],
    ["ocr-center", cropBox(width, height, 0.18, 0.22, 0.64, 0.58)],
    ["ocr-lower-right", cropBox(width, height, 0.42, 0.42, 0.58, 0.42)]
  ];

  for (const [name, box] of crops) {
    await addVariant(
      name,
      sharp(filePath)
        .rotate()
        .extract(box)
        .resize({ width: 1800, withoutEnlargement: false })
        .grayscale()
        .normalize()
        .sharpen()
    );
  }

  return variants;
}

function normalizeOcrText(text) {
  return String(text || "")
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function runTesseractJsOcr(filePath, tempDir) {
  if (!createTesseractWorker) {
    return { available: false, ok: false, text: "", stderr: "tesseract.js not installed" };
  }

  let worker = null;
  try {
    const variants = await createOcrVariants(filePath, tempDir);
    worker = await createTesseractWorker("eng", 1, {
      cachePath: path.join(os.tmpdir(), "adaptsim-tessdata"),
      logger: () => {}
    });
    await worker.setParameters({
      tessedit_pageseg_mode: String(tesseractPsm?.SPARSE_TEXT || 11),
      preserve_interword_spaces: "1"
    });

    const texts = [];
    const confidences = [];
    for (const variant of variants) {
      const result = await worker.recognize(variant);
      const text = normalizeOcrText(result?.data?.text);
      if (text) texts.push(text);
      if (Number.isFinite(Number(result?.data?.confidence))) confidences.push(Number(result.data.confidence));
    }

    const lines = [];
    const seen = new Set();
    for (const text of texts) {
      for (const line of text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
        const key = normalizeForCue(line);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        lines.push(line);
      }
    }

    return {
      available: true,
      ok: Boolean(lines.length),
      text: lines.join("\n").slice(0, 6000),
      confidence: confidences.length
        ? Math.round(confidences.reduce((sum, value) => sum + value, 0) / confidences.length)
        : null,
      stderr: ""
    };
  } catch (error) {
    return {
      available: true,
      ok: false,
      text: "",
      confidence: null,
      stderr: error.message || "tesseract.js OCR failed"
    };
  } finally {
    if (worker) await worker.terminate().catch(() => {});
  }
}

async function runOptionalForensicTools(filePath) {
  const [fileInfo, stringsInfo, hexInfo, exiftoolInfo, binwalkInfo, stegdetectInfo, tesseractInfo] = await Promise.all([
    runCommand("file", ["-b", filePath], { textLimit: 600 }),
    runCommand("strings", ["-a", "-n", "5", filePath], { textLimit: 9000 }),
    runCommand("xxd", ["-l", "384", filePath], { textLimit: 3000 }),
    runCommand("exiftool", ["-json", "-n", filePath], { textLimit: 9000 }),
    runCommand("binwalk", [filePath], { textLimit: 4000 }),
    runCommand("stegdetect", [filePath], { textLimit: 3000 }),
    runCommand("tesseract", [filePath, "stdout", "--psm", "6"], { timeout: 6000, textLimit: 6000 })
  ]);
  return { fileInfo, stringsInfo, hexInfo, exiftoolInfo, binwalkInfo, stegdetectInfo, tesseractInfo };
}

async function runOllamaVision(imageDataUrl, forensicText, fileName, mimeType) {
  const model = String(process.env.OLLAMA_VISION_MODEL || "").trim();
  if (!model) return null;
  const host = String(process.env.OLLAMA_HOST || "http://127.0.0.1:11434").replace(/\/+$/, "");
  const base64 = imageDataUrl.split(",")[1] || "";
  const upstream = await fetchWithTimeout(`${host}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      images: [base64],
      prompt:
        "You are a local open-source image geolocation assistant. Identify visible location cues only: signage, skyline, landmarks, terrain, road markings, license plates, uniforms, flags, language, architecture. Do not invent precise coordinates. Return JSON only with {\"summary\":\"\",\"what\":\"\",\"facilityType\":\"\",\"visualClues\":[],\"possibleLocations\":[{\"name\":\"\",\"country\":\"\",\"lat\":null,\"lon\":null,\"confidence\":\"low|medium|high\",\"reason\":\"\"}],\"confidence\":\"low|medium|high\",\"cautions\":[]}. " +
        `File: ${fileName}. MIME: ${mimeType}. Forensic text cues: ${forensicText.slice(0, 1800)}`
    })
  }, "Local Ollama vision request timed out.");
  if (!upstream.ok) return null;
  const payload = await upstream.json().catch(() => ({}));
  return parseVisionJson(payload.response);
}

async function analyzePhotoLocally({ fileName, mimeType, imageDataUrl, gps }) {
  const { buffer } = imageBufferFromDataUrl(imageDataUrl);
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "adaptsim-vision-"));
  const extension = mimeType.includes("png") ? ".png" : mimeType.includes("webp") ? ".webp" : mimeType.includes("gif") ? ".gif" : ".jpg";
  const filePath = path.join(tempDir, `source${extension}`);

  try {
    await fs.promises.writeFile(filePath, buffer);
    const serverGps = parseExifGpsFromBuffer(buffer);
    const hasClientGps = gps?.lat != null && gps?.lon != null && Number.isFinite(Number(gps.lat)) && Number.isFinite(Number(gps.lon));
    const bestGps = hasClientGps ? { lat: Number(gps.lat), lon: Number(gps.lon), source: gps.source || "Browser EXIF GPS" } : serverGps;
    const tools = await runOptionalForensicTools(filePath);
    const tesseractJsInfo = await runTesseractJsOcr(filePath, tempDir);
    const toolText = [
      fileName,
      tools.fileInfo.stdout,
      tools.stringsInfo.stdout,
      tools.exiftoolInfo.stdout,
      tools.binwalkInfo.stdout,
      tools.stegdetectInfo.stdout,
      tools.tesseractInfo.stdout,
      tesseractJsInfo.text
    ].filter(Boolean).join("\n");
    const locationCandidates = extractLocationCandidatesFromText(toolText);

    if (bestGps) {
      locationCandidates.unshift({
        name: "Image GPS coordinate",
        country: "",
        lat: bestGps.lat,
        lon: bestGps.lon,
        confidence: "high",
        reason: `${bestGps.source || "EXIF GPS"} metadata was present.`
      });
    }

    const availableTools = Object.values(tools).filter((tool) => tool.available).map((tool) => tool.command);
    if (tesseractJsInfo.available) availableTools.push("tesseract.js");
    const unavailableTools = Object.values(tools).filter((tool) => !tool.available).map((tool) => tool.command);
    if (!tesseractJsInfo.available) unavailableTools.push("tesseract.js");
    if (!sharp) unavailableTools.push("sharp");
    if (!process.env.STEGSOLVE_JAR) unavailableTools.push("stegsolve");
    const ocrText = normalizeOcrText([tools.tesseractInfo.stdout, tesseractJsInfo.text].filter(Boolean).join("\n"));

    const localAnalysis = {
      summary: `Local forensic intake ran ${availableTools.length ? availableTools.join(", ") : "built-in byte inspection"} and found ${locationCandidates.length} location cue${locationCandidates.length === 1 ? "" : "s"}.`,
      what: "Source image forensic analysis",
      facilityType: "",
      visualClues: [
        tools.fileInfo.stdout && `File signature: ${tools.fileInfo.stdout.trim()}`,
        ocrText && `OCR text: ${ocrText.slice(0, 320)}`,
        tools.binwalkInfo.ok && "Binwalk completed.",
        tools.stegdetectInfo.ok && "Stegdetect completed."
      ].filter(Boolean).slice(0, 8),
      possibleLocations: locationCandidates,
      confidence: bestGps ? "high" : locationCandidates.length ? "medium" : "low",
      cautions: [
        "Local analysis treats text/metadata as clues, not proof.",
        unavailableTools.length ? `Optional tools unavailable: ${[...new Set(unavailableTools)].join(", ")}.` : "",
        "No live military posture, targeting, vulnerabilities, or readiness are inferred from images."
      ].filter(Boolean)
    };

    const ollamaAnalysis = await runOllamaVision(imageDataUrl, toolText, fileName, mimeType).catch(() => null);
    return mergeVisionAnalysis(localAnalysis, ollamaAnalysis);
  } finally {
    fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function handlePhotoVision(request, response) {
  if (!String(request.headers["content-type"] || "").includes("application/json")) {
    sendJson(request, response, 415, { error: "Content-Type must be application/json." });
    return;
  }

  const body = await readJsonBody(request, maxVisionBodyBytes);
  const { fileName, mimeType, imageDataUrl, gps } = validateVisionRequest(body);
  const localAnalysis = await analyzePhotoLocally({ fileName, mimeType, imageDataUrl, gps });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || process.env.OPENAI_VISION_ENABLED === "0") {
    const placeAnalysis = enrichWithOpenPlaceEvidence(localAnalysis, { fileName });
    const analysis = await enrichWithOpenGeoImageSources(placeAnalysis, { fileName, gps });
    sendJson(request, response, 200, {
      analysis,
      engine: "local-forensic"
    });
    return;
  }

  const hasGps = gps?.lat != null
    && gps?.lon != null
    && Number.isFinite(Number(gps.lat))
    && Number.isFinite(Number(gps.lon));
  const metadataLine = hasGps
    ? `EXIF GPS metadata from the browser: ${gps.lat}, ${gps.lon}.`
    : "No EXIF GPS metadata was supplied by the browser.";

  const upstream = await fetchWithTimeout(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
        store: false,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  "Analyze this image for an open-source geospatial source-intake workflow. " +
                  "Identify what is visibly present, likely facility/object type, readable text or signage, and any location clues. " +
                  "If a likely location can be inferred, include place, country, confidence, and approximate coordinates only when there is metadata, readable text, landmark evidence, or another explicit visual cue. " +
                  "Do not invent precise coordinates from generic scenery. Do not infer live military readiness, unit disposition, vulnerabilities, targeting, or tactical details. " +
                  `File: ${fileName}. MIME: ${mimeType}. ${metadataLine} ` +
                  "Return JSON only with this shape: {\"summary\":\"\",\"what\":\"\",\"facilityType\":\"\",\"visualClues\":[],\"possibleLocations\":[{\"name\":\"\",\"country\":\"\",\"lat\":null,\"lon\":null,\"confidence\":\"low|medium|high\",\"reason\":\"\"}],\"confidence\":\"low|medium|high\",\"cautions\":[]}."
              },
              {
                type: "input_image",
                image_url: imageDataUrl,
                detail: "high"
              }
            ]
          }
        ]
      })
    },
    "Vision model request timed out."
  );

  const payload = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const placeAnalysis = enrichWithOpenPlaceEvidence(localAnalysis, { fileName });
    const analysis = await enrichWithOpenGeoImageSources(placeAnalysis, { fileName, gps });
    sendJson(request, response, 200, {
      analysis: {
        ...analysis,
        cautions: [
          ...(analysis.cautions || []),
          payload?.error?.message || `Optional hosted vision model returned ${upstream.status}; local forensic analysis was used.`
        ]
      },
      engine: "local-forensic"
    });
    return;
  }

  const outputText = extractOutputText(payload);
  const parsed = parseVisionJson(outputText);
  const mergedAnalysis = mergeVisionAnalysis(localAnalysis, parsed || {
    summary: outputText || "Vision analysis returned no text.",
    what: "",
    facilityType: "",
    visualClues: [],
    possibleLocations: [],
    confidence: "low",
    cautions: ["Could not parse structured JSON from model output."]
  });
  const placeAnalysis = enrichWithOpenPlaceEvidence(mergedAnalysis, { fileName });
  const analysis = await enrichWithOpenGeoImageSources(placeAnalysis, { fileName, gps });
  sendJson(request, response, 200, {
    analysis,
    engine: "local-forensic+hosted-vision"
  });
}

async function loadCaptureMetadata(captureId) {
  return readJsonFromGcs(captureObjectUri(captureId, "raw/metadata.json"), { optional: true });
}

async function loadCaptureStatus(captureId) {
  return readJsonFromGcs(captureObjectUri(captureId, "status.json"), { optional: true });
}

async function handleCreateCapture(request, response) {
  requireJsonRequest(request);
  const body = await readJsonBody(request);
  const input = validateCaptureCreateBody(body);
  const metadata = buildCaptureMetadata(input);
  const status = buildCaptureStatus(metadata, "created");

  await writeJsonToGcs(captureObjectUri(input.capture_id, "raw/metadata.json"), metadata);
  await writeJsonToGcs(captureObjectUri(input.capture_id, "status.json"), status);

  sendJson(request, response, 201, {
    capture_id: input.capture_id,
    status: "created",
    gcs_prefix: metadata.gcs_prefix
  });
}

async function handleUploadUrls(request, response, captureId) {
  requireJsonRequest(request);
  const safeCaptureId = validateIdentifier(captureId, "capture_id");
  const metadata = await loadCaptureMetadata(safeCaptureId);
  if (!metadata) throw new HttpError(404, `Capture ${safeCaptureId} was not found.`);

  const body = await readJsonBody(request, 512 * 1024);
  const files = validateUploadUrlBody(body);
  const uploads = [];
  for (const file of files) {
    const gcsUri = captureObjectUri(safeCaptureId, `raw/images/${file.filename}`);
    const uploadUrl = await signGcsUrl(gcsUri, {
      method: "PUT",
      contentType: file.content_type,
      duration: gcsSignedUrlDuration
    });
    uploads.push({
      filename: file.filename,
      method: "PUT",
      upload_url: uploadUrl,
      gcs_uri: gcsUri,
      content_type: file.content_type,
      size_bytes: file.size_bytes,
      headers: {
        "Content-Type": file.content_type
      },
      expires_at: expiresAtFromDuration(gcsSignedUrlDuration)
    });
  }

  const uploadManifest = {
    contract_type: "capture_upload_manifest",
    schema_version: schemaVersion,
    capture_id: safeCaptureId,
    created_at: nowIso(),
    uploads: uploads.map(({ upload_url, headers, ...item }) => ({ ...item, required_headers: headers }))
  };
  const status = buildCaptureStatus(metadata, "uploading", {
    sfm: {
      input_images: files.length,
      registered_images: null
    }
  });

  await writeJsonToGcs(captureObjectUri(safeCaptureId, "raw/upload_manifest.json"), uploadManifest);
  await writeJsonToGcs(captureObjectUri(safeCaptureId, "status.json"), status);

  sendJson(request, response, 200, {
    capture_id: safeCaptureId,
    uploads
  });
}

async function handleSubmitCapture(request, response, captureId) {
  requireJsonRequest(request);
  const safeCaptureId = validateIdentifier(captureId, "capture_id");
  const metadata = await loadCaptureMetadata(safeCaptureId);
  if (!metadata) throw new HttpError(404, `Capture ${safeCaptureId} was not found.`);

  const body = await readJsonBody(request);
  const uploadedImageCount = validatePositiveInt(body.uploaded_image_count, "uploaded_image_count");
  const shouldStartReconstruction = body.start_reconstruction !== false;
  const uploadManifest = await readJsonFromGcs(captureObjectUri(safeCaptureId, "raw/upload_manifest.json"), { optional: true }).catch(() => null);
  const manifestUploads = Array.isArray(uploadManifest?.uploads) ? uploadManifest.uploads : [];
  const images = manifestUploads.slice(0, uploadedImageCount).map((item) => ({
    filename: item.filename,
    content_type: item.content_type,
    size_bytes: item.size_bytes,
    gcs_uri: item.gcs_uri
  }));
  const updatedMetadata = {
    ...metadata,
    uploaded_image_count: uploadedImageCount,
    images: images.length === uploadedImageCount ? images : []
  };
  const statusName = shouldStartReconstruction ? "queued_reconstruction" : "uploaded";
  const status = buildCaptureStatus(updatedMetadata, statusName, {
    sfm: {
      input_images: uploadedImageCount,
      registered_images: null
    }
  });

  await writeJsonToGcs(captureObjectUri(safeCaptureId, "raw/metadata.json"), updatedMetadata);
  await writeJsonToGcs(captureObjectUri(safeCaptureId, "status.json"), status);

  if (shouldStartReconstruction) {
    triggerReconstructionWorker(safeCaptureId).then((result) => {
      if (result.enabled && !result.ok) {
        console.error(`A100 reconstruction trigger failed for ${safeCaptureId}: ${result.stderr || result.stdout || result.exitCode}`);
      }
    }).catch((error) => {
      console.error(`A100 reconstruction trigger failed for ${safeCaptureId}: ${error.message}`);
    });
  }

  sendJson(request, response, 200, {
    capture_id: safeCaptureId,
    status: statusName,
    status_url: `/api/v1/captures/${safeCaptureId}/status`
  });
}

async function handleCaptureStatus(request, response, captureId) {
  const safeCaptureId = validateIdentifier(captureId, "capture_id");
  let status = await loadCaptureStatus(safeCaptureId);
  if (!status) throw new HttpError(404, `Capture ${safeCaptureId} was not found.`);
  status = await maybeStartUnrealImportHandoff(status);
  sendJson(request, response, 200, status);
}

async function handleCaptureArtifacts(request, response, captureId) {
  const safeCaptureId = validateIdentifier(captureId, "capture_id");
  const status = await loadCaptureStatus(safeCaptureId);
  if (!status) throw new HttpError(404, `Capture ${safeCaptureId} was not found.`);
  sendJson(request, response, 200, {
    capture_id: safeCaptureId,
    artifacts: buildCaptureArtifacts(safeCaptureId)
  });
}

async function handleCaptureArtifactDownload(request, response, captureId, artifactType) {
  const safeCaptureId = validateIdentifier(captureId, "capture_id");
  const safeArtifactType = validateTag(artifactType, "artifact_type");
  const status = await loadCaptureStatus(safeCaptureId);
  if (!status) throw new HttpError(404, `Capture ${safeCaptureId} was not found.`);
  const artifact = artifactDefinitionForType(safeCaptureId, safeArtifactType);
  if (!artifact) throw new HttpError(404, `Artifact ${safeArtifactType} is not known for capture ${safeCaptureId}.`);
  const signedUrl = await signGcsUrl(artifact.gcs_uri, { method: "GET" });
  setSecurityHeaders(response);
  setCorsHeaders(request, response);
  response.writeHead(302, {
    Location: signedUrl,
    "Cache-Control": "no-store"
  });
  response.end();
}

async function handleSceneStatus(request, response, sceneId) {
  const safeSceneId = validateIdentifier(sceneId, "scene_id");
  if (safeSceneId === demoSceneId) {
    sendJson(request, response, 200, loadDemoSceneStatus());
    return;
  }
  let captureStatus = await loadCaptureStatus(safeSceneId);
  if (!captureStatus) throw new HttpError(404, `Scene ${safeSceneId} was not found.`);
  captureStatus = await maybeStartUnrealImportHandoff(captureStatus);
  sendJson(request, response, 200, buildSceneStatusFromCapture(captureStatus));
}

async function handleSceneScenarios(request, response, sceneId) {
  const safeSceneId = validateIdentifier(sceneId, "scene_id");
  let scenarioManifests;
  if (safeSceneId !== demoSceneId) {
    let captureStatus = await loadCaptureStatus(safeSceneId);
    if (!captureStatus) throw new HttpError(404, `Scene ${safeSceneId} was not found.`);
    captureStatus = await maybeStartUnrealImportHandoff(captureStatus);
    if (!captureHasReadyUnrealImport(captureStatus)) {
      sendJson(request, response, 200, { scene_id: safeSceneId, scenarios: [] });
      return;
    }
    scenarioManifests = listScenarioManifestsForScene(safeSceneId);
  } else {
    scenarioManifests = demoScenarioIds
      .map((scenarioId) => loadScenarioManifest(scenarioId))
      .filter(Boolean);
  }
  const scenarios = scenarioManifests.map(summarizeScenario);
  sendJson(request, response, 200, {
    scene_id: safeSceneId,
    scenarios
  });
}

async function handleThreatInjectionPlan(request, response, sceneId) {
  const safeSceneId = validateIdentifier(sceneId, "scene_id");
  const plan = loadThreatInjectionPlan(safeSceneId);
  if (!plan) throw new HttpError(404, `Threat injection plan for ${safeSceneId} was not found.`);
  sendJson(request, response, 200, plan);
}

async function handleScenarioManifest(request, response, scenarioId) {
  const manifest = loadScenarioManifest(scenarioId);
  if (!manifest) throw new HttpError(404, `Scenario ${scenarioId} was not found.`);
  sendJson(request, response, 200, manifest);
}

async function handleLaunchScenario(request, response, sceneId, scenarioId) {
  requireJsonRequest(request);
  const safeSceneId = validateIdentifier(sceneId, "scene_id");
  const safeScenarioId = validateIdentifier(scenarioId, "scenario_id");
  const body = await readJsonBody(request).catch(() => ({}));
  const manifest = loadScenarioManifest(safeScenarioId);
  const selectedManifestPath = selectedScenarioManifestPathFromBody(body, safeSceneId);
  if (!manifest && !selectedManifestPath) {
    throw new HttpError(404, `Scenario ${safeScenarioId} was not found.`);
  }
  let captureStatus = null;
  if (safeSceneId !== demoSceneId) {
    captureStatus = await loadCaptureStatus(safeSceneId);
    if (!captureStatus) throw new HttpError(404, `Scene ${safeSceneId} was not found.`);
    captureStatus = await maybeStartUnrealImportHandoff(captureStatus);
    if (!captureHasReadyUnrealImport(captureStatus)) {
      throw new HttpError(409, `Scene ${safeSceneId} is ${captureStatus.status}; wait until Unreal import report and semantic environment are ready before launching Pixel Streaming.`);
    }
  }

  const launchContext = resolvePixelStreamingLaunchContext({
    sceneId: safeSceneId,
    scenarioId: safeScenarioId,
    body,
    captureStatus
  });
  const runId = buildRunId(safeScenarioId);
  const run = {
    run_id: runId,
    scene_id: safeSceneId,
    scenario_id: safeScenarioId,
    created_at_ms: Date.now(),
    status: "launching",
    launch_context: launchContext,
    launch: {
      enabled: workerTriggersEnabled,
      status: workerTriggersEnabled ? "pending" : "mock",
      updated_at: nowIso()
    }
  };
  launchedRuns.set(runId, run);

  triggerPixelStreamingLaunch({
    sceneId: safeSceneId,
    scenarioId: safeScenarioId,
    runId,
    ...launchContext
  }).then((result) => {
    if (result.enabled && !result.ok) {
      run.status = "failed";
      run.launch = {
        enabled: true,
        status: "failed",
        exit_code: result.exitCode,
        log_hint: commandOutputHint(result, "Pixel Streaming launch command failed."),
        updated_at: nowIso()
      };
      console.error(`Pixel Streaming launch trigger failed for ${runId}: ${result.stderr || result.stdout || result.exitCode}`);
      return;
    }
    const statusPayload = parseJsonObjectFromText(result.stdout);
    run.launch = {
      enabled: Boolean(result.enabled),
      status: result.enabled ? "submitted" : "mock",
      exit_code: result.exitCode,
      log_hint: statusPayload ? l4LogHint(statusPayload) : "",
      updated_at: nowIso()
    };
    if (statusPayload) run.l4_status = statusPayload;
    if (statusPayload?.ready === true) run.status = "ready";
  }).catch((error) => {
    run.status = workerTriggersEnabled ? "failed" : "launching";
    run.launch = {
      enabled: workerTriggersEnabled,
      status: workerTriggersEnabled ? "failed" : "mock",
      log_hint: error.message,
      updated_at: nowIso()
    };
    console.error(`Pixel Streaming launch trigger failed for ${runId}: ${error.message}`);
  });

  sendJson(request, response, 202, {
    run_id: runId,
    scene_id: safeSceneId,
    scenario_id: safeScenarioId,
    status: "launching",
    stream: {
      status: "launching",
      embed_url: null,
      poll_url: `/api/v1/runs/${runId}/stream`,
      launch: {
        map_path: launchContext.mapPath || null,
        scenario_manifest_path: launchContext.scenarioManifestPath,
        semantic_environment_path: launchContext.semanticEnvironmentPath || null
      }
    }
  });
}

async function handleRunStream(request, response, runId) {
  const safeRunId = String(runId || "").trim();
  const run = runRecordForId(safeRunId);
  if (!run) throw new HttpError(404, `Run ${safeRunId} was not found.`);
  const state = await resolveRunStreamState(run);
  run.status = state.status;
  sendJson(request, response, 200, {
    run_id: safeRunId,
    status: state.status,
    stream: {
      status: state.status,
      provider: "unreal_pixel_streaming",
      embed_url: state.ready ? streamEmbedUrl(safeRunId) : null,
      signaling_url: state.ready ? streamSignalingUrl() : null,
      expires_at: state.ready ? new Date(Date.now() + streamTtlMs).toISOString() : null,
      log_hint: state.logHint || null,
      l4_status: state.l4Status || null
    }
  });
}

async function handleRunTelemetry(request, response, runId) {
  const safeRunId = String(runId || "").trim();
  const run = runRecordForId(safeRunId);
  if (!run) throw new HttpError(404, `Run ${safeRunId} was not found.`);
  const telemetry = rewriteTelemetryForRun(readFixtureJson("telemetry", "mock_hallway_delay_log.json"), run);
  const url = new URL(request.url, "http://local");
  const tail = Number(url.searchParams.get("tail"));
  if (Number.isInteger(tail) && tail > 0) {
    telemetry.events = telemetry.events.slice(-tail);
  }
  sendJson(request, response, 200, telemetry);
}

async function handleRunArtifacts(request, response, runId) {
  const safeRunId = String(runId || "").trim();
  const run = runRecordForId(safeRunId);
  if (!run) throw new HttpError(404, `Run ${safeRunId} was not found.`);
  sendJson(request, response, 200, {
    run_id: safeRunId,
    artifacts: [
      {
        artifact_type: "scenario_manifest",
        content_type: "application/json",
        url: `/api/v1/scenarios/${run.scenario_id}/manifest`
      },
      {
        artifact_type: "telemetry_log",
        content_type: "application/json",
        url: `/api/v1/runs/${safeRunId}/telemetry`
      },
      {
        artifact_type: "after_action_review",
        content_type: "text/markdown",
        url: `/api/v1/runs/${safeRunId}/aar`
      }
    ]
  });
}

async function handleRunAar(request, response, runId) {
  const safeRunId = String(runId || "").trim();
  const run = runRecordForId(safeRunId);
  if (!run) throw new HttpError(404, `Run ${safeRunId} was not found.`);
  const markdown = readFixtureText("aar", "mock_hallway_delay_log_aar.md")
    .replaceAll(demoRunId, safeRunId)
    .replaceAll("scan_hallway_delay_001", run.scenario_id);
  sendJson(request, response, 200, {
    run_id: safeRunId,
    scenario_id: run.scenario_id,
    content_type: "text/markdown",
    markdown
  });
}

async function handleSemanticEnvironmentArtifact(request, response, sceneId) {
  const safeSceneId = validateIdentifier(sceneId, "scene_id");
  if (safeSceneId !== demoSceneId) throw new HttpError(404, `Semantic environment ${safeSceneId} was not found.`);
  sendJson(request, response, 200, readFixtureJson("semantic_environments", "scanned_hallway_alpha.json"));
}

const server = http.createServer(async (request, response) => {
  try {
    if (!isAllowedOrigin(request)) {
      sendJson(request, response, 403, { error: "Origin is not allowed for this local bridge." });
      return;
    }

    if (request.method === "OPTIONS") {
      setSecurityHeaders(response);
      setCorsHeaders(request, response);
      response.writeHead(204);
      response.end();
      return;
    }

    const pathname = getPathname(request.url);

    if (request.method === "GET" && pathname === "/api/health") {
      sendJson(request, response, 200, { ok: true, service: "adaptsim-api" });
      return;
    }

    if (request.method === "GET" && pathname === "/api/v1/health") {
      sendJson(request, response, 200, { ok: true, service: "adaptsim-control-api", schema_version: schemaVersion });
      return;
    }

    if (request.method === "GET" && pathname === "/api/v1/demo/safety-park/source-images") {
      handleSafetyParkDemoSourceImages(request, response);
      return;
    }

    const safetyParkDemoImageMatch = pathname?.match(/^\/api\/v1\/demo\/safety-park\/source-images\/([^/]+)$/);
    if (request.method === "GET" && safetyParkDemoImageMatch) {
      streamSafetyParkDemoImage(request, response, safetyParkDemoImageMatch[1]);
      return;
    }

    if (request.method === "POST" && pathname === "/api/google-sheets/calendar") {
      await handleCalendarSync(request, response);
      return;
    }

    if (request.method === "POST" && pathname === "/api/vision/photo") {
      await handlePhotoVision(request, response);
      return;
    }

    if (request.method === "GET" && (pathname === "/api/generative-assets/sessions" || pathname === "/api/v1/generative-assets/sessions")) {
      await handleListGeneratedAssetSessions(request, response);
      return;
    }

    if (request.method === "POST" && (pathname === "/api/generative-assets/sessions" || pathname === "/api/v1/generative-assets/sessions")) {
      await handleCreateGeneratedAssetSession(request, response);
      return;
    }

    const generatedSessionMatch = pathname?.match(/^\/api(?:\/v1)?\/generative-assets\/sessions\/([a-z0-9_]+)$/i);
    if (request.method === "GET" && generatedSessionMatch) {
      await handleGeneratedAssetSession(request, response, generatedSessionMatch[1]);
      return;
    }

    const trellisRelayMatch = pathname?.match(/^\/api(?:\/v1)?\/generative-assets\/sessions\/([a-z0-9_]+)\/trellis$/i);
    if (request.method === "POST" && trellisRelayMatch) {
      await handleRelayTrellisSession(request, response, trellisRelayMatch[1]);
      return;
    }

    if (request.method === "POST" && pathname === "/api/v1/captures") {
      await handleCreateCapture(request, response);
      return;
    }

    let match = pathname?.match(/^\/api\/v1\/captures\/([^/]+)\/upload-urls$/);
    if (request.method === "POST" && match) {
      await handleUploadUrls(request, response, match[1]);
      return;
    }

    match = pathname?.match(/^\/api\/v1\/captures\/([^/]+)\/submit$/);
    if (request.method === "POST" && match) {
      await handleSubmitCapture(request, response, match[1]);
      return;
    }

    match = pathname?.match(/^\/api\/v1\/captures\/([^/]+)\/status$/);
    if (request.method === "GET" && match) {
      await handleCaptureStatus(request, response, match[1]);
      return;
    }

    match = pathname?.match(/^\/api\/v1\/captures\/([^/]+)\/artifacts$/);
    if (request.method === "GET" && match) {
      await handleCaptureArtifacts(request, response, match[1]);
      return;
    }

    match = pathname?.match(/^\/api\/v1\/captures\/([^/]+)\/artifacts\/([^/]+)$/);
    if (request.method === "GET" && match) {
      await handleCaptureArtifactDownload(request, response, match[1], match[2]);
      return;
    }

    match = pathname?.match(/^\/api\/v1\/scenes\/([^/]+)\/status$/);
    if (request.method === "GET" && match) {
      await handleSceneStatus(request, response, match[1]);
      return;
    }

    match = pathname?.match(/^\/api\/v1\/scenes\/([^/]+)\/scenarios$/);
    if (request.method === "GET" && match) {
      await handleSceneScenarios(request, response, match[1]);
      return;
    }

    match = pathname?.match(/^\/api\/v1\/scenes\/([^/]+)\/threat-injection-plan$/);
    if (request.method === "GET" && match) {
      await handleThreatInjectionPlan(request, response, match[1]);
      return;
    }

    match = pathname?.match(/^\/api\/v1\/scenarios\/([^/]+)\/manifest$/);
    if (request.method === "GET" && match) {
      await handleScenarioManifest(request, response, match[1]);
      return;
    }

    match = pathname?.match(/^\/api\/v1\/scenes\/([^/]+)\/scenarios\/([^/]+)\/launch$/);
    if (request.method === "POST" && match) {
      await handleLaunchScenario(request, response, match[1], match[2]);
      return;
    }

    match = pathname?.match(/^\/api\/v1\/runs\/([^/]+)\/stream$/);
    if (request.method === "GET" && match) {
      await handleRunStream(request, response, match[1]);
      return;
    }

    match = pathname?.match(/^\/api\/v1\/runs\/([^/]+)\/telemetry$/);
    if (request.method === "GET" && match) {
      await handleRunTelemetry(request, response, match[1]);
      return;
    }

    match = pathname?.match(/^\/api\/v1\/runs\/([^/]+)\/artifacts$/);
    if (request.method === "GET" && match) {
      await handleRunArtifacts(request, response, match[1]);
      return;
    }

    match = pathname?.match(/^\/api\/v1\/runs\/([^/]+)\/aar$/);
    if (request.method === "GET" && match) {
      await handleRunAar(request, response, match[1]);
      return;
    }

    match = pathname?.match(/^\/api\/v1\/artifacts\/semantic_environments\/([^/]+)$/);
    if (request.method === "GET" && match) {
      await handleSemanticEnvironmentArtifact(request, response, match[1]);
      return;
    }

    if (request.method === "GET" || request.method === "HEAD") {
      const filePath = resolveStaticPath(request.url);
      if (filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        sendFile(response, filePath, { body: request.method !== "HEAD" });
        return;
      }
    }

    sendJson(request, response, 404, { error: "Not found." });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    sendJson(request, response, statusCode, { error: error.message || "Unexpected server error." });
  }
});

server.requestTimeout = 20000;
server.headersTimeout = 22000;

server.on("clientError", (_error, socket) => {
  socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

server.on("error", (error) => {
  console.error(`AdaptSim API failed to start: ${error.message}`);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`AdaptSim API listening on http://${host}:${port}`);
});
