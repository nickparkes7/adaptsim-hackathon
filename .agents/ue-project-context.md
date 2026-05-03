# UE Project Context

*Last updated: 2026-05-03*

## Engine & Project Overview

**VM:** `linux-pixel-streaming` in GCP project `gecko-dev-fde`, zone `us-east1-d`.

**SSH command:**

```bash
gcloud compute ssh --zone "us-east1-d" "linux-pixel-streaming" --project "gecko-dev-fde" --tunnel-through-iap
```

**Agent-critical Pixel Streaming preflight:** before launching or debugging Pixel Streaming, run this from the local control repo:

```bash
cd /Users/nicholas.parkes/Repos/adaptsim-hackathon
scripts/check_pixelstreaming_webrtc_firewall.sh
```

Green results are either `OK_WORKAROUND` or `OK_PERMANENT`. `OK_WORKAROUND` confirms the existing no-admin `pixel-streaming-hc` firewall rule for UDP `19302,19303`, but UE 5.7 PixelStreaming2 can still advertise `49152+` ICE candidates even when the `19302-19303` launch flags are logged. The currently verified browser path disables audio transmit/receive and uses a fresh browser tab. The wider `adaptsim-pixelstreaming-webrtc` rule for UDP/TCP `49152-49200` is preferred cleanup, not an absolute prerequisite. If the script reports `NO_WORKING_WEBRTC_FIREWALL_PATH`, debug the media firewall path before Unreal rendering/content.

**Engine version:** Unreal Engine 5.7.4, promoted release branch `++UE5+Release-5.7`, changelist `51494982`.

**Engine path:**

```text
/home/nicholas.parkes/tools/unreal/UnrealEngine-5.7.4
```

**Project path:**

```text
/home/nicholas.parkes/Documents/Unreal Projects/AdaptSim
```

**`.uproject`:**

```text
/home/nicholas.parkes/Documents/Unreal Projects/AdaptSim/AdaptSim.uproject
```

**Project name:** `AdaptSim`

**Description:** Hackathon Unreal simulation project for turning scanned real environments into reusable training spaces with generated or selected adversarial scenarios.

**Project type:** Simulation / interactive training prototype.

**Current editor launch observed on VM:**

```bash
"/home/nicholas.parkes/tools/unreal/UnrealEngine-5.7.4/Engine/Binaries/Linux/UnrealEditor" "/home/nicholas.parkes/Documents/Unreal Projects/AdaptSim/AdaptSim.uproject"
```

## VM Health Snapshot

Captured on 2026-05-02.

| Check | Result |
| --- | --- |
| OS | Ubuntu 22.04, kernel `6.8.0-1045-gcp` |
| GPU | NVIDIA L4 |
| NVIDIA driver / CUDA | `570.211.01` / CUDA `12.8` |
| GPU usage | UnrealEditor running, about `3005 MiB` GPU memory used; total GPU memory `23034 MiB` |
| Disk | `/dev/root` `969G` total, `235G` used, `735G` available, `25%` used |
| Memory | `125Gi` total, `9.5Gi` used, `115Gi` available |
| Swap | none |
| Docker | User `nicholas.parkes` is in the `docker` group; `docker ps` and `docker run --rm hello-world` work without `sudo` as of 2026-05-02 22:45 UTC |

## Module Structure

**Primary game module:** `AdaptSim`

| Module | Type | Source layout | Notes |
| --- | --- | --- | --- |
| `AdaptSim` | Runtime | `Source/AdaptSim/AdaptSim.h`, `Source/AdaptSim/AdaptSim.cpp`, `Source/AdaptSim/AdaptSim.Build.cs` | Primary gameplay/runtime module. Started from a blank template, now contains ScenarioDirector, semantic anchors/export, JSON helpers, telemetry structs, trigger volume, and placeholder spawn actors. |

**Targets:**

| Target | Type | File | Notes |
| --- | --- | --- | --- |
| `AdaptSim` | Game | `Source/AdaptSim.Target.cs` | `DefaultBuildSettings = BuildSettingsVersion.V6`; `IncludeOrderVersion = Unreal5_7`; adds `AdaptSim`. |
| `AdaptSimEditor` | Editor | `Source/AdaptSimEditor.Target.cs` | Same settings; editor target for the project. |

**Module dependencies from `AdaptSim.Build.cs`:**

- Public: `Core`, `CoreUObject`, `Engine`, `InputCore`, `EnhancedInput`, `GameplayTags`, `Json`, `JsonUtilities`, `AIModule`, `NavigationSystem`, `GameplayTasks`, `StateTreeModule`, `GameplayStateTreeModule`, `SmartObjectsModule`
- Private: none

