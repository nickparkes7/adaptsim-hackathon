from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


SCHEMA_VERSION = "1.0"
GCS_BUCKET = "aiscanners-hackathon2025"
GCS_CAPTURE_PREFIX = "adaptsim-captures"
GCS_SIGNING_SERVICE_ACCOUNT = "photogrammetry-test@gecko-dev-fde.iam.gserviceaccount.com"
GCS_SIGNING_REGION = "us"

Identifier = Annotated[str, Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")]
Tag = Annotated[str, Field(pattern=r"^[a-z][a-z0-9_]{1,63}$")]
AssetPath = Annotated[str, Field(pattern=r"^/Game/.+")]
GcsUri = Annotated[str, Field(pattern=r"^gs://[A-Za-z0-9._-]+/.+")]
HttpOrApiUrl = Annotated[str, Field(pattern=r"^(https?://|/api/).+")]
Probability = Annotated[float, Field(ge=0, le=1)]
Meters = float
JsonScalar = str | int | float | bool | None

CapturePhase = Literal[
    "created",
    "uploading",
    "uploaded",
    "queued_reconstruction",
    "validating_images",
    "sfm_solving",
    "sfm_failed",
    "reconstructing_splat",
    "exporting_splat",
    "extracting_mesh",
    "postprocessing_mesh",
    "ready_for_unreal_import",
    "importing_unreal",
    "imported_unreal",
    "ready",
    "failed",
]

ArtifactType = Literal[
    "raw_metadata",
    "raw_image",
    "image_validation_log",
    "sfm_report",
    "colmap_sparse_model",
    "splat_ply",
    "splat_usdz",
    "mesh_dlnr_ply",
    "reconstruction_report",
    "unreal_mesh_glb",
    "unreal_mesh_decimated_glb",
    "collision_proxy_obj",
    "reconstruction_manifest",
    "unreal_import_report",
    "semantic_environment",
    "import_log",
    "unreal_level",
    "asset_card",
    "scenario_manifest",
]


def expected_capture_gcs_prefix(capture_id: str) -> str:
    return f"gs://{GCS_BUCKET}/{GCS_CAPTURE_PREFIX}/captures/{capture_id}/"


class ContractModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
        validate_assignment=True,
    )


class BoundsM(ContractModel):
    x: Meters = Field(gt=0)
    y: Meters = Field(gt=0)
    z: Meters = Field(gt=0)


class Transform(ContractModel):
    location_m: tuple[float, float, float]
    rotation_deg: tuple[float, float, float] = (0.0, 0.0, 0.0)


class ScaleHint(ContractModel):
    type: Literal["known_distance", "calibration_marker", "unknown"]
    label: str | None = Field(default=None, max_length=96)
    distance_m: float | None = Field(default=None, gt=0)
    confidence: Literal["operator_provided", "estimated", "unknown"] = "unknown"

    @model_validator(mode="after")
    def validate_scale_fields(self) -> ScaleHint:
        if self.type in {"known_distance", "calibration_marker"} and self.distance_m is None:
            raise ValueError(f"{self.type} scale_hint requires distance_m")
        if self.type == "unknown" and self.distance_m is not None:
            raise ValueError("unknown scale_hint must not include distance_m")
        return self


class CaptureImage(ContractModel):
    filename: str = Field(pattern=r"^[A-Za-z0-9_. -]{1,160}$")
    content_type: Literal["image/jpeg", "image/png", "image/heic", "image/heif"]
    size_bytes: int = Field(gt=0)
    gcs_uri: GcsUri
    width_px: int | None = Field(default=None, gt=0)
    height_px: int | None = Field(default=None, gt=0)
    sha256: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")


