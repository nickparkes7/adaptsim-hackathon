import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";

const rootDir = path.resolve(import.meta.dirname, "..");
const evidencePath = path.join(rootDir, "apps/web/public/data/open-place-evidence.json");
const defaultPort = 8794;
const distancePassMeters = 500;

function parseArgs(argv) {
  const args = {
    samples: 8,
    seed: String(Date.now()),
    port: defaultPort,
    googleStreetView: false,
    failGoogle: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--samples") args.samples = Math.max(1, Number(argv[++index] || args.samples));
    else if (arg === "--seed") args.seed = String(argv[++index] || args.seed);
    else if (arg === "--port") args.port = Number(argv[++index] || args.port);
    else if (arg === "--google-streetview") args.googleStreetView = true;
    else if (arg === "--fail-google") args.failGoogle = true;
  }

  return args;
}

function createRng(seed) {
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return () => {
    hash += 0x6d2b79f5;
    let value = hash;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function pick(items, rng) {
  return items[Math.floor(rng() * items.length) % items.length];
}

function jitter(value, amount, rng) {
  return value + (rng() * 2 - 1) * amount;
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function wrapWords(text, maxChars = 24) {
  const words = String(text || "").replace(/\s+/g, " ").trim().split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = [line, word].filter(Boolean).join(" ");
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function buildSyntheticSvg(place, rng, sampleIndex) {
  const width = 1280;
  const height = 720;
  const alias = pick([place.name, place.address, ...(place.aliases || [])].filter(Boolean), rng);
  const cityLine = [place.city, place.country].filter(Boolean).join(", ");
  const signLines = [
    ...wrapWords(alias.toUpperCase(), 24),
    rng() > 0.35 ? place.category?.split(/\s+/).slice(0, 3).join(" ").toUpperCase() : "",
    rng() > 0.25 ? place.address : "",
    rng() > 0.45 ? cityLine : ""
  ].filter(Boolean).slice(0, 5);
  const signX = Math.round(jitter(170, 90, rng));
  const signY = Math.round(jitter(250, 70, rng));
  const signW = Math.round(jitter(720, 120, rng));
  const signH = Math.round(120 + signLines.length * 42);
  const angle = jitter(0, 2.2, rng);
  const palette = pick([
    { wall: "#f1dfbf", roof: "#a94728", sign: "#f8fbff", stroke: "#1f55a6", ink: "#17386d" },
    { wall: "#ead6b0", roof: "#754e32", sign: "#ffffff", stroke: "#204f88", ink: "#23456b" },
    { wall: "#f6e6c8", roof: "#b45b2f", sign: "#fffdf5", stroke: "#7a2f2a", ink: "#17233a" }
  ], rng);

  const lineMarkup = signLines.map((line, index) => {
    const size = index === 0 ? 46 : index === 1 ? 40 : 31;
    const y = 58 + index * 42;
    return `<text x="${signW / 2}" y="${y}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${index <= 1 ? 800 : 650}" fill="${palette.ink}">${escapeXml(line)}</text>`;
  }).join("");

  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#0c8ff2"/>
          <stop offset="1" stop-color="#88d7ff"/>
        </linearGradient>
        <filter id="softNoise">
          <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="2" result="noise"/>
          <feColorMatrix type="saturate" values="0.2"/>
          <feBlend in="SourceGraphic" in2="noise" mode="multiply"/>
        </filter>
      </defs>
      <rect width="1280" height="720" fill="url(#sky)"/>
      <rect x="0" y="210" width="1280" height="350" fill="${palette.wall}" filter="url(#softNoise)"/>
      <rect x="760" y="180" width="340" height="250" fill="${palette.roof}" transform="skewX(-8)"/>
      <rect x="830" y="320" width="350" height="210" fill="#c56a34"/>
      <rect x="0" y="560" width="1280" height="160" fill="#d8bd84"/>
      <path d="M0 642 C260 600 445 594 730 628 C945 656 1125 628 1280 604 L1280 720 L0 720 Z" fill="#b44b42" opacity="0.78"/>
      <circle cx="102" cy="526" r="58" fill="#4a9d52"/>
      <circle cx="1135" cy="470" r="72" fill="#3b9c4a"/>
      <g transform="translate(${signX} ${signY}) rotate(${angle})">
        <rect width="${signW}" height="${signH}" rx="12" fill="${palette.sign}" stroke="${palette.stroke}" stroke-width="8"/>
        ${lineMarkup}
      </g>
      <text x="24" y="704" font-family="Arial" font-size="14" fill="#846f48">randomized geolocation check ${sampleIndex + 1}</text>
    </svg>
  `;
}

async function syntheticCase(place, rng, sampleIndex) {
  const svg = Buffer.from(buildSyntheticSvg(place, rng, sampleIndex));
  const jpeg = await sharp(svg)
    .rotate(jitter(0, 0.6, rng), { background: "#f0dfbf" })
    .jpeg({ quality: Math.round(jitter(84, 8, rng)) })
    .toBuffer();
  return {
    kind: "synthetic-sign",
    fileName: `${place.id || "place"}-${sampleIndex + 1}.jpg`,
    mimeType: "image/jpeg",
    buffer: jpeg,
    expected: place
  };
}

async function googleStreetViewCase(place, rng, sampleIndex, apiKey) {
  const heading = Math.round(rng() * 360);
  const pitch = Math.round(jitter(0, 6, rng));
  const fov = Math.round(jitter(82, 15, rng));
  const metadataUrl = new URL("https://maps.googleapis.com/maps/api/streetview/metadata");
  metadataUrl.searchParams.set("location", `${place.lat},${place.lon}`);
  metadataUrl.searchParams.set("source", "outdoor");
  metadataUrl.searchParams.set("key", apiKey);
  const metadata = await fetch(metadataUrl).then((response) => response.json()).catch(() => null);
  if (!metadata || metadata.status !== "OK") return null;

  const imageUrl = new URL("https://maps.googleapis.com/maps/api/streetview");
  imageUrl.searchParams.set("size", "640x640");
  imageUrl.searchParams.set("location", `${place.lat},${place.lon}`);
  imageUrl.searchParams.set("heading", String(heading));
  imageUrl.searchParams.set("pitch", String(pitch));
  imageUrl.searchParams.set("fov", String(fov));
  imageUrl.searchParams.set("source", "outdoor");
  imageUrl.searchParams.set("key", apiKey);
  const response = await fetch(imageUrl);
  if (!response.ok || !String(response.headers.get("content-type") || "").startsWith("image/")) return null;
  return {
    kind: "google-streetview-static-api",
    fileName: `${place.id || "place"}-streetview-${sampleIndex + 1}.jpg`,
    mimeType: "image/jpeg",
    buffer: Buffer.from(await response.arrayBuffer()),
    expected: place
  };
}

function startServer(port) {
  const child = spawn("node", ["index.js"], {
    cwd: path.join(rootDir, "server"),
    env: {
      ...process.env,
      PORT: String(port),
      OPENAI_VISION_ENABLED: process.env.OPENAI_VISION_ENABLED || "0",
      OPEN_GEO_IMAGE_LOOKUP: process.env.OPEN_GEO_IMAGE_LOOKUP || "0",
      DATA_DIR: process.env.DATA_DIR || path.join(rootDir, "apps/web/public/data")
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("server startup timed out")), 10000);
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      process.stdout.write(text);
      if (text.includes(`http://127.0.0.1:${port}`)) {
        clearTimeout(timeout);
        resolve(child);
      }
    });
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.on("exit", (code) => {
      if (code) reject(new Error(`server exited with code ${code}`));
    });
  });
}