**Header organization:** `Source/AdaptSim/Public` and `Source/AdaptSim/Private` now exist for new C++ work. The starter files remain at `Source/AdaptSim/AdaptSim.h` and `Source/AdaptSim/AdaptSim.cpp`.

**Runtime C++ systems currently present in the primary module:**

- Scenario Director runtime actor/subsystem:
  - `Source/AdaptSim/ScenarioDirector.*`
  - `Source/AdaptSim/ScenarioDirectorTypes.*`
  - `Source/AdaptSim/AdaptSimScenarioDirectorSubsystem.*`
  - `Source/AdaptSim/AdaptSimScenarioTriggerVolume.*`
- JSON parsing/serialization helpers:
  - `Source/AdaptSim/AdaptSimJson.*`
- Semantic annotation/export support:
  - `Source/AdaptSim/SemanticAnchor.*`
  - `Source/AdaptSim/SemanticEnvironmentExportCommandlet.*`
  - Legacy/simple anchor actor also exists as `Source/AdaptSim/AdaptSimSemanticAnchor.*`
- Placeholder runtime actors:
  - `Source/AdaptSim/AdaptSimPlaceholderActors.*`
  - `Source/AdaptSim/AdaptSimAdversaryTacticReceiver.h`

**Custom plugin modules currently present:**

| Plugin / Module | Type | Path | Notes |
| --- | --- | --- | --- |
| `AdaptSimAdversary` | Runtime | `Plugins/AdaptSimAdversary` | Placeholder adversary character, AIController, Behavior Tree task, behavior-profile mapping, debug smoke console command, and runtime interface. Builds successfully and ScenarioDirector now spawns `AdaptSimAdversaryCharacter` for the horror corridor adversary events. |

## Plugin Dependencies

**Explicitly enabled in `AdaptSim.uproject`:**

| Plugin | Scope | Notes |
| --- | --- | --- |
| `ModelingToolsEditorMode` | Editor only via `TargetAllowList: ["Editor"]` | Mesh creation/editing tools useful for scan cleanup and manual environment annotation. |
| `PythonScriptPlugin` | Editor only via `TargetAllowList: ["Editor"]` | Enables editor Python workflows and `-ExecutePythonScript` commandlets. |
| `EditorScriptingUtilities` | Editor only via `TargetAllowList: ["Editor"]` | Editor asset and level automation helpers. |
| `AISupport` | Runtime | Loads `AIModule` and `NavigationSystem` at runtime for AI/EQS support. |
| `StateTree` | Runtime | Base StateTree runtime and editor support. |
| `GameplayStateTree` | Runtime | Gameplay-focused StateTree integration. |
| `SmartObjects` | Runtime | Smart Object runtime and editor support for scenario interaction points. |
| `EnvironmentQueryEditor` | Editor only via `TargetAllowList: ["Editor"]` | EQS authoring tools; depends on `AISupport`. |
| `PixelStreaming2` | Runtime | Enabled by Stream Pilot for the browser demo path; active offscreen Unreal streamer connects to Wilbur/signalling on `ws://127.0.0.1:8888`. |

**Engine plugins in use or relevant:**

| Plugin | Status | Notes |
| --- | --- | --- |
| `EnhancedInput` | Engine plugin `EnabledByDefault=true`; referenced by `AdaptSim.Build.cs` and `DefaultInput.ini` | Current input stack. |
| `InterchangeEditor` | Engine plugin `EnabledByDefault=true` | Available for asset import workflows. |
| `GameplayTags` | Engine runtime module, not a project `.uplugin` in this UE 5.7 tree | Referenced by `AdaptSim.Build.cs`. |

**Available but not enabled by `AdaptSim.uproject`:**

| Plugin | VM availability | Notes |
| --- | --- | --- |
| `PixelStreaming` | `/home/nicholas.parkes/tools/unreal/UnrealEngine-5.7.4/Engine/Plugins/Media/PixelStreaming/PixelStreaming.uplugin` | `EnabledByDefault=false`; not listed in project file. |
| `PixelStreamingPlayer` | `/home/nicholas.parkes/tools/unreal/UnrealEngine-5.7.4/Engine/Plugins/Experimental/PixelStreamingPlayer/PixelStreamingPlayer.uplugin` | Receiver/player plugin; not enabled. |
| `DatasmithImporter` | Engine plugin present, `EnabledByDefault=false` | Potential import path, but not currently enabled. |
| `CommonUI` | Engine plugin present, `EnabledByDefault=false` | `DefaultGame.ini` contains CommonUI settings, but the plugin is not explicitly enabled in `AdaptSim.uproject`. |