class CaptureMetadata(ContractModel):
    contract_type: Literal["capture_metadata"] = "capture_metadata"
    schema_version: Literal["1.0"] = SCHEMA_VERSION
    capture_id: Identifier = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    display_name: str = Field(min_length=1, max_length=120)
    operator_id: Identifier = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    created_at: datetime
    environment_type: Tag = Field(pattern=r"^[a-z][a-z0-9_]{1,63}$")
    expected_image_count: int = Field(ge=1, le=5000)
    uploaded_image_count: int = Field(ge=0, le=5000)
    scale_hint: ScaleHint
    notes: str | None = Field(default=None, max_length=1000)
    gcs_bucket: Literal["aiscanners-hackathon2025"] = GCS_BUCKET
    gcs_capture_prefix: Literal["adaptsim-captures"] = GCS_CAPTURE_PREFIX
    gcs_prefix: GcsUri
    signing_service_account: Literal[
        "photogrammetry-test@gecko-dev-fde.iam.gserviceaccount.com"
    ] = GCS_SIGNING_SERVICE_ACCOUNT
    signing_region: Literal["us"] = GCS_SIGNING_REGION
    images: list[CaptureImage] = Field(default_factory=list, max_length=5000)

    @model_validator(mode="after")
    def validate_capture_storage(self) -> CaptureMetadata:
        expected_prefix = expected_capture_gcs_prefix(self.capture_id)
        if self.gcs_prefix != expected_prefix:
            raise ValueError(f"gcs_prefix must be {expected_prefix!r}")
        if self.images and self.uploaded_image_count != len(self.images):
            raise ValueError("uploaded_image_count must match images length when images are listed")
        image_prefix = f"{expected_prefix}raw/images/"
        filenames = [image.filename for image in self.images]
        duplicates = {filename for filename in filenames if filenames.count(filename) > 1}
        if duplicates:
            raise ValueError(f"duplicate image filenames: {sorted(duplicates)}")
        for image in self.images:
            if not image.gcs_uri.startswith(image_prefix):
                raise ValueError(f"image {image.filename!r} gcs_uri must start with {image_prefix!r}")
        return self


class CaptureProgress(ContractModel):
    phase: CapturePhase
    message: str = Field(min_length=1, max_length=300)
    percent: int = Field(ge=0, le=100)


class CaptureSfmStatus(ContractModel):
    input_images: int = Field(ge=0)
    registered_images: int | None = Field(default=None, ge=0)
    sparse_points: int | None = Field(default=None, ge=0)
    report_uri: GcsUri | None = None


class CaptureArtifactLinks(ContractModel):
    raw_metadata_uri: GcsUri | None = None
    sfm_report_uri: GcsUri | None = None
    splat_ply_uri: GcsUri | None = None
    splat_usdz_url: HttpOrApiUrl | None = None
    mesh_preview_url: HttpOrApiUrl | None = None
    unreal_mesh_url: HttpOrApiUrl | None = None
    reconstruction_manifest_uri: GcsUri | None = None
    unreal_import_report_uri: GcsUri | None = None
    semantic_environment_uri: GcsUri | None = None


class CaptureUnrealStatus(ContractModel):
    status: Literal["not_started", "queued", "importing", "imported", "ready", "failed"] = "not_started"
    level_path: AssetPath | None = None
    import_report_uri: GcsUri | None = None

    @model_validator(mode="after")
    def validate_level_requirement(self) -> CaptureUnrealStatus:
        if self.status in {"imported", "ready"} and not self.level_path:
            raise ValueError("imported or ready Unreal status requires level_path")
        return self


class CaptureError(ContractModel):
    code: Tag = Field(pattern=r"^[a-z][a-z0-9_]{1,63}$")
    message: str = Field(min_length=1, max_length=500)
    failed_phase: CapturePhase | None = None
    retryable: bool = False


class CaptureStatus(ContractModel):
    contract_type: Literal["capture_status"] = "capture_status"
    schema_version: Literal["1.0"] = SCHEMA_VERSION
    capture_id: Identifier = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    display_name: str = Field(min_length=1, max_length=120)
    status: CapturePhase
    updated_at: datetime
    gcs_prefix: GcsUri
    progress: CaptureProgress
    sfm: CaptureSfmStatus | None = None
    artifacts: CaptureArtifactLinks = Field(default_factory=CaptureArtifactLinks)
    unreal: CaptureUnrealStatus = Field(default_factory=CaptureUnrealStatus)
    error: CaptureError | None = None

    @model_validator(mode="after")
    def validate_status_consistency(self) -> CaptureStatus:
        expected_prefix = expected_capture_gcs_prefix(self.capture_id)
        if self.gcs_prefix != expected_prefix:
            raise ValueError(f"gcs_prefix must be {expected_prefix!r}")
        if self.progress.phase != self.status:
            raise ValueError("progress.phase must match status")
        if self.status in {"sfm_failed", "failed"} and self.error is None:
            raise ValueError("failed statuses require error")
        if self.status == "ready":
            if self.progress.percent != 100:
                raise ValueError("ready status requires progress.percent=100")
            if self.unreal.status != "ready":
                raise ValueError("ready status requires unreal.status='ready'")
        return self


