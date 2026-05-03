# AdaptSim Demo Runbook

Last updated: 2026-05-03 UTC.

This is the final integrated demo path for the current AdaptSim hackathon slice.
The preferred three-minute story uses the cached `safety_park` capture, the
generated threat-vector asset database, the gameplay intelligence/threat
injection plan, the A100/L4 handoff artifacts, and Pixel Streaming. The imported
horror corridor remains the fastest Unreal runtime fallback proof for
ScenarioDirector, adversary spawning, JSONL telemetry, deterministic AAR, and
Pixel Streaming when the safety-park path is unavailable.

## Demo Thesis

AdaptSim turns a scanned or place-like environment into a reusable Unreal
training space, derives plausible threat vectors for that environment, runs
structured scenario variants against semantic anchors, records runtime facts,
and generates an after-action review from telemetry rather than from an invented
narrative.

## Current Truth Table

| Area | Status | Evidence |
| --- | --- | --- |
| Safety-park golden MVP | Pass when verifier completes | `scripts/integration/safety_park_golden_mvp.sh` stages current local contracts/workers/scripts to the VMs, seeds `safety_park`, runs A100 reconstruction, L4 import, API launch, stream status, telemetry, and AAR checks. Reports land under `docs/integration_logs/`. |
| Threat asset database | Pass | `contracts/examples/generated_asset_databases/threat_vector_asset_database.json` contains UAV/FPV, UGV/vehicle, USV, inert equipment, sensor/payload, and adversary-runtime metadata instead of decorative prop cards. |
| Threat injection plan | Pass | `contracts/examples/gameplay_intelligence/safety_park/threat_injection_plan.json` explains scene affordances, threat vectors, triggers, runtime bindings, and review gates for generated assets. |
| Horror corridor map | Pass | `/Game/AdaptSim/Maps/L_HorrorCorridor_Imported` opens and is the default game/editor map on the VM. |
| Semantic anchors | Pass with TargetPoint caveat | Confirmed export has `entry`, `exit`, `hallway_center`, `doorway`, `cover`, `ambush_point`, `observation_point`, and `chokepoint`. |
| Scenario manifests | Pass | Local examples validate and were synced to `$PROJECT/Saved/AdaptSimContractExamples`. |
| Ambush scenario | Pass | Fresh 30-second Integration Marshal run wrote `Saved/AdaptSimTelemetry/horror_corridor_ambush_delay_001_20260503T030408Z.jsonl`. |
| Real adversary actor | Pass | `AdaptSimAdversaryCharacter` spawned for `adversary_rifleman_irregular`. |
| Observer scenario | Partial pass | Runs and spawns an adversary, but it resolves to accepted fallback placement instead of the named `observation_point`. |
| Telemetry JSONL | Pass | ScenarioDirector writes `telemetry_event` JSONL under `$PROJECT/Saved/AdaptSimTelemetry`. |
| AAR from real telemetry | Pass | `contracts/examples/aar/horror_corridor_ambush_delay_001_live_aar.md` generated from fresh VM JSONL. |
| Input key `1` | Pass, with trigger caveat | `AAdaptSimDemoPlayerController` logged `demo_input_received key=1` and `scenario_started` with `-AdaptSimDemoInputStart`; adversary spawn still depends on the manifest's chokepoint trigger or automation fire-all. |
| Game-mode visual | Pass | Screenshot `contracts/examples/telemetry/horror_corridor_ambush_delay_001_visual.png` shows the bright adversary marker in the corridor; the text label is mirrored from that camera angle. |
| Pixel Streaming | Pass in clean browser, script-managed | `PixelStreaming2` is enabled and signalling serves port `80`. `scripts/pixel-streaming/*` now provides launch, restart, stop, TURN relay setup, and JSON status commands for Control API shell-out. On 2026-05-03, the repeated `WEBRTC CONNECTION NEGOTIATED` stall was traced to blocked direct ICE candidates on `49152+`; the durable no-admin fix is coturn on public `443` plus `iceTransportPolicy=relay`. Old tabs can remain stale; close the tab or use a cache-busting URL before retesting. |
| Frontend app | Pass for MVP lane | `apps/web` is a React/Vite app. `CaptureSimulationFlow.jsx` covers capture upload, generated threat asset database status, Trellis threat visual status, threat injection plan, scenario launch, stream embed/link, telemetry, artifacts, and AAR. |

## Local Setup

```bash
cd /Users/nicholas.parkes/Repos/adaptsim-hackathon
```

Validate contracts and tests:

```bash
python3 contracts/validate_contracts.py contracts/examples
python3 -m unittest contracts.test_aar_generator
```

Expected integrated validation result:

```text
OK: validated ... file(s)
```