**Custom project plugins:**

| Plugin | Path | Notes |
| --- | --- | --- |
| `AdaptSimAdversary` | `Plugins/AdaptSimAdversary/AdaptSimAdversary.uplugin` | `EnabledByDefault=true`, `CanContainContent=true`; contains runtime adversary AI classes and smoke-test console command. |

## Config Settings

**`Config/DefaultEngine.ini`:**

- `GameDefaultMap=/Game/AdaptSim/Maps/L_HorrorCorridor_Imported`
- `EditorStartupMap=/Game/AdaptSim/Maps/L_HorrorCorridor_Imported`
- `r.AllowStaticLighting=False`
- `r.GenerateMeshDistanceFields=True`
- `r.DynamicGlobalIlluminationMethod=1`
- `r.ReflectionMethod=1`
- `r.SkinCache.CompileShaders=True`
- `r.RayTracing=True`
- `r.RayTracing.RayTracingProxies.ProjectEnabled=True`
- `r.Substrate=True`
- `r.Shadow.Virtual.Enable=1`
- Targeted RHIs include Vulkan SM6 for Linux, Metal SM6 for Mac, and DX12 SM6 for Windows.
- Desktop hardware target, maximum graphics performance.
- Active game redirects from `TP_Blank` to `/Script/AdaptSim`.

**`Config/DefaultGame.ini`:**

- `ProjectID=EF3F9A74A922439DBA04BEE87D55ABCB`
- `CommonButtonAcceptKeyHandling=TriggerClick`

**`Config/DefaultInput.ini`:**

- Uses Enhanced Input classes:
  - `DefaultPlayerInputClass=/Script/EnhancedInput.EnhancedPlayerInput`
  - `DefaultInputComponentClass=/Script/EnhancedInput.EnhancedInputComponent`
- Standard gamepad, mouse, VR controller, and console key defaults are present.

**Maps / content:**

- Imported horror corridor map exists at `/Game/AdaptSim/Maps/L_HorrorCorridor_Imported`.
- Imported horror corridor content exists under `/Game/AdaptSim/Imported/horror_corridor`.
- Top-level content directories found: `Content/AdaptSim`, `Content/Collections`, `Content/Developers`, `Content/Developers/nicholasparkes`, `Content/Python`.
- Bootstrap convention folders created on the VM: `Content/AdaptSim`, `Content/Python/AdaptSim`, `Source/AdaptSim/Public`, `Source/AdaptSim/Private`.
- Scanwright importer exists at `Content/Python/AdaptSim/import_scanned_scene.py` on the VM after local sync.
- Import validation helper exists at `Content/Python/AdaptSim/validate_imported_scene.py` on the VM after local sync.
- Horror corridor cartography/export helper exists at `Content/Python/AdaptSim/cartograph_horror_corridor.py` on the VM after local sync.

## Example Scene / Capture Inputs

**Current real-user scan:** `horror-corridor-vr-room-baked`, imported 2026-05-02 PDT / 2026-05-03 UTC.

Source and staging:

```text
Local source zip: /Users/nicholas.parkes/Downloads/horror-corridor-vr-room-baked.zip
VM copied zip:    /home/nicholas.parkes/adaptsim-assets/horror-corridor-vr-room-baked.zip
VM staging dir:   /home/nicholas.parkes/adaptsim-assets/horror-corridor-vr-room-baked
GLB source:       /home/nicholas.parkes/adaptsim-assets/horror-corridor-vr-room-baked/source/Untitled.glb
Texture source:   /home/nicholas.parkes/adaptsim-assets/horror-corridor-vr-room-baked/textures/Untitled_0.png
```

Zip contents:

- `source/Untitled.glb` (`18,107,308` bytes)
- `textures/Untitled_0.png` (`14,943,505` bytes)
- No license/readme/scale-note files were present in the archive.

GLB metadata from local inspection:

- glTF 2.0 binary, generator `Khronos glTF Blender I/O v4.4.56`
- 1 scene, 1 node, 1 mesh, 2 materials, 1 embedded image, 2 textures
- Accessor bounds before Unreal import: approximately `9.6 x 10.016 x 6.0` glTF units; Blender/glTF convention implies meters unless authored otherwise.

Unreal import result:

```text
Imported content path: /Game/AdaptSim/Imported/horror_corridor
Map path:              /Game/AdaptSim/Maps/L_HorrorCorridor_Imported
Static mesh:           /Game/AdaptSim/Imported/horror_corridor/Untitled/StaticMeshes/SM_HorrorCorridor
Materials:             /Game/AdaptSim/Imported/horror_corridor/Untitled/Materials/Material
                       /Game/AdaptSim/Imported/horror_corridor/Untitled/Materials/Material_004
Textures:              /Game/AdaptSim/Imported/horror_corridor/Untitled/Textures/Untitled
                       /Game/AdaptSim/Imported/horror_corridor/Untitled/Textures/Untitled1
```