class WorkerInfo(ContractModel):
    worker_id: Identifier = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    vm_instance: str = Field(min_length=1, max_length=96)
    zone: str = Field(min_length=1, max_length=64)
    tool_versions: dict[str, str] = Field(default_factory=dict, max_length=32)


class BoxBounds(ContractModel):
    center_m: tuple[float, float, float]
    size_m: BoundsM


class ReconstructionArtifact(ContractModel):
    artifact_type: ArtifactType
    content_type: str = Field(min_length=1, max_length=120)
    gcs_uri: GcsUri
    size_bytes: int | None = Field(default=None, gt=0)
    sha256: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")


class CoordinateFrame(ContractModel):
    units: Literal["meters"] = "meters"
    up_axis: Literal["z", "y"] = "z"
    forward_axis: Literal["x", "y", "-x", "-y"] = "x"
    handedness: Literal["right", "left"] = "right"
    scale_to_meters: float = Field(gt=0)


class UnrealTransformHint(ContractModel):
    origin: Literal["capture_origin", "mesh_centroid", "operator_marker", "unknown"]
    scale: float = Field(gt=0)
    rotation_deg: tuple[float, float, float] = (0.0, 0.0, 0.0)
    translation_m: tuple[float, float, float] = (0.0, 0.0, 0.0)


class MeshStats(ContractModel):
    vertices: int = Field(ge=0)
    faces: int = Field(ge=0)
    bounds_m: BoxBounds


class ReconstructionManifest(ContractModel):
    contract_type: Literal["reconstruction_manifest"] = "reconstruction_manifest"
    schema_version: Literal["1.0"] = SCHEMA_VERSION
    capture_id: Identifier = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    generated_at: datetime
    gcs_prefix: GcsUri
    worker: WorkerInfo
    raw_metadata_uri: GcsUri
    image_count: int = Field(ge=1, le=5000)
    registered_image_count: int = Field(ge=0, le=5000)
    sparse_point_count: int | None = Field(default=None, ge=0)
    reconstruction_method: Literal["fvdb_frgs_dlnr_mesh"] = "fvdb_frgs_dlnr_mesh"
    dlnr_truncation_margin_m: float = Field(gt=0)
    coordinate_frame: CoordinateFrame
    transform_to_unreal: UnrealTransformHint
    source_mesh: MeshStats
    render_mesh: MeshStats
    collision_proxy: MeshStats | None = None
    artifacts: list[ReconstructionArtifact] = Field(min_length=1, max_length=32)
    warnings: list[str] = Field(default_factory=list, max_length=32)

    @model_validator(mode="after")
    def validate_manifest(self) -> ReconstructionManifest:
        expected_prefix = expected_capture_gcs_prefix(self.capture_id)
        if self.gcs_prefix != expected_prefix:
            raise ValueError(f"gcs_prefix must be {expected_prefix!r}")
        if self.registered_image_count > self.image_count:
            raise ValueError("registered_image_count cannot exceed image_count")
        artifact_types = [artifact.artifact_type for artifact in self.artifacts]
        duplicates = {artifact_type for artifact_type in artifact_types if artifact_types.count(artifact_type) > 1}
        if duplicates:
            raise ValueError(f"duplicate artifact_type values: {sorted(duplicates)}")
        required = {"raw_metadata", "sfm_report", "mesh_dlnr_ply", "unreal_mesh_glb"}
        missing = required - set(artifact_types)
        if missing:
            raise ValueError(f"reconstruction manifest missing required artifacts: {sorted(missing)}")
        for artifact in self.artifacts:
            if not artifact.gcs_uri.startswith(expected_prefix):
                raise ValueError(f"{artifact.artifact_type} gcs_uri must start with {expected_prefix!r}")
        return self


class UnrealImportedAsset(ContractModel):
    asset_type: Literal["level", "static_mesh", "material", "texture", "collision", "navmesh", "player_start"]
    asset_path: AssetPath
    source_artifact_type: ArtifactType | None = None


class UnrealImportValidation(ContractModel):
    level_exists: bool
    static_mesh_count: int = Field(ge=0)
    materials_assigned: bool
    collision_configured: bool
    nanite_enabled: bool
    player_start_present: bool
    navmesh_bounds_present: bool
    semantic_placeholders_present: bool