async function runCase(baseUrl, testCase) {
  const response = await fetch(`${baseUrl}/api/vision/photo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: testCase.fileName,
      mimeType: testCase.mimeType,
      imageDataUrl: `data:${testCase.mimeType};base64,${testCase.buffer.toString("base64")}`
    })
  });
  const payload = await response.json();
  const candidates = payload.analysis?.possibleLocations || [];
  const best = candidates
    .filter((candidate) => Number.isFinite(Number(candidate.lat)) && Number.isFinite(Number(candidate.lon)))
    .map((candidate) => ({
      ...candidate,
      distanceMeters: distanceMeters(
        Number(testCase.expected.lat),
        Number(testCase.expected.lon),
        Number(candidate.lat),
        Number(candidate.lon)
      )
    }))
    .sort((left, right) => left.distanceMeters - right.distanceMeters)[0];
  const pass = Boolean(best && best.distanceMeters <= distancePassMeters);
  return { status: response.status, payload, best, pass };
}

function distanceMeters(latA, lonA, latB, lonB) {
  const radius = 6371000;
  const toRad = (degrees) => degrees * Math.PI / 180;
  const dLat = toRad(latB - latA);
  const dLon = toRad(lonB - lonA);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rng = createRng(args.seed);
  const places = JSON.parse(fs.readFileSync(evidencePath, "utf8")).places
    .filter((place) => Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lon)));
  if (!places.length) throw new Error("No coordinate-bearing open place evidence records found.");

  const cases = [];
  for (let index = 0; index < args.samples; index += 1) {
    cases.push(await syntheticCase(pick(places, rng), rng, index));
  }

  const googleKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_STREET_VIEW_API_KEY || "";
  if (args.googleStreetView && googleKey) {
    for (let index = 0; index < Math.min(args.samples, places.length); index += 1) {
      const streetViewCase = await googleStreetViewCase(pick(places, rng), rng, index, googleKey);
      if (streetViewCase) cases.push(streetViewCase);
    }
  } else if (args.googleStreetView) {
    console.log("Skipping Google Street View Static API checks: GOOGLE_MAPS_API_KEY is not set.");
  }

  const server = await startServer(args.port);
  const baseUrl = `http://127.0.0.1:${args.port}`;
  const results = [];
  try {
    for (const testCase of cases) {
      const result = await runCase(baseUrl, testCase);
      results.push({ testCase, result });
      const expected = `${testCase.expected.name} (${testCase.expected.lat}, ${testCase.expected.lon})`;
      const actual = result.best
        ? `${result.best.name || "Unnamed"} ${Math.round(result.best.distanceMeters)}m ${result.best.confidence || ""}`
        : "no coordinate candidate";
      console.log(`${result.pass ? "PASS" : "FAIL"} ${testCase.kind} ${testCase.fileName}: expected ${expected}; got ${actual}`);
    }
  } finally {
    server.kill("SIGTERM");
  }

  const hardFailures = results.filter(({ testCase, result }) =>
    !result.pass && (testCase.kind !== "google-streetview-static-api" || args.failGoogle)
  );
  const passed = results.length - hardFailures.length;
  console.log(`\n${passed}/${results.length} checks accepted with seed ${args.seed}.`);
  if (hardFailures.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
