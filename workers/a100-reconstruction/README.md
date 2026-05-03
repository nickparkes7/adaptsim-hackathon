# A100 Reconstruction Worker

Target CLI:

```bash
workers/a100-reconstruction/adaptsim-reconstruct \
  --capture-id CAPTURE_ID \
  --gcs-root gs://aiscanners-hackathon2025/adaptsim-captures
```

The worker mirrors each capture under:

```text
~/adaptsim/data/captures/<capture_id>/
```

It downloads `raw/metadata.json`, optional `status.json`, and `raw/images/`,
then writes `status.json` back to GCS as it moves through:

```text
validating_images
sfm_solving
reconstructing_splat
exporting_splat
extracting_mesh
postprocessing_mesh
ready_for_unreal_import
failed
```

## Golden Safety Park Mode

`--dataset-mode auto` uses FVDB tutorial data for `capture_id=safety_park`.
Set one of these when the tutorial scene is not in a known A100 location:

```bash
export ADAPTSIM_GOLDEN_SAFETY_PARK_DIR=/path/to/prepared/fvdb_or_colmap_scene
```

or pass:

```bash
--golden-dataset-dir /path/to/prepared/fvdb_or_colmap_scene
```

The golden path bypasses raw-photo SfM and runs:

```bash
frgs reconstruct <golden_dataset_dir> -o reconstruction/splat.ply
frgs convert reconstruction/splat.ply reconstruction/splat.usdz
frgs mesh-dlnr reconstruction/splat.ply -o reconstruction/mesh_dlnr.ply 0.10
```

## Raw Image Mode

For non-golden captures, the worker validates `raw/images/` and fails cleanly
when images are missing or below `--min-images`.

The raw-photo COLMAP path is staged behind:

```bash
--enable-raw-colmap
```

Without that flag, a valid raw image folder produces a clear
`raw_colmap_not_enabled` failure after `sfm_solving`, leaving status and logs in
GCS.

## Agent 5 Mesh Handoff

This worker does not implement PLY to GLB mesh conversion. It calls an Agent 5
converter if present via either:

```bash
export ADAPTSIM_MESH_CONVERTER=/path/to/adaptsim-convert-mesh
```

or:

```text
workers/l4-unreal-import/adaptsim-convert-mesh
```

Expected converter interface:

```bash
adaptsim-convert-mesh \
  --capture-id CAPTURE_ID \
  --source-mesh /local/capture/reconstruction/mesh_dlnr.ply \
  --output-glb /local/capture/unreal-import/scene_mesh.glb \
  --manifest-output /local/capture/unreal-import/reconstruction_manifest.json \
  --gcs-prefix gs://aiscanners-hackathon2025/adaptsim-captures/captures/CAPTURE_ID/ \
  --metadata /local/capture/raw/metadata.json \
  --sfm-report /local/capture/sfm/colmap/report.json
```

Clean handoff paths:

```text
reconstruction/mesh_dlnr.ply
unreal-import/scene_mesh.glb
unreal-import/reconstruction_manifest.json
```