class UnrealImportReport(ContractModel):
    contract_type: Literal["unreal_import_report"] = "unreal_import_report"
    schema_version: Literal["1.0"] = SCHEMA_VERSION
    capture_id: Identifier = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    generated_at: datetime
    status: Literal["imported_unreal", "ready", "failed"]
    worker: WorkerInfo
    reconstruction_manifest_uri: GcsUri
    gcs_prefix: GcsUri
    unreal_project_path: str = Field(min_length=1, max_length=260)
    content_root_path: AssetPath
    level_path: AssetPath | None = None
    imported_assets: list[UnrealImportedAsset] = Field(default_factory=list, max_length=64)
    validation: UnrealImportValidation
    import_duration_s: float | None = Field(default=None, ge=0)
    import_log_uri: GcsUri | None = None
    semantic_environment_uri: GcsUri | None = None
    warnings: list[str] = Field(default_factory=list, max_length=32)
    errors: list[str] = Field(default_factory=list, max_length=32)

    @model_validator(mode="after")
    def validate_import_report(self) -> UnrealImportReport:
        expected_prefix = expected_capture_gcs_prefix(self.capture_id)
        if self.gcs_prefix != expected_prefix:
            raise ValueError(f"gcs_prefix must be {expected_prefix!r}")
        if not self.reconstruction_manifest_uri.startswith(expected_prefix):
            raise ValueError("reconstruction_manifest_uri must be under capture gcs_prefix")
        if self.import_log_uri and not self.import_log_uri.startswith(expected_prefix):
            raise ValueError("import_log_uri must be under capture gcs_prefix")
        if self.semantic_environment_uri and not self.semantic_environment_uri.startswith(expected_prefix):
            raise ValueError("semantic_environment_uri must be under capture gcs_prefix")
        if self.status in {"imported_unreal", "ready"}:
            if not self.level_path:
                raise ValueError("successful Unreal imports require level_path")
            if not self.imported_assets:
                raise ValueError("successful Unreal imports require imported_assets")
            checks = self.validation
            if not (
                checks.level_exists
                and checks.static_mesh_count > 0
                and checks.materials_assigned
                and checks.collision_configured
                and checks.player_start_present
                and checks.navmesh_bounds_present
                and checks.semantic_placeholders_present
            ):
                raise ValueError("successful Unreal imports require core validation checks to pass")
        if self.status == "failed" and not self.errors:
            raise ValueError("failed Unreal imports require errors")
        return self


class AssetGenerationSource(ContractModel):
    reconstruction_manifest_uri: GcsUri | None = None
    unreal_import_report_uri: GcsUri | None = None
    semantic_environment_uri: GcsUri | None = None


class AssetGenerationRequest(ContractModel):
    contract_type: Literal["asset_generation_request"] = "asset_generation_request"
    schema_version: Literal["1.0"] = SCHEMA_VERSION
    request_id: Identifier = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    capture_id: Identifier = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    requested_at: datetime
    requester_id: Identifier = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    source: AssetGenerationSource
    outputs_requested: list[Literal["semantic_environment", "asset_card", "scenario_manifest"]] = Field(
        min_length=1,
        max_length=8,
    )
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("outputs_requested")
    @classmethod
    def validate_outputs_requested(cls, value: list[str]) -> list[str]:
        if len(value) != len(set(value)):
            raise ValueError("outputs_requested must be unique")
        return value

    @model_validator(mode="after")
    def validate_source_present(self) -> AssetGenerationRequest:
        if not (
            self.source.reconstruction_manifest_uri
            or self.source.unreal_import_report_uri
            or self.source.semantic_environment_uri
        ):
            raise ValueError("asset generation request requires at least one source URI")
        return self


class GeneratedAssetReference(ContractModel):
    artifact_type: Literal["semantic_environment", "asset_card", "scenario_manifest", "unreal_level"]
    artifact_id: Identifier | None = None
    gcs_uri: GcsUri | None = None
    unreal_asset_path: AssetPath | None = None

    @model_validator(mode="after")
    def validate_reference_target(self) -> GeneratedAssetReference:
        if not self.gcs_uri and not self.unreal_asset_path:
            raise ValueError("generated asset references require gcs_uri or unreal_asset_path")
        return self