Level scaffold:

- `Scan_horror_corridor` static mesh actor
- `AdaptSim_PlayerStart`
- `AdaptSim_KeyLight`
- `AdaptSim_DemoCamera`
- `AdaptSim_NavMeshBounds`
- 8 semantic placeholder `TargetPoint` actors: `AdaptSim_Semantic_Entry`, `AdaptSim_Semantic_Exit`, `AdaptSim_Semantic_HallwayCenter`, `AdaptSim_Semantic_Doorway`, `AdaptSim_Semantic_Cover`, `AdaptSim_Semantic_AmbushPoint`, `AdaptSim_Semantic_ObservationPoint`, `AdaptSim_Semantic_Chokepoint`

Import notes:

- Imported through Unreal Python `AssetImportTask` / Interchange from `Content/Python/AdaptSim/import_scanned_scene.py`.
- Interchange, PythonScriptPlugin, and EditorScriptingUtilities loaded successfully.
- Nanite was enabled on `SM_HorrorCorridor`.
- Collision was set to complex-as-simple on `SM_HorrorCorridor`.
- Headless validation passed with `/home/nicholas.parkes/Documents/Unreal Projects/AdaptSim/Content/Python/AdaptSim/validate_imported_scene.py`; it confirmed 1 static mesh, 2 material instances, 2 textures, the map asset, the scan actor, PlayerStart, key light, NavMeshBoundsVolume, and 8 semantic placeholders.
- Native `ASemanticAnchor` placement through editor Python crashes UE 5.7.4 under `-nullrhi` on this VM because `UEditorActorSubsystem` tries to query viewport hit proxies. Use `--semantic-anchor-mode target_point` for headless imports, then convert placeholders to `ASemanticAnchor` in an interactive editor session or with a lower-level spawn path.
- Scene Cartographer pass on 2026-05-03 made the horror corridor the default/editor startup map, exported TargetPoint-based semantics to `Saved/SemanticExports/horror_corridor_imported.json`, wrote a report to `Saved/SemanticExports/horror_corridor_imported_report.json`, and validated a runtime ScenarioDirector smoke manifest against the actual map. The smoke spawned `AAdaptSimAdversaryCharacter` at `ambush_point`, used `cover` as fallback, wrote telemetry to `Saved/AdaptSimTelemetry/horror_corridor_anchor_smoke_20260503T014002Z.jsonl`, and exited cleanly.

**Demo environment decision:** Use the Fab asset **Modular Rural Cabins** instead of the earlier `safety_park` ƒVDB Reality Capture dataset. The `safety_park` dataset is no longer the preferred demo path because it is COLMAP/SfM capture data and would require an extra reconstruction/export step before Unreal import.

Fab listing:

```text
https://www.fab.com/listings/508fe84a-4976-4cfe-9a40-c2b9533da601
```

Recorded listing details from Fab:

- Name: `Modular Rural Cabins`
- Publisher: `Maarten Hof`
- Price: Free
- Included format: Unreal Engine
- Description says the pack was updated in April 2026 with improved trees and made Lumen and Nanite ready.
- Tags include `Rural`, `Level`, `Realistic`, `Interior`, `Forest`, and `Enterable`.
- Intended use for AdaptSim: demo environment / place-like scene for scenario spawning, semantic anchors, NavMesh, and AAR without needing scan reconstruction.

Important VM note:

- Latest VM check found no `Fab*.uplugin` under `/home/nicholas.parkes/tools/unreal/UnrealEngine-5.7.4/Engine/Plugins`.
- `AdaptSim.uproject` does not currently enable or reference a Fab plugin.
- The asset must still be claimed into the user's Epic/Fab library and added to the VM Unreal project by an authenticated Fab/Epic workflow, by manually copying an imported project/content folder, or by installing whatever Fab plugin/launcher workflow is available for this UE Linux VM.

Record final imported paths here once the Fab import is complete:

```text
Fab listing URL:       https://www.fab.com/listings/508fe84a-4976-4cfe-9a40-c2b9533da601
Claimed in library:    TBD
Import method:         TBD
Imported content path: TBD
Demo map path:         TBD
Chosen working map:    TBD
```

## Pixel Streaming Setup

**Project-level Pixel Streaming:** `PixelStreaming2` is enabled in `AdaptSim.uproject`.

**Engine-level Pixel Streaming availability:**