The exact count changes as new safety-park, generated asset database, and
gameplay intelligence fixtures land. Treat exit code `0` as the contract
acceptance signal.

## VM Setup

SSH to the Unreal / Pixel Streaming VM:

```bash
gcloud compute ssh --zone "us-east1-d" "linux-pixel-streaming" --project "gecko-dev-fde" --tunnel-through-iap
```

Set the common variables on the VM:

```bash
export UE="/home/nicholas.parkes/tools/unreal/UnrealEngine-5.7.4"
export PROJECT="/home/nicholas.parkes/Documents/Unreal Projects/AdaptSim"
export UPROJECT="$PROJECT/AdaptSim.uproject"
cd "$PROJECT"
```

Optional health checks:

```bash
nvidia-smi
df -h
free -h
systemctl is-active coturn
```

## VM Repo Checkout

The local server triggers expect both VMs to have this repo at
`~/adaptsim/repos/adaptsim-hackathon`. For a persistent VM checkout, keep both
VM mirrors on the same committed `origin/main` checkpoint that the local server
is running. For the golden verifier, the script stages the current local
`contracts`, `workers`, `unreal`, and `scripts/pixel-streaming` slices into a
run-specific VM directory, so it can test local agent output before it is merged
to the persistent VM mirror.

Preserve any previous VM mirror by moving it aside; do not delete VM files,
Docker images, model caches, captures, or Unreal project files.

Expected remote executable paths:

```text
A100: ~/adaptsim/repos/adaptsim-hackathon/workers/a100-reconstruction/adaptsim-reconstruct
A100: ~/adaptsim/repos/adaptsim-hackathon/workers/asset-generation/adaptsim-generate-asset
L4:   ~/adaptsim/repos/adaptsim-hackathon/workers/l4-unreal-import/adaptsim-import-capture
L4:   ~/adaptsim/repos/adaptsim-hackathon/scripts/pixel-streaming/adaptsim-pixel-streaming.sh
L4:   ~/adaptsim/repos/adaptsim-hackathon/scripts/pixel-streaming/vm_pixel_streaming.sh
```

Read-only verification:

```bash
gcloud compute ssh --zone "us-east1-b" "a100-instance-02" --tunnel-through-iap --project "gecko-dev-fde" \
  --command 'test -x ~/adaptsim/repos/adaptsim-hackathon/workers/a100-reconstruction/adaptsim-reconstruct && test -x ~/adaptsim/repos/adaptsim-hackathon/workers/asset-generation/adaptsim-generate-asset'

gcloud compute ssh --zone "us-east1-d" "linux-pixel-streaming" --project "gecko-dev-fde" --tunnel-through-iap \
  --command 'test -x ~/adaptsim/repos/adaptsim-hackathon/workers/l4-unreal-import/adaptsim-import-capture && test -x ~/adaptsim/repos/adaptsim-hackathon/scripts/pixel-streaming/adaptsim-pixel-streaming.sh && test -x ~/adaptsim/repos/adaptsim-hackathon/scripts/pixel-streaming/vm_pixel_streaming.sh'
```

## Control API Worker Triggers

Local server SSH triggers use `gcloud compute ssh --tunnel-through-iap`.

Real command overrides:

```bash
export ADAPTSIM_A100_RECONSTRUCT_COMMAND='cd ~/adaptsim/repos/adaptsim-hackathon && workers/a100-reconstruction/adaptsim-reconstruct --capture-id {capture_id} --gcs-root {gcs_root}'
export ADAPTSIM_L4_LAUNCH_COMMAND='cd ~/adaptsim/repos/adaptsim-hackathon && PROJECT="/home/nicholas.parkes/Documents/Unreal Projects/AdaptSim" ADAPTSIM_MAP_PATH="{map_path}" ADAPTSIM_SCENARIO_MANIFEST="{scenario_manifest_path}" ADAPTSIM_SEMANTIC_ENVIRONMENT="{semantic_environment_path}" scripts/pixel-streaming/adaptsim-pixel-streaming.sh restart'
export ADAPTSIM_L4_STATUS_COMMAND='cd ~/adaptsim/repos/adaptsim-hackathon && scripts/pixel-streaming/adaptsim-pixel-streaming.sh status'
```

Server trigger dry-run without launching workers:

```bash
export ADAPTSIM_ENABLE_WORKER_TRIGGERS=1
export ADAPTSIM_A100_RECONSTRUCT_COMMAND='printf "DRY RUN A100 capture={capture_id} gcs={gcs_root}\n"'
export ADAPTSIM_L4_LAUNCH_COMMAND='printf "DRY RUN L4 scene={scene_id} scenario={scenario_id} run={run_id} map={map_path} manifest={scenario_manifest_path} semantic={semantic_environment_path}\n"'
export ADAPTSIM_L4_STATUS_COMMAND='printf "{\"status\":\"launching\",\"ready\":false,\"provider\":\"unreal_pixel_streaming\",\"components\":{\"signalling\":{\"log_file\":\"dry-run-wilbur.log\"},\"unreal\":{\"log_file\":\"dry-run-unreal.log\"}}}\n"'
```

