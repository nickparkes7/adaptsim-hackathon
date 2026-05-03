# Trellis Static Prop Worker Note

The MVP Trellis slice lives in `workers/asset-generation/` and is optional. It
consumes the existing `asset_generation_request` contract and publishes the
existing `asset_generation_result` contract without editing shared models.

The worker is prompt-driven. `barricade`, `debris`, and `cover` are only the
first demo presets with convenient default metadata; they are not intended to be
a closed list. A simple local request can name any `prop_kind`, prompt, asset
label, display name, bounds, and tags without changing `contracts/models.py`.

Generated asset cards are marked `ingestion_status: "prototype"` and
`spawn_policy: "never_spawn"` so ScenarioDirector cannot depend on them until a
human or import worker reviews the GLB, imports it into Unreal, sets a
`/Game/...` path, and whitelists it.

Current output layout:

```text
captures/<capture_id>/asset-generation/<request_id>/
  static-props/<asset_id>.glb
  static-props/<asset_id>.asset_card.json
  asset_generation_result.json
  trellis_static_prop_report.json
  logs/
```

The report includes explicit scale, pivot, and collision notes:

- Scale: preset meter bounds for the intended Unreal size.
- Pivot: bottom-center floor contact after import review.
- Collision: simple box or convex blocking collision before whitelisting.

The dynamic rendering/import boundary is still intentional: the A100 worker
produces GLB candidates and draft metadata; Unreal/L4 remains responsible for
actual runtime import/render validation, collision, scale, and whitelist
activation.

No contract-model change was made in this slice. Proposed future contract
extensions, if Agent 1 wants them later:

- Add a generated artifact type for static prop GLB/model files to
  `GeneratedAssetReference.artifact_type`.
- Add an optional structured import note object to `AssetCard`, for scale,
  pivot, collision, and review checklist fields.