- Pixel Streaming plugin present.
- Pixel Streaming 2 plugin present.
- Pixel Streaming Player plugin present.
- Container example present at:

```text
/home/nicholas.parkes/tools/unreal/UnrealEngine-5.7.4/Engine/Extras/Containers/Examples/PixelStreaming
```

**Running VM services relevant to streaming:**

- `coturn.service` is active and enabled.
- `turnserver` is running as `turnserver` from `/usr/bin/turnserver -c /etc/turnserver.conf --pidfile=`.
- TCP/UDP `3478` is listening on `10.10.10.66`, `127.0.0.1`, and `::1`.
- `docker.service` is active; `nicholas.parkes` can run Docker without `sudo`.
- Wilbur / Pixel Streaming signalling is running from the UE 5.7 PixelStreaming2 web server with `node ./dist/index.js --streamer_port 8888 --player_port 80 --sfu_port 8889 --serve --https_redirect --console_messages verbose --log_config --http_root www --homepage player.html --peer_options_file /home/nicholas.parkes/adaptsim-pixelstreaming/peer_options.json`.
- Offscreen Unreal is running the imported horror corridor with `-PixelStreamingConnectionURL=ws://127.0.0.1:8888`, `-RenderOffscreen`, `-ResX=1280`, `-ResY=720`, H.264, `-PixelStreamingWebRTCDisableTransmitAudio=true`, `-PixelStreamingWebRTCDisableReceiveAudio=true`, and the logged no-admin WebRTC port workaround `19302-19303`.
- The VM already has target tag `stun-turn-server`, and the shared VPC host project has an existing `pixel-streaming-hc` firewall rule allowing UDP `19302,19303`; this is the current no-admin browser path.
- The preferred wider WebRTC range is `49152-49200`, but creating the matching firewall rule in shared VPC host project `gecko-enterprise-dev-host` currently requires an account with `compute.firewalls.create`. Treat that as durability cleanup unless the browser is advertising blocked high ports.
- VM-local `curl -I http://127.0.0.1/player.html` returned HTTP 200 on 2026-05-03.
- Local IAP tunnel test also returned HTTP 200 at `http://127.0.0.1:18080/player.html` using `gcloud compute ssh ... -- -N -L 18080:127.0.0.1:80`.
- Runtime logs live under `/home/nicholas.parkes/adaptsim-pixelstreaming/wilbur.log` and `/home/nicholas.parkes/adaptsim-pixelstreaming/unreal-pixelstreaming.log`; pid files are in the same directory.

**Pixel Streaming firewall preflight for future agents:**

- Before launching or debugging Pixel Streaming, run this from the local control repo:

```bash
cd /Users/nicholas.parkes/Repos/adaptsim-hackathon
scripts/check_pixelstreaming_webrtc_firewall.sh
```

- `OK_WORKAROUND` is enough to try the no-admin browser path. Launch Unreal with `-PixelStreamingWebRTCMinPort=19302 -PixelStreamingWebRTCMaxPort=19303 -PixelStreamingWebRTCDisableTransmitAudio=true -PixelStreamingWebRTCDisableReceiveAudio=true` and use the direct public player URL, not the IAP tunnel URL, for the actual stream. Verify the actual advertised ICE candidates in `wilbur.log`.
- `OK_PERMANENT` means the wider preferred rule exists. Launch Unreal with `-PixelStreamingWebRTCMinPort=49152 -PixelStreamingWebRTCMaxPort=49200`.
- If the script reports `NO_WORKING_WEBRTC_FIREWALL_PATH`, do not treat `WEBRTC CONNECTION NEGOTIATED` as an Unreal render/content failure. It means signalling can work while the browser cannot reach the WebRTC media candidates.
- Option A remains the selected permanent cleanup: a GCP network admin creates `adaptsim-pixelstreaming-webrtc` in shared VPC host project `gecko-enterprise-dev-host`, allowing UDP/TCP `49152-49200` to target tag `stun-turn-server`.

## Build, Open, Script, And Run Commands

Use these after SSHing into the VM:

```bash
export UE="/home/nicholas.parkes/tools/unreal/UnrealEngine-5.7.4"
export PROJECT="/home/nicholas.parkes/Documents/Unreal Projects/AdaptSim"
export UPROJECT="$PROJECT/AdaptSim.uproject"
cd "$PROJECT"
```

**Generate project files / refresh Makefile:**

```bash
"$UE/Engine/Build/BatchFiles/RunUBT.sh" -ProjectFiles -Project="$UPROJECT" -Game
```

Equivalent generated Makefile target:

```bash
make configure
```

**Build editor target:**