With those dry-run overrides, the API still exercises local `gcloud`, IAP, SSH,
and server placeholder substitution, but the remote launch command only prints
text.

For imported captures, the Control API resolves the Pixel Streaming launch
context before shelling out:

```text
ADAPTSIM_MAP_PATH = capture status unreal.level_path
ADAPTSIM_SCENARIO_MANIFEST = selected manifest path from the launch body, or /home/nicholas.parkes/adaptsim/data/captures/<capture_id>/scenario_manifests/<scenario_id>.json
ADAPTSIM_SEMANTIC_ENVIRONMENT = /home/nicholas.parkes/adaptsim/data/captures/<capture_id>/unreal/semantic_environment.json
```

Accepted launch-body aliases for the selected manifest include
`scenario_manifest_path`, `selected_manifest_path`, and `manifest_path`. The API
also accepts `map_path` and `semantic_environment_path` when a manual override is
needed. When `ADAPTSIM_ENABLE_WORKER_TRIGGERS=1`, `GET /runs/:id/stream` polls
the L4 status command and returns `ready` only when that status JSON reports
`ready: true`; local mock/dev mode keeps the existing timer fallback.

## Safety Park Golden MVP Verification

Run the end-to-end golden verifier after the reconstruction, import, contract,
streaming, and API agents have landed their outputs:

```bash
cd /Users/nicholas.parkes/Repos/adaptsim-hackathon
scripts/integration/safety_park_golden_mvp.sh
```

The verifier stages the current local `contracts`, `workers`, `unreal`, and
`scripts/pixel-streaming` slices into run-specific VM directories, seeds
`safety_park` metadata/status and the `safety_park_mvp_001` scenario manifest to
GCS, runs the A100 golden reconstruction path, verifies
`unreal-import/scene_mesh.glb` and `unreal-import/reconstruction_manifest.json`,
runs the L4 Unreal import, verifies `unreal/import_report.json` and
`unreal/semantic_environment.json`, launches Pixel Streaming through the local
Control API, and verifies the stream, scenario manifest, telemetry, and AAR API
endpoints. It does not require raw browser photos or screenshots.

Each run writes a pass/fail report with exact commands, capture id, GCS paths,
and VM log paths:

```text
docs/integration_logs/safety_park_golden_<UTC timestamp>.md
```

Useful overrides:

```bash
ADAPTSIM_API_PORT=18787 \
ADAPTSIM_STREAM_READY_TIMEOUT_SECONDS=240 \
ADAPTSIM_GCP_PROJECT=gecko-dev-fde \
scripts/integration/safety_park_golden_mvp.sh
```

## Sync Demo Contracts

From the local repo, sync contract examples to the VM. `COPYFILE_DISABLE=1` avoids macOS AppleDouble files in the tarball.

```bash
cd /Users/nicholas.parkes/Repos/adaptsim-hackathon
COPYFILE_DISABLE=1 tar -C contracts -czf /tmp/adaptsim-contract-examples.tgz examples
gcloud compute scp --zone "us-east1-d" --project "gecko-dev-fde" --tunnel-through-iap \
  /tmp/adaptsim-contract-examples.tgz \
  "linux-pixel-streaming:/tmp/adaptsim-contract-examples.tgz"
gcloud compute ssh --zone "us-east1-d" "linux-pixel-streaming" --project "gecko-dev-fde" --tunnel-through-iap \
  --command 'bash -lc "PROJECT=\"/home/nicholas.parkes/Documents/Unreal Projects/AdaptSim\"; mkdir -p \"\$PROJECT/Saved/AdaptSimContractExamples\"; tar -xzf /tmp/adaptsim-contract-examples.tgz -C \"\$PROJECT/Saved/AdaptSimContractExamples\" --strip-components=1; find \"\$PROJECT/Saved/AdaptSimContractExamples\" -name \"._*\" -delete"'
```

## Open The Stream

Pixel Streaming WebRTC preflight, run from the local machine before restarting the stream:

```bash
cd /Users/nicholas.parkes/Repos/adaptsim-hackathon
scripts/check_pixelstreaming_webrtc_firewall.sh
```

`OK_RELAY` is the expected healthy result for this shared VPC setup. It means coturn can receive browser media on public `443` and the Pixel Streaming launcher should force `iceTransportPolicy=relay`, so the browser does not depend on direct Unreal candidates on blocked `49152+` ports.