class AssetGenerationResult(ContractModel):
    contract_type: Literal["asset_generation_result"] = "asset_generation_result"
    schema_version: Literal["1.0"] = SCHEMA_VERSION
    request_id: Identifier = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    capture_id: Identifier = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    generated_at: datetime
    status: Literal["queued", "running", "succeeded", "failed"]
    generated_assets: list[GeneratedAssetReference] = Field(default_factory=list, max_length=32)
    warnings: list[str] = Field(default_factory=list, max_length=32)
    errors: list[str] = Field(default_factory=list, max_length=32)

    @model_validator(mode="after")
    def validate_result_status(self) -> AssetGenerationResult:
        if self.status == "succeeded" and not self.generated_assets:
            raise ValueError("succeeded asset generation results require generated_assets")
        if self.status == "failed" and not self.errors:
            raise ValueError("failed asset generation results require errors")
        return self


class AssetCard(ContractModel):
    contract_type: Literal["asset_card"] = "asset_card"
    schema_version: Literal["1.0"] = SCHEMA_VERSION
    asset_id: Identifier = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    category: Literal[
        "threat_vector",
        "adversary_role",
        "static_prop",
        "equipment",
        "effect",
        "objective_marker",
        "training_marker",
    ]
    display_name: str = Field(min_length=1, max_length=96)
    description: str = Field(min_length=1, max_length=500)
    unreal_asset_path: AssetPath | None = Field(
        default=None,
        description="Reviewed Unreal class, Blueprint, mesh, or data asset path.",
    )
    spawn_policy: Literal["never_spawn", "scenario_director_whitelist"]
    gameplay_tags: list[Tag] = Field(min_length=1, max_length=32)
    capabilities: list[Tag] = Field(default_factory=list, max_length=32)
    equipment: list[Tag] = Field(default_factory=list, max_length=24)
    preferred_affordances: list[Tag] = Field(default_factory=list, max_length=32)
    constraints: list[Tag] = Field(default_factory=list, max_length=32)
    behavior_profiles: list[Identifier] = Field(default_factory=list, max_length=12)
    likelihood_modifiers: dict[Tag, float] = Field(default_factory=dict)
    collision_profile: Literal["none", "block_all", "overlap_only", "pawn"]
    bounds_m: BoundsM | None = None
    ingestion_status: Literal["ready", "prototype", "placeholder"] = "prototype"

    @field_validator(
        "gameplay_tags",
        "capabilities",
        "equipment",
        "preferred_affordances",
        "constraints",
        "behavior_profiles",
    )
    @classmethod
    def require_unique_values(cls, value: list[str]) -> list[str]:
        if len(value) != len(set(value)):
            raise ValueError("values must be unique")
        return value

    @field_validator(
        "gameplay_tags",
        "capabilities",
        "equipment",
        "preferred_affordances",
        "constraints",
        "behavior_profiles",
    )
    @classmethod
    def validate_tokens(cls, value: list[str]) -> list[str]:
        for token in value:
            if not token or not token.replace("_", "").isalnum() or not token[0].isalpha():
                raise ValueError(f"invalid token: {token!r}")
        return value

    @field_validator("likelihood_modifiers")
    @classmethod
    def validate_modifiers(cls, value: dict[str, float]) -> dict[str, float]:
        for key, modifier in value.items():
            if not key or not key.replace("_", "").isalnum() or not key[0].isalpha():
                raise ValueError(f"invalid likelihood modifier key: {key!r}")
            if modifier < 0.0 or modifier > 3.0:
                raise ValueError(f"likelihood modifier {key!r} must be between 0.0 and 3.0")
        return value

    @model_validator(mode="after")
    def validate_spawn_contract(self) -> AssetCard:
        if self.spawn_policy == "scenario_director_whitelist":
            if not self.unreal_asset_path:
                raise ValueError("whitelisted spawnable assets require unreal_asset_path")
            if not self.behavior_profiles:
                raise ValueError("whitelisted spawnable assets require at least one behavior_profile")
        return self


