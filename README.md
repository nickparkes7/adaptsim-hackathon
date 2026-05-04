# AdaptSim

AdaptSim is now organized as a frontend-first workspace with a clear backend boundary. The current product surface is the React workbench in `apps/web`; the local Node API bridge lives in `server`; the public military disposition database and generation tooling remain at the repo root for backend/data work.

AdaptSim was created for the 2026 National Security Hackathon.

Project demo video: [Loom walkthrough](https://www.loom.com/share/277f5654db6f42ed8a00a99a47fa1dff)

## Repo Layout

- `apps/web`: React + Vite frontend. UI components live in `src/components`, the migrated geospatial/workflow controller lives in `src/lib/adaptsimWorkbench.js`, and browser-served JSON lives in `public/data`.
- `server`: Node API bridge for health checks, Google Sheets CSV sync, and local/photo vision intake.
- `military_disposition_db`: source database, exports, schema, and Python generation scripts.
- `scripts`: repo-level data builders and smoke checks.
- `docs`: product and infrastructure notes, including the hackathon brief and legacy Cosmos setup notes.
- `skills`: AdaptSim VM helper skill material retained from the hackathon workspace.

## Run Locally

Install dependencies:

```bash
npm install
```

Run the web app and API bridge in two terminals:

```bash
npm run dev
npm run dev:api
```

Open `http://127.0.0.1:5173`. Vite proxies `/api/*` to `http://127.0.0.1:8787`.

For the Safety Park Pixel Streaming demo, start the full local stack with:

```bash
npm run demo:start
```

This runs the API and frontend in `tmux` sessions, checks the L4 Pixel Streaming path, and points the app at `http://34.139.126.187/player.html`. Useful follow-ups:

```bash
npm run demo:status
npm run demo:logs
npm run demo:stop
```

Build the React app and serve it through the Node bridge:

```bash
npm run build
npm start
```

Then open `http://127.0.0.1:8787`.

## Checks

Run the main build and syntax checks:

```bash
npm run check
```

Run randomized photo-geolocation checks through the same local backend endpoint used by the app:

```bash
npm run check:geo -- --samples 8
```

For Google Street View, use the official Static API:

```bash
GOOGLE_MAPS_API_KEY=... npm run check:geo -- --google-streetview --samples 4
```

## Data Flow

Frontend runtime JSON is served from `apps/web/public/data`.

Regenerate the disposition index after updating `military_disposition_db`:

```bash
npm run build-disposition-index
```

The local API bridge reads the same `apps/web/public/data` directory by default. Override with `DATA_DIR=/path/to/data` when needed.

## Safety Boundary

AdaptSim should stay focused on training simulation and controlled scenario rehearsal. The project should avoid live operational targeting, live force locations, tactical routing, readiness inference, or claims that scenario likelihoods are calibrated intelligence predictions.