`OK_WORKAROUND` means the VM has the legacy no-admin `pixel-streaming-hc` rule for UDP `19302,19303`. That rule is not enough by itself if UE 5.7 PixelStreaming2 advertises `49152+` direct ICE candidates.

```bash
-PixelStreamingWebRTCMinPort=19302
-PixelStreamingWebRTCMaxPort=19303
```

`OK_DIRECT_WIDE_PORT` means the wider direct-media `49152-49200` rule exists. That rule requires host-project network admin access in shared VPC project `gecko-enterprise-dev-host` and is optional while relay-only TURN is working. If the script reports `NO_WORKING_WEBRTC_FIREWALL_PATH`, do not spend time debugging Unreal rendering first. The browser can load the page and still stall at `WEBRTC CONNECTION NEGOTIATED` when the WebRTC media path is not reachable.

Preferred no-admin relay setup:

```bash
scripts/pixel-streaming/vm_configure_turn_relay.sh
scripts/pixel-streaming/vm_pixel_streaming.sh restart
```

Expected status fields after the restart:

```json
{
  "ice": {
    "transport_policy": "relay",
    "turn_configured": true,
    "turn_urls": ["turn:34.139.126.187:443?transport=udp", "turn:34.139.126.187:443?transport=tcp"],
    "stun_urls": []
  }
}
```

If a browser tab is already stuck at `WEBRTC CONNECTION NEGOTIATED`, close that tab and open a fresh URL such as:

```text
http://34.139.126.187/player.html?fresh=20260503
```

Click `CLICK TO START`. The expected healthy player stats include `Video resolution: 1280x720`, rising `Frames Decoded`, and `Controls stream input: true`.

If Stream Pilot's processes are already running, open the public player URL from the local machine:

```text
http://34.139.126.187/player.html
```

Use the IAP tunnel only to verify that the web page/signalling server is reachable. The tunnel forwards HTTP/WebSocket but does not carry the browser's WebRTC UDP media path:

```bash
gcloud compute ssh --zone "us-east1-d" "linux-pixel-streaming" --project "gecko-dev-fde" --tunnel-through-iap -- -N -L 18080:127.0.0.1:80
```

Open this browser URL:

```text
http://127.0.0.1:18080/player.html
```

Launch or restart the horror corridor stream from the local repo. This wrapper detects whether it is already running on the L4 VM; from a local shell it uses `gcloud compute ssh --tunnel-through-iap` and executes the same runtime controller on the VM:

```bash
cd /Users/nicholas.parkes/Repos/adaptsim-hackathon
scripts/pixel-streaming/launch_horror_corridor.sh
```

Report stream readiness and log paths as JSON:

```bash
scripts/pixel-streaming/status.sh
```

When called through the local `gcloud` bridge, stdout is the status JSON; gcloud connection messages may still appear on stderr.

The L4 runtime controller can also be called directly from a VM shell or by the Control API after SSH:

```bash
scripts/pixel-streaming/adaptsim-pixel-streaming.sh restart \
  --map /Game/AdaptSim/Maps/L_HorrorCorridor_Imported \
  --scenario-manifest "$PROJECT/Saved/AdaptSimContractExamples/scenario_manifests/horror_corridor_ambush_delay_001.json" \
  --semantic-environment "$PROJECT/Saved/AdaptSimContractExamples/semantic_environments/horror_corridor_imported.json"

scripts/pixel-streaming/adaptsim-pixel-streaming.sh status
scripts/pixel-streaming/adaptsim-pixel-streaming.sh stop
```

Granular commands are available for API orchestration:

```bash
scripts/pixel-streaming/adaptsim-pixel-streaming.sh start-signalling
scripts/pixel-streaming/adaptsim-pixel-streaming.sh start-unreal --map /Game/AdaptSim/Maps/L_HorrorCorridor_Imported
scripts/pixel-streaming/adaptsim-pixel-streaming.sh restart --no-scenario-flags
scripts/pixel-streaming/vm_pixel_streaming.sh status
```

The scripts preserve the current demo URL behavior:

```text
http://34.139.126.187/player.html
```

They write predictable runtime files under `$HOME/adaptsim-pixelstreaming`:

```text
wilbur.pid
wilbur.log
unreal.pid
unreal-pixelstreaming.log
last-launch.json
status.json
```

The current launch defaults keep the Unreal-side WebRTC allocation range inside the existing no-admin firewall workaround:

```text
-PixelStreamingWebRTCMinPort=19302
-PixelStreamingWebRTCMaxPort=19303
-PixelStreamingWebRTCDisableTransmitAudio=true
-PixelStreamingWebRTCDisableReceiveAudio=true
```

When `/home/nicholas.parkes/adaptsim-pixelstreaming/turn_credentials.env` exists, the launcher also writes `peer_options.json` for the Pixel Streaming signalling server and forces browser candidates through TURN relay instead of blocked direct `49152+` candidates.