```bash
"$UE/Engine/Build/BatchFiles/RunUBT.sh" AdaptSimEditor Linux Development -Project="$UPROJECT"
```

Equivalent generated Makefile target:

```bash
make AdaptSimEditor
```

**Build game target:**

```bash
"$UE/Engine/Build/BatchFiles/RunUBT.sh" AdaptSim Linux Development -Project="$UPROJECT"
```

Equivalent generated Makefile target:

```bash
make AdaptSim
```

**Open editor:**

```bash
"$UE/Engine/Binaries/Linux/UnrealEditor" "$UPROJECT"
```

**Run the project through the editor runtime:**

```bash
"$UE/Engine/Binaries/Linux/UnrealEditor" "$UPROJECT" -game -log
```

**Run a commandlet or automation script:**

```bash
"$UE/Engine/Binaries/Linux/UnrealEditor-Cmd" "$UPROJECT" -unattended -nop4 -nosplash -nullrhi -run=<CommandletName> -log
```

**Run an editor Python script with `PythonScriptPlugin` enabled for the project:**

```bash
"$UE/Engine/Binaries/Linux/UnrealEditor-Cmd" "$UPROJECT" -unattended -nop4 -nosplash -nullrhi -ExecutePythonScript="/absolute/path/to/script.py" -log
```

**Run Scanwright importer from the local control repo:**

```bash
/Users/nicholas.parkes/Repos/adaptsim-hackathon/scripts/run_scan_import_on_vm.sh \
  /absolute/path/on/vm/to/scan.glb \
  demo_scan \
  -- --replace-existing --collision-mode complex --scale 1.0 --rotation-deg 0,0,0
```

**Run horror corridor import from the local control repo:**

```bash
/Users/nicholas.parkes/Repos/adaptsim-hackathon/scripts/run_scan_import_on_vm.sh \
  /home/nicholas.parkes/adaptsim-assets/horror-corridor-vr-room-baked/source/Untitled.glb \
  horror_corridor \
  -- --dest-root /Game/AdaptSim/Imported \
     --demo-level-path /Game/AdaptSim/Maps/L_HorrorCorridor_Imported \
     --replace-existing \
     --collision-mode complex \
     --scale 1.0 \
     --nav-extent-cm 1400,1400,800 \
     --semantic-anchors \
     --semantic-anchor-mode target_point
```

**Run horror corridor validation on the VM:**

```bash
"$UE/Engine/Binaries/Linux/UnrealEditor-Cmd" "$UPROJECT" \
  -unattended -nop4 -nosplash -nullrhi \
  -ExecutePythonScript="$PROJECT/Content/Python/AdaptSim/validate_imported_scene.py" \
  -AdaptSimValidateArgsB64=<base64 of: --map-path /Game/AdaptSim/Maps/L_HorrorCorridor_Imported --content-path /Game/AdaptSim/Imported/horror_corridor --min-semantic-placeholders 8> \
  -log
```

**Run ScenarioDirector automation against the final horror corridor examples on the VM:**

```bash
MANIFEST="$PROJECT/Saved/AdaptSimContractExamples/scenario_manifests/horror_corridor_ambush_delay_001.json"
ENVIRONMENT="$PROJECT/Saved/AdaptSimContractExamples/semantic_environments/horror_corridor_imported.json"

"$UE/Engine/Binaries/Linux/UnrealEditor-Cmd" "$UPROJECT" \
  -game -unattended -nop4 -nosplash -nullrhi -NoSound \
  -AdaptSimScenarioManifest="$MANIFEST" \
  -AdaptSimSemanticEnvironment="$ENVIRONMENT" \
  -AdaptSimScenarioDirectorFireAllForTest \
  -AdaptSimScenarioDirectorExitAfterTest \
  -log
```

Use `horror_corridor_observer_detection_001.json` for the second variation. The older generic hallway fallback remains available with `scan_hallway_delay_001.json` plus `scanned_hallway_alpha.json`.

**Start or verify Pixel Streaming:**

```bash
curl -I http://127.0.0.1/player.html
tail -f "$HOME/adaptsim-pixelstreaming/wilbur.log"
```

From the local machine, open the direct public browser player for the real WebRTC media path:

```text
http://34.139.126.187/player.html
```

Use this tunnel only as an HTTP/signalling health check. It does not forward the browser's WebRTC UDP media path:

```bash
gcloud compute ssh --zone "us-east1-d" "linux-pixel-streaming" --project "gecko-dev-fde" --tunnel-through-iap -- -N -L 18080:127.0.0.1:80
```

Then open:

```text
http://127.0.0.1:18080/player.html
```

## Current Build Artifacts

