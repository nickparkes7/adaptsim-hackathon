# Scanwright Scan Import Runbook

Scanwright keeps the editor automation in this repo and syncs it into the VM
Unreal project when needed.

## Script Paths

- Local repo mirror:
  `/Users/nicholas.parkes/Repos/adaptsim-hackathon/unreal/Content/Python/AdaptSim/import_scanned_scene.py`
- Intended VM project path:
  `/home/nicholas.parkes/Documents/Unreal Projects/AdaptSim/Content/Python/AdaptSim/import_scanned_scene.py`
- Helper:
  `/Users/nicholas.parkes/Repos/adaptsim-hackathon/scripts/run_scan_import_on_vm.sh`

## Supported Inputs

Expected input is an absolute mesh path that exists on the VM:

- Best practical path: `.fbx`, `.obj`, `.glb`, `.gltf`
- USD path where the plugin is available: `.usd`, `.usda`, `.usdc`, `.usdz`

RealityScan exports should be copied to a stable VM path first, for example:

```bash
/home/nicholas.parkes/adaptsim/scans/demo_hallway.glb
```

For the FVDB photo reconstruction path, the A100 worker should publish an
Unreal-ready mesh here:

```text
gs://aiscanners-hackathon2025/adaptsim-captures/captures/<capture_id>/unreal-import/scene_mesh.glb
```

The L4 Unreal VM should download that object to:

```text
/home/nicholas.parkes/adaptsim/scans/<capture_id>.glb
```

## One-Command VM Import

From the local repo:

```bash
/Users/nicholas.parkes/Repos/adaptsim-hackathon/scripts/run_scan_import_on_vm.sh \
  /home/nicholas.parkes/adaptsim/scans/demo_hallway.glb \
  demo_hallway \
  -- --replace-existing --collision-mode complex --scale 1.0 --rotation-deg 0,0,0
```

That command copies the Python script into the UE project, then runs
`UnrealEditor-Cmd` non-interactively.

## GCS Handoff Import

For reconstructed captures, first copy the generated GLB from GCS onto the L4
VM, then run the existing import helper.

On the L4 VM:

```bash
CAPTURE_ID="training_hallway_may_3"
GCS_ROOT="gs://aiscanners-hackathon2025/adaptsim-captures"
mkdir -p "$HOME/adaptsim/scans"

gcloud storage cp \
  "$GCS_ROOT/captures/$CAPTURE_ID/unreal-import/scene_mesh.glb" \
  "$HOME/adaptsim/scans/$CAPTURE_ID.glb"
```

From the local repo:

```bash
/Users/nicholas.parkes/Repos/adaptsim-hackathon/scripts/run_scan_import_on_vm.sh \
  "/home/nicholas.parkes/adaptsim/scans/$CAPTURE_ID.glb" \
  "$CAPTURE_ID" \
  -- --replace-existing --collision-mode complex --scale 1.0 --rotation-deg 0,0,0
```

Future work: replace this two-step manual flow with
`workers/l4-unreal-import/adaptsim-import-capture`, which should download the
mesh, run Unreal import, validate the level, and upload `unreal/import_report.json`
back to GCS.

## Direct UnrealEditor-Cmd Import

After the script exists under the VM project:

```bash
export UE="/home/nicholas.parkes/tools/unreal/UnrealEngine-5.7.4"
export PROJECT="/home/nicholas.parkes/Documents/Unreal Projects/AdaptSim"
export UPROJECT="$PROJECT/AdaptSim.uproject"

"$UE/Engine/Binaries/Linux/UnrealEditor-Cmd" "$UPROJECT" \
  -unattended -nop4 -nosplash -nullrhi \
  -ExecutePythonScript="$PROJECT/Content/Python/AdaptSim/import_scanned_scene.py" \
  -ScanwrightArgs="--source /home/nicholas.parkes/adaptsim/scans/demo_hallway.glb --scan-id demo_hallway --replace-existing --collision-mode complex --scale 1.0 --rotation-deg 0,0,0" \
  -log
```

Useful optional arguments:

- `--location-cm X,Y,Z`
- `--rotation-deg Pitch,Yaw,Roll`
- `--scale N`
- `--nav-extent-cm X,Y,Z`
- `--no-nanite`
- `--collision-mode complex|simple|none`
- `--no-demo-level`
- `--spawn-first-static-mesh-only`

## Created UE Content Paths

For `--scan-id demo_hallway`, the importer creates or updates:

- `/Game/AdaptSim/Scans/demo_hallway/...`
- `/Game/AdaptSim/Maps/L_ScannedDemo`

The demo level scaffold contains:

- `Scan_demo_hallway` or `Scan_demo_hallway_01...` static mesh actor(s)
- `AdaptSim_PlayerStart`
- `AdaptSim_KeyLight`
- `AdaptSim_DemoCamera`
- `AdaptSim_NavMeshBounds`

## Import Defaults

- Materials and textures are requested where the importer supports them.
- Dense static scan meshes are configured for Nanite when the API is available.
- Default collision is `complex`, using complex collision as simple for walkable scan geometry.
- Actor transform normalization is configurable with scale, location, and rotation.
- Existing content is not deleted. Existing scaffold actors are updated by label when found.

## Manual Visual Checks

Open `/Game/AdaptSim/Maps/L_ScannedDemo` and verify:

- The scan is upright, at the expected real-world scale, and near the world origin.
- RealityScan materials/textures survived the import.
- The player start is not inside scan geometry.
- Collision lets a pawn stand/walk on the intended floor surfaces.
- `P` navmesh preview covers the walkable floor after building paths.
- Nanite is enabled on dense scan meshes where appropriate.
- The camera sees the recognizable scanned environment.

## Known Plugin Blockers

- `PythonScriptPlugin` must be enabled before any editor Python command can run.
- `EditorScriptingUtilities` or equivalent editor scripting subsystems are needed for level creation, actor spawning, and asset save helpers.
- GLB/GLTF import depends on Unreal's Interchange import stack being available.
- USD/USDZ import depends on the USD importer plugin being enabled.
- This tool does not edit `AdaptSim.uproject` or `AdaptSim.Build.cs`; the Unreal Bootstrapper owns plugin enablement.