Status JSON shape for Control API shell-out:

```json
{
  "schema_version": 1,
  "status": "ready",
  "ready": true,
  "provider": "unreal_pixel_streaming",
  "last_launch": {
    "map": "/Game/AdaptSim/Maps/L_HorrorCorridor_Imported",
    "scenario_manifest": "/home/nicholas.parkes/Documents/Unreal Projects/AdaptSim/Saved/AdaptSimContractExamples/scenario_manifests/horror_corridor_ambush_delay_001.json",
    "semantic_environment": "/home/nicholas.parkes/Documents/Unreal Projects/AdaptSim/Saved/AdaptSimContractExamples/semantic_environments/horror_corridor_imported.json"
  },
  "urls": {
    "player": "http://34.139.126.187/player.html",
    "local_player": "http://127.0.0.1:80/player.html"
  },
  "components": {
    "signalling": {
      "status": "ready",
      "pid": 1234,
      "pid_file": "/home/nicholas.parkes/adaptsim-pixelstreaming/wilbur.pid",
      "log_file": "/home/nicholas.parkes/adaptsim-pixelstreaming/wilbur.log",
      "http_ready": true
    },
    "unreal": {
      "status": "ready",
      "pid": 5678,
      "pid_file": "/home/nicholas.parkes/adaptsim-pixelstreaming/unreal.pid",
      "log_file": "/home/nicholas.parkes/adaptsim-pixelstreaming/unreal-pixelstreaming.log"
    }
  },
  "ports": {
    "webrtc_min": 19302,
    "webrtc_max": 19303
  },
  "ice": {
    "transport_policy": "relay",
    "turn_configured": true,
    "turn_urls": ["turn:34.139.126.187:443?transport=udp", "turn:34.139.126.187:443?transport=tcp"],
    "stun_urls": [],
    "peer_options_file": "/home/nicholas.parkes/adaptsim-pixelstreaming/peer_options.json"
  }
}
```

Allowed top-level `status` values are `ready`, `launching`, `partial`, and `stopped`. Treat `ready: true` as "signalling process is running, the player page responds locally, and the Unreal streamer process is running"; still use a fresh browser tab to verify live WebRTC media if a stale tab was stuck.

Verify the VM side manually if needed:

```bash
curl -I http://127.0.0.1/player.html
ps -eo pid,etime,args | grep -E "PixelStreaming|dist/index.js" | grep -v grep
tail -f "$HOME/adaptsim-pixelstreaming/wilbur.log"
```

Current observed running shapes produced by the scripts. Include the manifest and semantic environment flags when this stream is intended to accept keyboard `1` as the scenario start:

```text
node ./dist/index.js --streamer_port 8888 --player_port 80 --sfu_port 8889 --serve --https_redirect --console_messages basic --http_root www --homepage player.html --peer_options_file /home/nicholas.parkes/adaptsim-pixelstreaming/peer_options.json
UnrealEditor AdaptSim.uproject /Game/AdaptSim/Maps/L_HorrorCorridor_Imported -game -RenderOffscreen -PixelStreamingConnectionURL=ws://127.0.0.1:8888 -PixelStreamingWebRTCMinPort=19302 -PixelStreamingWebRTCMaxPort=19303 -PixelStreamingWebRTCDisableTransmitAudio=true -PixelStreamingWebRTCDisableReceiveAudio=true -PixelStreamingEncoderCodec=H264 -AdaptSimScenarioManifest=.../horror_corridor_ambush_delay_001.json -AdaptSimSemanticEnvironment=.../horror_corridor_imported.json -AdaptSimDemoInputStart -AdaptSimDemoHoldSeconds=25
```

Latest Integration Marshal note: one public-browser run stalled at `WEBRTC CONNECTION NEGOTIATED` when Wilbur showed public ICE candidates on `34.139.126.187:49152-49154`. Restarting Unreal with `-PixelStreamingWebRTCDisableTransmitAudio=true -PixelStreamingWebRTCDisableReceiveAudio=true` produced a clean browser pass with live H.264 video, `1280x720`, decoded frames, and `Controls stream input: true`. The successful no-audio offer still advertised `49152-49153`, so treat the `19302-19303` firewall rule as useful preflight context, not a complete proof of the actual ICE path. The durable no-admin mitigation is the TURN relay setup above; if a tab stays stuck after the restart, close it and open a fresh cache-busted player URL.

Optional admin cleanup: ask a GCP network admin to run this from a local/admin shell, not from the VM. The current user account hit `Required 'compute.firewalls.create' permission` for this host project.