**Last verified builds:** `AdaptSimEditor Linux Development` and `AdaptSim Linux Development` both succeeded on 2026-05-03 during the Integration Marshal pass.

`Binaries/Linux` now contains editor artifacts and a standalone development game target:

- `libUnrealEditor-AdaptSim.so`
- `libUnrealEditor-AdaptSim.debug`
- `libUnrealEditor-AdaptSim.sym`
- `AdaptSimEditor.target`
- `UnrealEditor.modules`
- `AdaptSim`
- `AdaptSim.target`

**ScenarioDirector verification:**

- Headless automation with `scan_hallway_delay_001` succeeded: manifest and semantic environment JSON loaded, trigger fired, two placeholder adversaries spawned, telemetry logged, process exited cleanly.
- Headless automation with `scan_hallway_observer_002` succeeded: barricade and placeholder adversary spawned, telemetry logged, process exited cleanly.
- Horror corridor smoke automation with `horror_corridor_anchor_smoke` succeeded on `/Game/AdaptSim/Maps/L_HorrorCorridor_Imported`: manifest and exported semantic environment loaded, `hallway_center` trigger fired, `AAdaptSimAdversaryCharacter` spawned at `ambush_point`, fallback was `cover`, telemetry JSONL was written under `Saved/AdaptSimTelemetry`, and the process exited cleanly.
- Final integration run on 2026-05-03 synced local contract examples to `Saved/AdaptSimContractExamples`, using the confirmed Cartographer semantic export with anchors `entry`, `exit`, `hallway_center`, `doorway`, `cover`, `ambush_point`, `observation_point`, and `chokepoint`.
- `horror_corridor_ambush_delay_001` succeeded after sync against `/Game/AdaptSim/Maps/L_HorrorCorridor_Imported`: `prop_light_barricade` spawned at `chokepoint`, two `AdaptSimAdversaryCharacter` actors spawned for `adversary_rifleman_irregular`, fallback anchor resolved to `exit`, telemetry JSONL was written to `Saved/AdaptSimTelemetry/horror_corridor_ambush_delay_001_20260503T015018Z.jsonl`, and the process exited cleanly.
- `horror_corridor_observer_detection_001` succeeded after sync and wrote `Saved/AdaptSimTelemetry/horror_corridor_observer_detection_001_20260503T015047Z.jsonl`; it spawned one prop and one `AdaptSimAdversaryCharacter`, but the adversary resolved to the accepted fallback spawn path rather than the named `observation_point`.
- Integration Marshal 30-second run on 2026-05-03 wrote `Saved/AdaptSimTelemetry/horror_corridor_ambush_delay_001_20260503T030408Z.jsonl` with 27 events: `run_started`, prop spawn, two `AdaptSimAdversaryCharacter` spawns, behavior binding, perception, `holding_contact`, `moving_to_fallback`, fallback move failures, and `run_ended` at `sim_time_s=30.001`.
- Input-loop verification on 2026-05-03 wrote `Saved/AdaptSimTelemetry/horror_corridor_ambush_delay_001_20260503T030511Z.jsonl`; logs show `demo_input_received key=1`, `scenario_start_requested`, `scenario_started`, and a 25-second demo hold window. Because the selected manifest's adversary event is `trainee_enters_anchor`, the input-only run starts the scenario and spawns the on-start prop, while adversary spawn still requires the chokepoint trigger or automation fire-all.
- Game-mode visual verification on 2026-05-03 wrote `/home/nicholas.parkes/Documents/Unreal Projects/AdaptSim/Saved/Screenshots/LinuxEditor/HighresScreenshot00000.png`; local copy is `contracts/examples/telemetry/horror_corridor_ambush_delay_001_visual.png`. The adversary marker is bright yellow and visible, but the phase label is mirrored from that camera angle.
- Local artifacts generated from the fresh ambush JSONL: `contracts/examples/telemetry/horror_corridor_ambush_delay_001_live.jsonl`, `contracts/examples/telemetry/horror_corridor_ambush_delay_001_live.json`, and `contracts/examples/aar/horror_corridor_ambush_delay_001_live_aar.md`.
- Local validation after integration: `python3 contracts/validate_contracts.py contracts/examples` passed for 14 files, and `python3 -m unittest contracts.test_aar_generator` passed.

**Pixel Streaming verification:**

