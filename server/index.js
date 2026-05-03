const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const { execFile } = require("node:child_process");

let createTesseractWorker = null;
let tesseractPsm = null;
let sharp = null;
try {
  ({ createWorker: createTesseractWorker, PSM: tesseractPsm } = require("tesseract.js"));
} catch {}
try {
  sharp = require("sharp");
} catch {}

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";
const serverDir = __dirname;
const projectRoot = path.resolve(serverDir, "..");
const webDistDir = path.join(projectRoot, "apps/web/dist");
const webPublicDir = path.join(projectRoot, "apps/web/public");
const dataDir = process.env.DATA_DIR || path.join(webPublicDir, "data");
const staticRoot = process.env.STATIC_ROOT || webDistDir;
const maxBodyBytes = Number(process.env.MAX_BODY_BYTES || 32 * 1024);
const maxVisionBodyBytes = Number(process.env.MAX_VISION_BODY_BYTES || 8 * 1024 * 1024);
const maxCsvBytes = Number(process.env.MAX_CSV_BYTES || 2 * 1024 * 1024);
const maxRows = Number(process.env.MAX_SYNC_ROWS || 2000);
const upstreamTimeoutMs = Number(process.env.UPSTREAM_TIMEOUT_MS || 15000);
const openGeoLookupTimeoutMs = Number(process.env.OPEN_GEO_LOOKUP_TIMEOUT_MS || 6500);
const openGeoImageLookupEnabled = process.env.OPEN_GEO_IMAGE_LOOKUP !== "0";
const commonsApiUrl = process.env.WIKIMEDIA_COMMONS_API_URL || "https://commons.wikimedia.org/w/api.php";
const commonsUserAgent = process.env.COMMONS_USER_AGENT || "AdaptSim/0.1 local open-geolocation evidence prototype";
const openPlaceEvidencePath = process.env.OPEN_PLACE_EVIDENCE_PATH || path.join(dataDir, "open-place-evidence.json");
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

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
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
}

function isAllowedOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    if (originUrl.host === request.headers.host) return true;
  } catch {}

  return allowedOrigins.has(origin);
}

function setCorsHeaders(request, response) {
  const origin = request.headers.origin;
  if (!origin || !allowedOrigins.has(origin)) return;
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
          resolve({ command, available: false, ok: false, stdout: "", stderr: "not installed" });
          return;
        }
        resolve({
          command,
          available: true,
          ok: !error,
          stdout: String(stdout).slice(0, options.textLimit || 12000),
          stderr: String(stderr || error?.message || "").slice(0, 1000)
        });
      }
    );
  });
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
  return {
    source: "Open place evidence",
    database: "AdaptSim open place evidence",
    title: clampServerText(place.name, 160, "Known place"),
    url: primarySource?.url || "",
    thumbnailUrl: "",
    lat: Number(place.lat),
    lon: Number(place.lon),
    confidence,
    score: Number(match.score.toFixed(3)),
    reason: `Matched readable/interpretable image clue "${match.alias || place.name}" to a sourced place record${place.address ? ` at ${place.address}` : ""}.`,
    matchedQuery: clampServerText(match.alias || place.name, 140),
    license: "",
    sourceLinks: Array.isArray(place.sources) ? place.sources.slice(0, 4) : []
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
    url: imageInfo.descriptionurl || imageInfo.descriptionshorturl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
    thumbnailUrl: imageInfo.thumburl || "",
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

    if (request.method === "POST" && pathname === "/api/google-sheets/calendar") {
      await handleCalendarSync(request, response);
      return;
    }

    if (request.method === "POST" && pathname === "/api/vision/photo") {
      await handlePhotoVision(request, response);
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