class BehaviorProfile(ContractModel):
    contract_type: Literal["behavior_profile"] = "behavior_profile"
    schema_version: Literal["1.0"] = SCHEMA_VERSION
    behavior_profile_id: Identifier = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    display_name: str = Field(min_length=1, max_length=96)
    applies_to_categories: list[
        Literal[
            "threat_vector",
            "adversary_role",
            "static_prop",
            "equipment",
            "effect",
            "objective_marker",
            "training_marker",
        ]
    ] = Field(min_length=1, max_length=8)
    runtime_system: Literal["none", "state_tree", "behavior_tree", "smart_object", "gameplay_ability"]
    runtime_asset_path: AssetPath | None = None
    planner_summary: str = Field(min_length=1, max_length=500)
    activation_tags: list[Tag] = Field(default_factory=list, max_length=24)
    permitted_actions: list[Tag] = Field(min_length=1, max_length=32)
    completion_criteria: list[str] = Field(min_length=1, max_length=12)
    telemetry_markers: list[Tag] = Field(default_factory=list, max_length=24)

    @field_validator("activation_tags", "permitted_actions", "telemetry_markers")
    @classmethod
    def validate_tags(cls, value: list[str]) -> list[str]:
        if len(value) != len(set(value)):
            raise ValueError("values must be unique")
        for tag in value:
            if not tag or not tag.replace("_", "").isalnum() or not tag[0].isalpha():
                raise ValueError(f"invalid tag: {tag!r}")
        return value

    @model_validator(mode="after")
    def validate_runtime_asset(self) -> BehaviorProfile:
        if self.runtime_system != "none" and not self.runtime_asset_path:
            raise ValueError("runtime_asset_path is required unless runtime_system is 'none'")
        return self


class SemanticAnchor(ContractModel):
    contract_type: Literal["semantic_anchor"] = "semantic_anchor"
    schema_version: Literal["1.0"] = SCHEMA_VERSION
    anchor_id: Identifier = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    anchor_type: Literal[
        "room",
        "hallway",
        "door",
        "window",
        "entry_point",
        "exit",
        "cover",
        "concealment",
        "chokepoint",
        "line_of_sight",
        "fallback_route",
        "no_spawn_zone",
        "objective_area",
        "spawn_zone",
    ]
    display_name: str = Field(min_length=1, max_length=96)
    tags: list[Tag] = Field(min_length=1, max_length=32)
    transform: Transform
    extent_m: tuple[float, float, float] | None = None
    navmesh_reachable: bool = True
    linked_anchor_ids: list[Identifier] = Field(default_factory=list, max_length=32)
    notes: str | None = Field(default=None, max_length=300)

    @field_validator("tags", "linked_anchor_ids")
    @classmethod
    def validate_unique_tokens(cls, value: list[str]) -> list[str]:
        if len(value) != len(set(value)):
            raise ValueError("values must be unique")
        for token in value:
            if not token or not token.replace("_", "").isalnum() or not token[0].isalpha():
                raise ValueError(f"invalid token: {token!r}")
        return value

    @model_validator(mode="after")
    def require_type_tag(self) -> SemanticAnchor:
        if self.anchor_type not in self.tags:
            raise ValueError("tags must include anchor_type")
        return self


class AnchorEdge(ContractModel):
    from_anchor_id: Identifier = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    to_anchor_id: Identifier = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    relation: Literal["contains", "connects", "adjacent", "visible_from", "route_to", "near"]
    distance_m: float | None = Field(default=None, ge=0)


class SemanticEnvironment(ContractModel):
    contract_type: Literal["semantic_environment"] = "semantic_environment"
    schema_version: Literal["1.0"] = SCHEMA_VERSION
    environment_id: Identifier = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    source_scan_id: Identifier = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    unreal_level_path: AssetPath = Field(pattern=r"^/Game/.+")
    coordinate_frame: Literal["unreal_world_m"] = "unreal_world_m"
    units: Literal["meters"] = "meters"
    anchors: list[SemanticAnchor] = Field(min_length=1, max_length=256)
    graph_edges: list[AnchorEdge] = Field(default_factory=list, max_length=512)

    @model_validator(mode="after")
    def validate_anchor_references(self) -> SemanticEnvironment:
        anchor_ids = [anchor.anchor_id for anchor in self.anchors]
        duplicates = {anchor_id for anchor_id in anchor_ids if anchor_ids.count(anchor_id) > 1}
        if duplicates:
            raise ValueError(f"duplicate anchor_id values: {sorted(duplicates)}")
        anchor_set = set(anchor_ids)
        for anchor in self.anchors:
            missing = set(anchor.linked_anchor_ids) - anchor_set
            if missing:
                raise ValueError(f"{anchor.anchor_id} links to unknown anchors: {sorted(missing)}")
        for edge in self.graph_edges:
            if edge.from_anchor_id not in anchor_set or edge.to_anchor_id not in anchor_set:
                raise ValueError(
                    f"edge references unknown anchor: {edge.from_anchor_id}->{edge.to_anchor_id}"
                )
        return self