- `PixelStreaming2` is enabled in `AdaptSim.uproject`.
- Wilbur / signalling process was running on 2026-05-03 with player web port `80`, streamer port `8888`, and SFU port `8889`.
- Offscreen Unreal streamer was running `/Game/AdaptSim/Maps/L_HorrorCorridor_Imported` with `-PixelStreamingConnectionURL=ws://127.0.0.1:8888`.
- Signalling log showed remote players joining and Unreal receiving media/data track setup. One browser run stalled at `WEBRTC CONNECTION NEGOTIATED` when public ICE candidates advertised `49152-49154` ports.
- The live VM Unreal streamer was restarted on 2026-05-03 with manifest-aware input args, `-PixelStreamingWebRTCMinPort=19302 -PixelStreamingWebRTCMaxPort=19303`, and audio transmit/receive disabled. A clean browser session then reached live H.264 video at `1280x720`, rising decoded frames, and `Controls stream input: true`.
- The successful no-audio session still advertised `49152-49153`, so the existing `pixel-streaming-hc` UDP `19302,19303` firewall rule is preflight context, not proof of the final ICE route. If the browser stalls again, close stale tabs, use a fresh/cache-busted player URL, and inspect Wilbur/player ICE candidates before assuming a render or content regression.
- Local tunnel test to `http://127.0.0.1:18080/player.html` returned HTTP 200; use the tunnel result as signalling/web reachability only, not proof that WebRTC video can cross the network.

**Adversary plugin verification:**

- `AdaptSimAdversary` compiles and loads.
- Smoke console command spawned `AAdaptSimAdversaryCharacter`, AIController, temporary nav area, target pawn, and activated `observe_and_withdraw`.
- AI perception fired and behavior phase advanced to withdrawal.
- The smoke command does not yet have a clean command-line automation exit path; a `-ExecCmds` attempt treated `observe_and_withdraw;quit` as one profile argument.
- Fallback movement in the smoke test reported an unsuccessful move/projection, so nav/fallback behavior still needs a real-level test after scan import.

## Guardrails For Future Agents

- Do not delete VM files, Unreal caches, Docker images, captures, or generated assets without explicit user approval.
- The Unreal project is on the VM, not in the local repo.
- Horror corridor uses `TargetPoint` semantic placeholders in the saved map until an interactive/lower-level pass converts them to `ASemanticAnchor`.
- Keep local repo changes focused on durable agent context, documentation, scripts, and orchestration unless the user explicitly asks for gameplay work.
- Treat Pixel Streaming as currently running but process-managed by documented commands and pid/log files, not yet a committed service unit or repo launcher script.
- Avoid recording secrets from `/etc/turnserver.conf` or other service configs in this repo.

## Known Blockers / Gaps

- `gcloud compute ssh` prints `Updating project ssh metadata... failed.` but SSH still succeeds.
- Native `ASemanticAnchor` placement through editor Python crashed twice under `-nullrhi` with `SIGFPE` in `FSceneViewport::EnqueueBeginRenderFrame` / hit-proxy placement. The imported horror corridor map therefore uses tagged `TargetPoint` placeholders for now.
- Semantic anchors/export classes exist and compile, but the imported horror corridor still uses tagged `TargetPoint` placeholders for null-RHI safety. `Saved/SemanticExports/horror_corridor_imported.json` is the current semantic environment export for ScenarioDirector manifests.
- `AAdaptSimDemoPlayerController` binds keyboard `1`/numpad `1` and can launch the configured manifest with `-AdaptSimDemoInputStart`; there is still no `trainee_action` telemetry event for the key press.
- The preferred demo manifest uses `trainee_enters_anchor` for adversary contact, so pressing `1` starts the scenario but adversary spawn requires moving through the chokepoint trigger or using `-AdaptSimScenarioDirectorFireAllForTest`.
- In the final ambush telemetry, one of the two multi-count adversary spawn records still reports the legacy/derived anchor id `ambush_service_alcove` even though the confirmed manifest hint is `ambush_point`.
- The observer variation succeeds but resolves the adversary to accepted fallback placement rather than the named `observation_point` anchor.
- Pixel Streaming runs through ad hoc Wilbur/Unreal processes with pid files under `/home/nicholas.parkes/adaptsim-pixelstreaming`; no systemd unit or repo launcher script is committed yet.
- Pixel Streaming video can stall at `WEBRTC CONNECTION NEGOTIATED` if the browser keeps a stale negotiation or Unreal advertises ports that the network path does not pass. Future agents must run `scripts/check_pixelstreaming_webrtc_firewall.sh` before Pixel Streaming work. `OK_WORKAROUND` is enough to try the no-admin path, but verify live ICE candidates and use the no-audio launch flags; the preferred `adaptsim-pixelstreaming-webrtc` UDP/TCP `49152-49200` rule remains optional permanent cleanup.
- Fab import status is pending. The VM currently does not show an installed Fab plugin, so the exact authenticated acquisition/import path still needs to be resolved.