```bash
gcloud compute firewall-rules create adaptsim-pixelstreaming-webrtc \
  --project gecko-enterprise-dev-host \
  --network dev-network \
  --direction INGRESS \
  --priority 1000 \
  --action ALLOW \
  --rules udp:49152-49200,tcp:49152-49200 \
  --source-ranges 0.0.0.0/0 \
  --target-tags stun-turn-server
```

After that rule exists, restart Unreal with the wider range and the same manifest/environment flags used by the demo:

```bash
"$UE/Engine/Binaries/Linux/UnrealEditor" "$UPROJECT" /Game/AdaptSim/Maps/L_HorrorCorridor_Imported \
  -game -RenderOffscreen -Unattended -nosplash -ForceRes -ResX=1280 -ResY=720 -AudioMixer \
  -PixelStreamingConnectionURL=ws://127.0.0.1:8888 \
  -PixelStreamingWebRTCMinPort=49152 \
  -PixelStreamingWebRTCMaxPort=49200 \
  -PixelStreamingEncoderCodec=H264 \
  > "$HOME/adaptsim-pixelstreaming/unreal-pixelstreaming.log" 2>&1 &
echo $! > "$HOME/adaptsim-pixelstreaming/unreal.pid"
```

## Run The Scenario

Preferred demo scenario:

```bash
SCENARIO_ID="horror_corridor_ambush_delay_001"
MANIFEST="$PROJECT/Saved/AdaptSimContractExamples/scenario_manifests/${SCENARIO_ID}.json"
ENVIRONMENT="$PROJECT/Saved/AdaptSimContractExamples/semantic_environments/horror_corridor_imported.json"

"$UE/Engine/Binaries/Linux/UnrealEditor-Cmd" "$UPROJECT" \
  -game -unattended -nop4 -nosplash -nullrhi -NoSound \
  -AdaptSimScenarioManifest="$MANIFEST" \
  -AdaptSimSemanticEnvironment="$ENVIRONMENT" \
  -AdaptSimScenarioDirectorFireAllForTest \
  -AdaptSimScenarioDirectorExitAfterTest \
  -AdaptSimScenarioDirectorExitDelaySeconds=30 \
  -log

ls -1t "$PROJECT/Saved/AdaptSimTelemetry/${SCENARIO_ID}"_*.jsonl | head -1
```

Expected runtime facts for this legacy fallback scenario:

- Map loaded: `/Game/AdaptSim/Maps/L_HorrorCorridor_Imported`.
- Legacy fixture trigger fired: `delay_barricade_001` on scenario start.
- Legacy fixture prop spawned: `prop_light_barricade` at `chokepoint`.
- Trigger fired: `alcove_delay_contact_001` at `chokepoint`.
- Adversaries spawned: two `AdaptSimAdversaryCharacter` actors for `adversary_rifleman_irregular`.
- Fallback anchor: `exit`.
- Behavior telemetry beyond spawn: `perception_target_seen`, `contact_opened`, `phase_changed` to `holding_contact`, `phase_changed` to `moving_to_fallback`, `move_to_fallback_started`, and `move_to_fallback_failed`.
- Telemetry file: `Saved/AdaptSimTelemetry/horror_corridor_ambush_delay_001_*.jsonl`.

To verify the keyboard start path without Pixel Streaming media, run:

```bash
timeout -s INT 35 "$UE/Engine/Binaries/Linux/UnrealEditor-Cmd" "$UPROJECT" /Game/AdaptSim/Maps/L_HorrorCorridor_Imported \
  -game -unattended -nop4 -nosplash -nullrhi -NoSound \
  -AdaptSimScenarioManifest="$MANIFEST" \
  -AdaptSimSemanticEnvironment="$ENVIRONMENT" \
  -AdaptSimDemoInputStart \
  -AdaptSimDemoAutoPress1 \
  -AdaptSimDemoHoldSeconds=25 \
  -log
```

Expected log lines: `demo_input_received key=1`, `scenario_start_requested`, `scenario_started`, and `demo_hold_window_started duration_s=25.00`.

To generate a game-mode visual proof when WebRTC media is blocked:

```bash
"$UE/Engine/Binaries/Linux/UnrealEditor" "$UPROJECT" /Game/AdaptSim/Maps/L_HorrorCorridor_Imported \
  -game -RenderOffscreen -unattended -nop4 -nosplash -NoSound -ForceRes -ResX=1280 -ResY=720 \
  -AdaptSimScenarioManifest="$MANIFEST" \
  -AdaptSimSemanticEnvironment="$ENVIRONMENT" \
  -AdaptSimScenarioDirectorFireAllForTest \
  -AdaptSimScenarioDirectorExitAfterTest \
  -AdaptSimScenarioDirectorExitDelaySeconds=8 \
  -ExecCmds="HighResShot 1280x720" \
  -log
```

Latest visual artifact copied locally:

```text
/Users/nicholas.parkes/Repos/adaptsim-hackathon/contracts/examples/telemetry/horror_corridor_ambush_delay_001_visual.png
```

Optional second scenario:

```bash
SCENARIO_ID="horror_corridor_observer_detection_001"
MANIFEST="$PROJECT/Saved/AdaptSimContractExamples/scenario_manifests/${SCENARIO_ID}.json"
ENVIRONMENT="$PROJECT/Saved/AdaptSimContractExamples/semantic_environments/horror_corridor_imported.json"

"$UE/Engine/Binaries/Linux/UnrealEditor-Cmd" "$UPROJECT" \
  -game -unattended -nop4 -nosplash -nullrhi -NoSound \
  -AdaptSimScenarioManifest="$MANIFEST" \
  -AdaptSimSemanticEnvironment="$ENVIRONMENT" \
  -AdaptSimScenarioDirectorFireAllForTest \
  -AdaptSimScenarioDirectorExitAfterTest \
  -log
```

Observer caveat: this scenario runs and spawns an adversary, but current runtime placement resolves to the accepted fallback path rather than strictly spawning at `observation_point`.

## Generate AAR From Real Telemetry

After a run, copy the JSONL back to the local repo. Use the exact path printed by the VM command. The latest verified integrated artifact was:

```text
/home/nicholas.parkes/Documents/Unreal Projects/AdaptSim/Saved/AdaptSimTelemetry/horror_corridor_ambush_delay_001_20260503T030408Z.jsonl
```

Copy, wrap JSONL into a `telemetry_log`, and generate markdown:

```bash
cd /Users/nicholas.parkes/Repos/adaptsim-hackathon
gcloud compute scp --zone "us-east1-d" --project "gecko-dev-fde" --tunnel-through-iap \
  "linux-pixel-streaming:/home/nicholas.parkes/Documents/Unreal Projects/AdaptSim/Saved/AdaptSimTelemetry/horror_corridor_ambush_delay_001_20260503T030408Z.jsonl" \
  contracts/examples/telemetry/horror_corridor_ambush_delay_001_live.jsonl

python3 contracts/jsonl_to_telemetry_log.py \
  contracts/examples/telemetry/horror_corridor_ambush_delay_001_live.jsonl \
  --output contracts/examples/telemetry/horror_corridor_ambush_delay_001_live.json

python3 contracts/aar_generator.py \
  contracts/examples/telemetry/horror_corridor_ambush_delay_001_live.json \
  --output contracts/examples/aar/horror_corridor_ambush_delay_001_live_aar.md
```

Open or show:

```text
/Users/nicholas.parkes/Repos/adaptsim-hackathon/contracts/examples/aar/horror_corridor_ambush_delay_001_live_aar.md
```

## Three-Minute Demo Flow

Start the real local API with worker triggers and the public Pixel Streaming URL:

```bash
cd /Users/nicholas.parkes/Repos/adaptsim-hackathon

export GCS_BUCKET=aiscanners-hackathon2025
export GCS_CAPTURE_PREFIX=adaptsim-captures
export GCS_SIGNING_SERVICE_ACCOUNT=photogrammetry-test@gecko-dev-fde.iam.gserviceaccount.com
export GCS_SIGNING_REGION=us
export ADAPTSIM_ENABLE_WORKER_TRIGGERS=1
export ADAPTSIM_PIXEL_STREAM_URL=http://34.139.126.187/player.html

npm run dev:api
```

Start the frontend in real API mode with presenter fast-forward enabled:

```bash
cd /Users/nicholas.parkes/Repos/adaptsim-hackathon

VITE_ADAPTSIM_SCENE_ID=safety_park \
VITE_ADAPTSIM_CACHED_SCENE_ID=safety_park \
VITE_ADAPTSIM_FAST_FORWARD_RECONSTRUCTION=1 \
VITE_ADAPTSIM_API_MODE=live \
npm run dev:web
```

1. Open the web app and show the capture-to-simulation lane. Use the cached
   `safety_park` path rather than waiting for reconstruction during the live
   demo.
2. Show the generated threat asset database:
   `contracts/examples/generated_asset_databases/threat_vector_asset_database.json`.
   The assets should read as environment-specific threat vectors such as
   UAV/FPV drones, UGV/vehicle visuals, USV visuals where relevant, inert
   equipment/sensor payloads, and adversary-runtime metadata.
3. Show the threat injection plan:
   `contracts/examples/gameplay_intelligence/safety_park/threat_injection_plan.json`.
   Explain that this is the intelligence layer: it ties scene affordances to
   plausible threat entries, runtime bindings, triggers, success criteria, and
   review gates.