class Trigger(ContractModel):
    trigger_type: Literal[
        "on_scenario_start",
        "trainee_enters_anchor",
        "timer_elapsed",
        "manual",
        "telemetry_condition",
    ]
    anchor_id: Identifier | None = None
    delay_s: float | None = Field(default=None, ge=0)
    condition: str | None = Field(default=None, min_length=1, max_length=300)

    @model_validator(mode="after")
    def validate_trigger_requirements(self) -> Trigger:
        if self.trigger_type == "trainee_enters_anchor" and not self.anchor_id:
            raise ValueError("trainee_enters_anchor trigger requires anchor_id")
        if self.trigger_type == "timer_elapsed" and self.delay_s is None:
            raise ValueError("timer_elapsed trigger requires delay_s")
        if self.trigger_type == "telemetry_condition" and not self.condition:
            raise ValueError("telemetry_condition trigger requires condition")
        return self


class ScenarioEvent(ContractModel):
    event_id: Identifier = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    event_type: Literal[
        "adversary_contact",
        "static_prop_spawn",
        "environmental_effect",
        "objective_marker",
        "inject",
    ]
    asset_id: Identifier = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    count: int = Field(ge=1, le=16)
    intent: Tag = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    required_tags: list[Tag] = Field(min_length=1, max_length=24)
    avoid_tags: list[Tag] = Field(default_factory=list, max_length=24)
    severity: Probability = Field(ge=0, le=1)
    likelihood: Probability = Field(
        ge=0,
        le=1,
        description="Scenario likelihood under stated assumptions, not calibrated intelligence truth.",
    )
    likelihood_basis: Literal["scenario_likelihood_under_assumptions"] = (
        "scenario_likelihood_under_assumptions"
    )
    behavior_profile: Identifier = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    trigger: Trigger
    rationale: str = Field(min_length=1, max_length=700)
    max_distance_to_trainee_m: float | None = Field(default=None, gt=0)
    parameters: dict[str, JsonScalar] = Field(default_factory=dict)

    @field_validator("required_tags", "avoid_tags")
    @classmethod
    def validate_tags(cls, value: list[str]) -> list[str]:
        if len(value) != len(set(value)):
            raise ValueError("values must be unique")
        for tag in value:
            if not tag or not tag.replace("_", "").isalnum() or not tag[0].isalpha():
                raise ValueError(f"invalid tag: {tag!r}")
        return value


class ScenarioManifest(ContractModel):
    contract_type: Literal["scenario_manifest"] = "scenario_manifest"
    schema_version: Literal["1.0"] = SCHEMA_VERSION
    scenario_id: Identifier = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    environment_id: Identifier = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    display_name: str = Field(min_length=1, max_length=120)
    planner_id: Identifier = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    generated_at: datetime
    training_objective: str = Field(min_length=1, max_length=700)
    assumptions: list[str] = Field(min_length=1, max_length=12)
    likelihood_semantics: Literal[
        "scenario_likelihood_under_assumptions_not_calibrated_intelligence_truth"
    ] = "scenario_likelihood_under_assumptions_not_calibrated_intelligence_truth"
    required_asset_ids: list[Identifier] = Field(min_length=1, max_length=32)
    events: list[ScenarioEvent] = Field(min_length=1, max_length=24)

    @field_validator("required_asset_ids")
    @classmethod
    def validate_required_assets(cls, value: list[str]) -> list[str]:
        if len(value) != len(set(value)):
            raise ValueError("required_asset_ids must be unique")
        return value

    @model_validator(mode="after")
    def validate_event_references(self) -> ScenarioManifest:
        event_ids = [event.event_id for event in self.events]
        duplicates = {event_id for event_id in event_ids if event_ids.count(event_id) > 1}
        if duplicates:
            raise ValueError(f"duplicate event_id values: {sorted(duplicates)}")
        required_assets = set(self.required_asset_ids)
        for event in self.events:
            if event.asset_id not in required_assets:
                raise ValueError(
                    f"event {event.event_id} asset_id {event.asset_id!r} is not listed in required_asset_ids"
                )
        return self


ActorIdentifier = str


