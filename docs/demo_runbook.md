# AdaptSim Demo Runbook

Last updated: 2026-05-03 UTC.

This is the final integrated demo path for the current AdaptSim hackathon slice. It uses the imported horror corridor Unreal map, confirmed Cartographer semantic anchors, ScenarioDirector manifests, real adversary actor spawns, JSONL telemetry, deterministic AAR generation, and the Pixel Streaming browser player when the VM streamer is running.

## Demo Thesis

AdaptSim turns a scanned or place-like environment into a reusable Unreal training space, runs structured scenario variants against semantic anchors, records runtime facts, and generates an after-action review from telemetry rather than from an invented narrative.

## Current Truth Table

| Area | Status | Evidence |
| --- | --- | --- |
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
| Pixel Streaming | Pass in clean browser, script-managed | `PixelStreaming2` is enabled and signalling serves port `80`. `scripts/pixel-streaming/*` now provides launch, restart, stop, and JSON status commands for Control API shell-out. On 2026-05-03, a clean browser session reached live H.264 video at `1280x720` with `Controls stream input: true` after restarting Unreal with audio transmit/receive disabled. Old tabs can remain stuck at `WEBRTC CONNECTION NEGOTIATED`; close the tab or use a cache-busting URL before retesting. |
| Frontend app | Fallback | No dedicated AdaptSim frontend repo is confirmed; use Pixel Streaming player plus checked-in artifacts/API fixture. |

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
OK: validated 14 file(s): after_action_review_input=1, asset_card=2, behavior_profile=3, scenario_manifest=4, semantic_environment=2, telemetry_log=2
```

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

`OK_WORKAROUND` means the VM has the legacy no-admin `pixel-streaming-hc` rule for UDP `19302,19303`. Keep using the direct public URL and the command below, but still verify live ICE candidates in `wilbur.log`: UE 5.7 PixelStreaming2 logs the `19302-19303` override yet has still been observed allocating `49152+` candidates.

```bash
-PixelStreamingWebRTCMinPort=19302
-PixelStreamingWebRTCMaxPort=19303
```

`OK_PERMANENT` means the wider preferred `49152-49200` rule exists. If the script reports `NO_WORKING_WEBRTC_FIREWALL_PATH`, do not spend time debugging Unreal rendering first. The browser can load the page and still stall at `WEBRTC CONNECTION NEGOTIATED` when the WebRTC media ports are not reachable.

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

The current launch defaults intentionally use the existing no-admin firewall workaround and do not require the permanent wide-port rule:

```text
-PixelStreamingWebRTCMinPort=19302
-PixelStreamingWebRTCMaxPort=19303
-PixelStreamingWebRTCDisableTransmitAudio=true
-PixelStreamingWebRTCDisableReceiveAudio=true
```

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
node ./dist/index.js --streamer_port 8888 --player_port 80 --sfu_port 8889 --serve --https_redirect --console_messages verbose --log_config --http_root www --homepage player.html --peer_options_file /home/nicholas.parkes/adaptsim-pixelstreaming/peer_options.json
UnrealEditor AdaptSim.uproject /Game/AdaptSim/Maps/L_HorrorCorridor_Imported -game -RenderOffscreen -PixelStreamingConnectionURL=ws://127.0.0.1:8888 -PixelStreamingWebRTCMinPort=19302 -PixelStreamingWebRTCMaxPort=19303 -PixelStreamingWebRTCDisableTransmitAudio=true -PixelStreamingWebRTCDisableReceiveAudio=true -PixelStreamingEncoderCodec=H264 -AdaptSimScenarioManifest=.../horror_corridor_ambush_delay_001.json -AdaptSimSemanticEnvironment=.../horror_corridor_imported.json -AdaptSimDemoInputStart -AdaptSimDemoHoldSeconds=25
```

Latest Integration Marshal note: one public-browser run stalled at `WEBRTC CONNECTION NEGOTIATED` when Wilbur showed public ICE candidates on `34.139.126.187:49152-49154`. Restarting Unreal with `-PixelStreamingWebRTCDisableTransmitAudio=true -PixelStreamingWebRTCDisableReceiveAudio=true` produced a clean browser pass with live H.264 video, `1280x720`, decoded frames, and `Controls stream input: true`. The successful no-audio offer still advertised `49152-49153`, so treat the `19302-19303` firewall rule as useful preflight context, not a complete proof of the actual ICE path. If a tab stays stuck after the restart, close it and open a fresh cache-busted player URL.

Optional permanent cleanup: ask a GCP network admin to run this from a local/admin shell, not from the VM. The current user account hit `Required 'compute.firewalls.create' permission` for this host project.

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

Expected runtime facts:

- Map loaded: `/Game/AdaptSim/Maps/L_HorrorCorridor_Imported`.
- Trigger fired: `delay_barricade_001` on scenario start.
- Prop spawned: `prop_light_barricade` at `chokepoint`.
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

## Demo Flow

1. Show the stream at `http://34.139.126.187/player.html`; if video does not flow, run the preflight and compare Wilbur/player ICE candidate ports against the active Unreal WebRTC flags.
2. Call out the real imported horror corridor map and the confirmed semantic anchors.
3. Show `contracts/examples/scenario_manifests/horror_corridor_ambush_delay_001.json`.
4. Run the input-start command to show keyboard `1` starts the configured scenario.
5. Run the 30-second ScenarioDirector command to prove the manifest executes against the horror corridor map and produces behavior telemetry.
6. Show `contracts/examples/telemetry/horror_corridor_ambush_delay_001_visual.png` for adversary visibility if WebRTC video is blocked.
7. Generate or open `contracts/examples/aar/horror_corridor_ambush_delay_001_live_aar.md`.
8. Close with the distinction: Unreal owns physical runtime and telemetry; deterministic AAR only summarizes observed facts.

## Final Fallback Path

Use this if Pixel Streaming video remains stuck at `WEBRTC CONNECTION NEGOTIATED` after confirming the preflight and restarting on the `19302-19303` workaround:

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

- Streamed interactive play and headless scenario execution are still separate demo beats unless the public browser stream is actively showing video and accepting input; the scenario/AAR proof can always run via `UnrealEditor-Cmd`.
- Keyboard `1` starts the scenario through `AAdaptSimDemoPlayerController`, but there is no real `trainee_action` telemetry yet.
- The selected manifest's adversary event uses `trainee_enters_anchor`, so input-only startup does not spawn the adversary until the trainee reaches the chokepoint; use `-AdaptSimScenarioDirectorFireAllForTest` for the compact demo proof.
- One multi-count ambush spawn still reports a legacy/derived `ambush_service_alcove` anchor id in telemetry.
- Observer scenario uses accepted fallback placement instead of strict `observation_point` placement.
- Semantic anchors in the saved map are TargetPoint placeholders, not native `ASemanticAnchor` actors, because native placement crashed under Linux `-nullrhi`.
- Pixel Streaming is repo script-managed with pid/log/status files, not yet a systemd unit.
- Pixel Streaming media needs a routable UDP path. Future agents should run `scripts/check_pixelstreaming_webrtc_firewall.sh` before Pixel Streaming work. `OK_WORKAROUND` is acceptable for the current no-admin path, but UE 5.7 PixelStreaming2 can still advertise `49152+`; use the no-audio launch flags, close stale browser tabs, and verify live ICE candidates in `wilbur.log`. The preferred `49152-49200` firewall rule in shared VPC host project `gecko-enterprise-dev-host` is optional permanent cleanup.
- `gcloud compute ssh` often prints `Updating project ssh metadata... failed.` even when SSH and SCP succeed.