4. Launch `safety_park_mvp_001` through the Control API or web UI and open the
   Pixel Streaming player. The generated threat visuals may still be
   `prototype`/`never_spawn`; runtime spawning must use reviewed ScenarioDirector
   assets or existing Unreal actor bindings.
5. Show telemetry and AAR. Close with the distinction: GPT-5.5/Trellis propose
   and generate reviewed threat visuals; Unreal owns physical runtime,
   collision, NavMesh, spawning, and telemetry; deterministic AAR only
   summarizes observed facts.

## Horror Corridor Fallback Flow

1. Show the stream at `http://34.139.126.187/player.html`; if video does not
   flow, run the preflight and compare Wilbur/player ICE candidate ports against
   the active Unreal WebRTC flags.
2. Call out the real imported horror corridor map and the confirmed semantic
   anchors.
3. Show
   `contracts/examples/scenario_manifests/horror_corridor_ambush_delay_001.json`.
4. Run the input-start command to show keyboard `1` starts the configured
   scenario.
5. Run the 30-second ScenarioDirector command to prove the manifest executes
   against the horror corridor map and produces behavior telemetry.
6. Show
   `contracts/examples/telemetry/horror_corridor_ambush_delay_001_visual.png`
   for adversary visibility if WebRTC video is blocked.
7. Generate or open
   `contracts/examples/aar/horror_corridor_ambush_delay_001_live_aar.md`.
8. Note that the old barricade/prop event in this fallback scenario is a legacy
   runtime fixture, not the Trellis threat-vector asset generation story.

## Final Fallback Path

Use this if Pixel Streaming video remains stuck at `WEBRTC CONNECTION NEGOTIATED` after confirming `OK_RELAY` and opening a fresh player tab:

1. Open the Unreal editor on the VM:

```bash
"$UE/Engine/Binaries/Linux/UnrealEditor" "$UPROJECT"
```

2. Open `/Game/AdaptSim/Maps/L_HorrorCorridor_Imported`.
3. Run `horror_corridor_ambush_delay_001` headlessly with the command above.
4. Show the generated JSONL, visual screenshot, and AAR locally.

Use this if the horror corridor scenario regresses:

```bash
MANIFEST="$PROJECT/Saved/AdaptSimContractExamples/scenario_manifests/scan_hallway_delay_001.json"
ENVIRONMENT="$PROJECT/Saved/AdaptSimContractExamples/semantic_environments/scanned_hallway_alpha.json"
```

Then run the same `UnrealEditor-Cmd` ScenarioDirector command.

Use this if live JSONL copying fails:

```bash
python3 contracts/aar_generator.py contracts/examples/telemetry/horror_corridor_ambush_delay_001_live.json \
  --output contracts/examples/aar/horror_corridor_ambush_delay_001_live_aar.md
```

Use the older deterministic fixture only as the last backup:

```bash
python3 contracts/aar_generator.py contracts/examples/telemetry/mock_hallway_delay_log.json \
  --output contracts/examples/aar/mock_hallway_delay_log_aar.md
```

## Known Gaps

- Streamed interactive play and headless scenario execution are still separate
  demo beats unless the public browser stream is actively showing video and
  accepting input; the scenario/AAR proof can always run via `UnrealEditor-Cmd`.
- Generated Trellis threat visuals remain prototype metadata until Unreal import,
  scale/collision review, runtime binding, and whitelist activation make a given
  asset spawnable.
- Keyboard `1` starts the scenario through `AAdaptSimDemoPlayerController`, but there is no real `trainee_action` telemetry yet.
- The selected manifest's adversary event uses `trainee_enters_anchor`, so input-only startup does not spawn the adversary until the trainee reaches the chokepoint; use `-AdaptSimScenarioDirectorFireAllForTest` for the compact demo proof.
- One multi-count ambush spawn still reports a legacy/derived `ambush_service_alcove` anchor id in telemetry.
- Observer scenario uses accepted fallback placement instead of strict `observation_point` placement.
- Semantic anchors in the saved map are TargetPoint placeholders, not native `ASemanticAnchor` actors, because native placement crashed under Linux `-nullrhi`.
- Pixel Streaming is repo script-managed with pid/log/status files, not yet a systemd unit.
- Pixel Streaming media needs a routable path. Future agents should run `scripts/check_pixelstreaming_webrtc_firewall.sh` before Pixel Streaming work. `OK_WORKAROUND` only proves UDP `19302,19303` are open; UE 5.7 PixelStreaming2 can still advertise blocked `49152+` direct candidates. The durable no-admin fix is `scripts/pixel-streaming/vm_configure_turn_relay.sh` plus relay-only peer options. The `49152-49200` firewall rule in shared VPC host project `gecko-enterprise-dev-host` is optional admin cleanup.
- `gcloud compute ssh` often prints `Updating project ssh metadata... failed.` even when SSH and SCP succeed.