class TelemetryEvent(ContractModel):
    contract_type: Literal["telemetry_event"] = "telemetry_event"
    schema_version: Literal["1.0"] = SCHEMA_VERSION
    event_id: Identifier = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    run_id: Identifier = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    scenario_id: Identifier = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    timestamp: datetime
    sim_time_s: float = Field(ge=0)
    source: Literal["trainee", "scenario_director", "adversary_ai", "environment", "system"]
    event_type: Literal[
        "run_started",
        "trigger_fired",
        "asset_spawned",
        "perception_contact",
        "trainee_action",
        "actor_state",
        "hit_event",
        "objective_update",
        "run_ended",
        "adversary_spawned",
        "behavior_binding",
        "behavior_profile_started",
        "phase_changed",
        "perception_target_seen",
        "contact_opened",
        "withdraw_started",
        "move_to_fallback_started",
        "move_to_fallback_succeeded",
        "move_to_fallback_failed",
    ]
    scenario_event_id: Identifier | None = None
    actor_id: ActorIdentifier | None = Field(default=None, pattern=r"^[A-Za-z0-9_./:-]{1,128}$")
    asset_id: Identifier | None = None
    anchor_id: Identifier | None = None
    position_m: tuple[float, float, float] | None = None
    data: dict[str, JsonScalar] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_event_requirements(self) -> TelemetryEvent:
        if self.event_type == "asset_spawned" and not self.asset_id:
            raise ValueError("asset_spawned telemetry requires asset_id")
        if self.event_type == "trigger_fired" and not self.scenario_event_id:
            raise ValueError("trigger_fired telemetry requires scenario_event_id")
        return self


class TelemetryLog(ContractModel):
    contract_type: Literal["telemetry_log"] = "telemetry_log"
    schema_version: Literal["1.0"] = SCHEMA_VERSION
    run_id: Identifier = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    scenario_id: Identifier = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    events: list[TelemetryEvent] = Field(min_length=1, max_length=5000)

    @model_validator(mode="after")
    def validate_log_consistency(self) -> TelemetryLog:
        previous_time = -1.0
        for event in self.events:
            if event.run_id != self.run_id:
                raise ValueError(f"event {event.event_id} run_id does not match log run_id")
            if event.scenario_id != self.scenario_id:
                raise ValueError(f"event {event.event_id} scenario_id does not match log scenario_id")
            if event.sim_time_s < previous_time:
                raise ValueError("telemetry events must be sorted by nondecreasing sim_time_s")
            previous_time = event.sim_time_s
        return self


class ScoringMetric(ContractModel):
    metric_id: Identifier = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    description: str = Field(min_length=1, max_length=400)
    success_condition: str = Field(min_length=1, max_length=400)


class ReviewConstraints(ContractModel):
    do_not_infer_intent_without_telemetry: Literal[True] = True
    state_likelihood_as_scenario_based: Literal[True] = True


class AfterActionReviewInput(ContractModel):
    contract_type: Literal["after_action_review_input"] = "after_action_review_input"
    schema_version: Literal["1.0"] = SCHEMA_VERSION
    run_id: Identifier = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    scenario_id: Identifier = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    environment_id: Identifier = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    trainee_id: Identifier = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    training_objectives: list[str] = Field(min_length=1, max_length=12)
    scenario_assumptions: list[str] = Field(min_length=1, max_length=12)
    telemetry_events: list[TelemetryEvent] = Field(min_length=1, max_length=5000)
    scoring_rubric: list[ScoringMetric] = Field(min_length=1, max_length=24)
    review_constraints: ReviewConstraints = Field(default_factory=ReviewConstraints)

    @model_validator(mode="after")
    def validate_telemetry_scope(self) -> AfterActionReviewInput:
        previous_time = -1.0
        for event in self.telemetry_events:
            if event.run_id != self.run_id:
                raise ValueError(f"telemetry event {event.event_id} has a different run_id")
            if event.scenario_id != self.scenario_id:
                raise ValueError(f"telemetry event {event.event_id} has a different scenario_id")
            if event.sim_time_s < previous_time:
                raise ValueError("telemetry_events must be sorted by nondecreasing sim_time_s")
            previous_time = event.sim_time_s
        return self


CONTRACT_MODELS = {
    "capture_metadata": CaptureMetadata,
    "capture_status": CaptureStatus,
    "reconstruction_manifest": ReconstructionManifest,
    "unreal_import_report": UnrealImportReport,
    "asset_generation_request": AssetGenerationRequest,
    "asset_generation_result": AssetGenerationResult,
    "asset_card": AssetCard,
    "behavior_profile": BehaviorProfile,
    "semantic_anchor": SemanticAnchor,
    "semantic_environment": SemanticEnvironment,
    "scenario_manifest": ScenarioManifest,
    "telemetry_event": TelemetryEvent,
    "telemetry_log": TelemetryLog,
    "after_action_review_input": AfterActionReviewInput,
}

SCHEMA_MODELS = CONTRACT_MODELS
