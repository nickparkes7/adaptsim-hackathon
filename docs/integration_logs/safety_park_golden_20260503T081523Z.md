# Safety Park Golden MVP Verification

- Result: `PASS`
- Completed at: `2026-05-03T08:40:09Z`
- Capture id: `safety_park`
- Scenario id: `safety_park_mvp_001`
- API run id: `run_safety_park_mvp_001_mopishcj_a58acc`
- Local log dir: `/Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z`

## GCS Paths

- Capture prefix: `gs://aiscanners-hackathon2025/adaptsim-captures/captures/safety_park/`
- Metadata: `gs://aiscanners-hackathon2025/adaptsim-captures/captures/safety_park/raw/metadata.json`
- Status: `gs://aiscanners-hackathon2025/adaptsim-captures/captures/safety_park/status.json`
- Scenario manifest: `gs://aiscanners-hackathon2025/adaptsim-captures/captures/safety_park/scenario_manifests/safety_park_mvp_001.json`
- Scene mesh GLB: `gs://aiscanners-hackathon2025/adaptsim-captures/captures/safety_park/unreal-import/scene_mesh.glb`
- Reconstruction manifest: `gs://aiscanners-hackathon2025/adaptsim-captures/captures/safety_park/unreal-import/reconstruction_manifest.json`
- Import report: `gs://aiscanners-hackathon2025/adaptsim-captures/captures/safety_park/unreal/import_report.json`
- Semantic environment: `gs://aiscanners-hackathon2025/adaptsim-captures/captures/safety_park/unreal/semantic_environment.json`
- A100 logs prefix: `gs://aiscanners-hackathon2025/adaptsim-captures/captures/safety_park/logs/`
- Verifier bundle: `gs://aiscanners-hackathon2025/adaptsim-captures/captures/safety_park/logs/integration/safety_park_golden_20260503T081523Z/repo-bundle.tgz`
- L4 import log: `gs://aiscanners-hackathon2025/adaptsim-captures/captures/safety_park/unreal/logs/import.log`

## VM Paths

- A100 staged repo: `/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/repo` on `gecko-dev-fde/a100-instance-02`
- A100 golden dataset: `/home/nicholas.parkes/adaptsim/fvdb_safety_park_runs/fvdb_safety_park_20260502_060531/data/safety_park`
- A100 DLNR truncation margin m: `0.5`
- L4 staged repo: `/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/repo` on `gecko-dev-fde/linux-pixel-streaming`
- Per-run Python env: `/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/venv`
- A100 capture root: `/home/nicholas.parkes/adaptsim/data/captures/safety_park`
- L4 capture root: `/home/nicholas.parkes/adaptsim/data/captures/safety_park`
- L4 scenario manifest: `/home/nicholas.parkes/adaptsim/data/captures/safety_park/scenario_manifests/safety_park_mvp_001.json`
- L4 semantic environment: `/home/nicholas.parkes/adaptsim/data/captures/safety_park/unreal/semantic_environment.json`
- A100 worker log: `/home/nicholas.parkes/adaptsim/data/captures/safety_park/logs/a100-reconstruction.log`
- A100 FVDB log: `/home/nicholas.parkes/adaptsim/data/captures/safety_park/logs/fvdb_frgs.log`
- A100 mesh postprocess log: `/home/nicholas.parkes/adaptsim/data/captures/safety_park/logs/mesh_postprocess.log`
- L4 import log: `/home/nicholas.parkes/adaptsim/data/captures/safety_park/unreal/logs/import.log`
- Pixel Streaming signalling log: `/home/nicholas.parkes/adaptsim-pixelstreaming/wilbur.log`
- Pixel Streaming Unreal log: `/home/nicholas.parkes/adaptsim-pixelstreaming/unreal-pixelstreaming.log`

## Step Results

| Result | Step | Log |
| --- | --- | --- |
| `PASS` | validate local contracts | `/Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/validate-local-contracts.log` |
| `PASS` | bundle verifier code for VMs | `/Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/bundle-verifier-code-for-vms.log` |
| `PASS` | upload verifier bundle to GCS | `/Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/upload-verifier-bundle-to-gcs.log` |
| `PASS` | stage verifier repo on A100 | `/Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/stage-verifier-repo-on-a100.log` |
| `PASS` | stage verifier repo on L4 | `/Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/stage-verifier-repo-on-l4.log` |
| `PASS` | seed safety_park metadata to GCS | `/Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/seed-safety_park-metadata-to-gcs.log` |
| `PASS` | seed safety_park queued status to GCS | `/Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/seed-safety_park-queued-status-to-gcs.log` |
| `PASS` | upload safety_park scenario manifest to GCS | `/Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/upload-safety_park-scenario-manifest-to-gcs.log` |
| `PASS` | run A100 safety_park reconstruction | `/Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/run-a100-safety_park-reconstruction.log` |
| `PASS` | download scene_mesh.glb from GCS | `/Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/download-scene_mesh.glb-from-gcs.log` |
| `PASS` | download reconstruction_manifest from GCS | `/Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/download-reconstruction_manifest-from-gcs.log` |
| `PASS` | verify reconstruction artifacts | `/Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/verify-reconstruction-artifacts.log` |
| `PASS` | run L4 Unreal import | `/Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/run-l4-unreal-import.log` |
| `PASS` | download import_report from GCS | `/Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/download-import_report-from-gcs.log` |
| `PASS` | download semantic_environment from GCS | `/Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/download-semantic_environment-from-gcs.log` |
| `PASS` | verify Unreal import artifacts | `/Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/verify-unreal-import-artifacts.log` |
| `PASS` | sync scenario manifest to L4 capture root | `/Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/sync-scenario-manifest-to-l4-capture-root.log` |
| `PASS` | start local AdaptSim API | `/Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/api-server.log` |
| `PASS` | verify scenario manifest endpoint | `/Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/verify-scenario-manifest-endpoint.log` |
| `PASS` | verify scenario manifest payload | `/Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/verify-scenario-manifest-payload.log` |
| `PASS` | launch Pixel Streaming through API | `/Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/launch-pixel-streaming-through-api.log` |
| `PASS` | verify stream status endpoint | `/Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/artifacts/stream-status.json` |
| `PASS` | verify telemetry endpoint | `/Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/verify-telemetry-endpoint.log` |
| `PASS` | verify telemetry payload | `/Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/verify-telemetry-payload.log` |
| `PASS` | verify AAR endpoint | `/Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/verify-aar-endpoint.log` |
| `PASS` | verify AAR payload | `/Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/verify-aar-payload.log` |

## Exact Commands

```bash

[validate local contracts]
$ python3 contracts/validate_contracts.py contracts/examples

[bundle verifier code for VMs]
$ env COPYFILE_DISABLE=1 tar --no-xattrs -czf /Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/repo-bundle.tgz contracts workers unreal scripts/pixel-streaming

[upload verifier bundle to GCS]
$ gcloud --quiet --project gecko-dev-fde storage cp /Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/repo-bundle.tgz gs://aiscanners-hackathon2025/adaptsim-captures/captures/safety_park/logs/integration/safety_park_golden_20260503T081523Z/repo-bundle.tgz

[stage verifier repo on A100]
$ gcloud --quiet compute ssh --zone us-east1-b a100-instance-02 --project gecko-dev-fde --tunnel-through-iap --command $'set -euo pipefail\nrm -rf \'/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/repo\'\nmkdir -p \'/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/repo\'\ngcloud --quiet storage cp \'gs://aiscanners-hackathon2025/adaptsim-captures/captures/safety_park/logs/integration/safety_park_golden_20260503T081523Z/repo-bundle.tgz\' \'/tmp/safety_park_golden_20260503T081523Z-repo.tgz\'\ntar -xzf \'/tmp/safety_park_golden_20260503T081523Z-repo.tgz\' -C \'/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/repo\'\nchmod +x \'/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/repo/workers/a100-reconstruction/adaptsim-reconstruct\'\nchmod +x \'/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/repo/workers/l4-unreal-import/adaptsim-import-capture\'\nchmod +x \'/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/repo/workers/l4-unreal-import/adaptsim-convert-mesh\'\nchmod +x \'/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/repo/scripts/pixel-streaming/adaptsim-pixel-streaming.sh\'\nif python3 -m venv \'/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/venv\' >/tmp/safety_park_golden_20260503T081523Z-venv.log 2>&1; then\n  \'/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/venv/bin/python\' -m pip install --upgrade pip >>/tmp/safety_park_golden_20260503T081523Z-venv.log 2>&1\n  \'/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/venv/bin/python\' -m pip install -r \'/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/repo/contracts/requirements.txt\' >>/tmp/safety_park_golden_20260503T081523Z-venv.log 2>&1\nelse\n  rm -rf \'/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/venv\'\n  python3 -m pip install --user --break-system-packages -r \'/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/repo/contracts/requirements.txt\'\nfi'

[stage verifier repo on L4]
$ gcloud --quiet compute ssh --zone us-east1-d linux-pixel-streaming --project gecko-dev-fde --tunnel-through-iap --command $'set -euo pipefail\nrm -rf \'/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/repo\'\nmkdir -p \'/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/repo\'\ngcloud --quiet storage cp \'gs://aiscanners-hackathon2025/adaptsim-captures/captures/safety_park/logs/integration/safety_park_golden_20260503T081523Z/repo-bundle.tgz\' \'/tmp/safety_park_golden_20260503T081523Z-repo.tgz\'\ntar -xzf \'/tmp/safety_park_golden_20260503T081523Z-repo.tgz\' -C \'/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/repo\'\nchmod +x \'/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/repo/workers/a100-reconstruction/adaptsim-reconstruct\'\nchmod +x \'/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/repo/workers/l4-unreal-import/adaptsim-import-capture\'\nchmod +x \'/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/repo/workers/l4-unreal-import/adaptsim-convert-mesh\'\nchmod +x \'/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/repo/scripts/pixel-streaming/adaptsim-pixel-streaming.sh\'\nif python3 -m venv \'/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/venv\' >/tmp/safety_park_golden_20260503T081523Z-venv.log 2>&1; then\n  \'/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/venv/bin/python\' -m pip install --upgrade pip >>/tmp/safety_park_golden_20260503T081523Z-venv.log 2>&1\n  \'/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/venv/bin/python\' -m pip install -r \'/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/repo/contracts/requirements.txt\' >>/tmp/safety_park_golden_20260503T081523Z-venv.log 2>&1\nelse\n  rm -rf \'/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/venv\'\n  python3 -m pip install --user --break-system-packages -r \'/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/repo/contracts/requirements.txt\'\nfi'

[seed safety_park metadata to GCS]
$ gcloud --quiet --project gecko-dev-fde storage cp contracts/examples/capture_metadata/safety_park_golden.json gs://aiscanners-hackathon2025/adaptsim-captures/captures/safety_park/raw/metadata.json

[seed safety_park queued status to GCS]
$ gcloud --quiet --project gecko-dev-fde storage cp contracts/examples/capture_status/safety_park_queued.json gs://aiscanners-hackathon2025/adaptsim-captures/captures/safety_park/status.json

[upload safety_park scenario manifest to GCS]
$ gcloud --quiet --project gecko-dev-fde storage cp contracts/examples/scenario_manifests/safety_park_mvp_001.json gs://aiscanners-hackathon2025/adaptsim-captures/captures/safety_park/scenario_manifests/safety_park_mvp_001.json

[run A100 safety_park reconstruction]
$ gcloud --quiet compute ssh --zone us-east1-b a100-instance-02 --project gecko-dev-fde --tunnel-through-iap --command $'set -euo pipefail\ncd \'/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/repo\'\nexport PATH=\'/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/venv/bin\':"$PATH"\nexport PYTHONPATH=\'/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/repo\':"${PYTHONPATH:-}"\nexport ADAPTSIM_MESH_CONVERTER=\'/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/repo/workers/l4-unreal-import/adaptsim-convert-mesh\'\nmkdir -p \'/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/prior-a100-capture\'\nfor name in reconstruction unreal-import logs; do\n  if [ -e \'/home/nicholas.parkes/adaptsim/data/captures/safety_park\'/"${name}" ]; then\n    mv \'/home/nicholas.parkes/adaptsim/data/captures/safety_park\'/"${name}" \'/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/prior-a100-capture/\'"${name}-$(date -u +%Y%m%dT%H%M%SZ)"\n  fi\ndone\nworkers/a100-reconstruction/adaptsim-reconstruct \\\n  --capture-id \'safety_park\' \\\n  --gcs-root \'gs://aiscanners-hackathon2025/adaptsim-captures\' \\\n  --dataset-mode golden \\\n  --golden-dataset-dir \'/home/nicholas.parkes/adaptsim/fvdb_safety_park_runs/fvdb_safety_park_20260502_060531/data/safety_park\' \\\n  --dlnr-truncation-margin-m \'0.5\''

[download scene_mesh.glb from GCS]
$ gcloud --quiet --project gecko-dev-fde storage cp gs://aiscanners-hackathon2025/adaptsim-captures/captures/safety_park/unreal-import/scene_mesh.glb /Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/artifacts/scene_mesh.glb

[download reconstruction_manifest from GCS]
$ gcloud --quiet --project gecko-dev-fde storage cp gs://aiscanners-hackathon2025/adaptsim-captures/captures/safety_park/unreal-import/reconstruction_manifest.json /Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/artifacts/reconstruction_manifest.json

[verify reconstruction artifacts]
$ python3 -c $'\nimport json\nimport pathlib\nimport sys\n\nglb_path = pathlib.Path(sys.argv[1])\nmanifest_path = pathlib.Path(sys.argv[2])\ncapture_id = sys.argv[3]\nif glb_path.stat().st_size <= 0:\n    raise SystemExit("scene_mesh.glb is empty")\nif glb_path.read_bytes()[:4] != b"glTF":\n    raise SystemExit("scene_mesh.glb does not have GLB magic")\nmanifest = json.loads(manifest_path.read_text(encoding="utf-8"))\nif manifest.get("contract_type") != "reconstruction_manifest":\n    raise SystemExit("wrong reconstruction manifest contract_type")\nif manifest.get("capture_id") != capture_id:\n    raise SystemExit("reconstruction manifest capture_id mismatch")\nartifact_types = {item.get("artifact_type") for item in manifest.get("artifacts", [])}\nrequired = {"unreal_mesh_glb", "reconstruction_manifest"}\nmissing = sorted(required - artifact_types)\nif missing:\n    raise SystemExit(f"reconstruction manifest missing artifacts: {missing}")\n' /Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/artifacts/scene_mesh.glb /Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/artifacts/reconstruction_manifest.json safety_park

[run L4 Unreal import]
$ gcloud --quiet compute ssh --zone us-east1-d linux-pixel-streaming --project gecko-dev-fde --tunnel-through-iap --command $'set -euo pipefail\ncd \'/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/repo\'\nexport PATH=\'/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/venv/bin\':"$PATH"\nexport PYTHONPATH=\'/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/repo\':"${PYTHONPATH:-}"\nworkers/l4-unreal-import/adaptsim-import-capture \\\n  --capture-id \'safety_park\' \\\n  --gcs-root \'gs://aiscanners-hackathon2025/adaptsim-captures\' \\\n  --final-phase ready'

[download import_report from GCS]
$ gcloud --quiet --project gecko-dev-fde storage cp gs://aiscanners-hackathon2025/adaptsim-captures/captures/safety_park/unreal/import_report.json /Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/artifacts/import_report.json

[download semantic_environment from GCS]
$ gcloud --quiet --project gecko-dev-fde storage cp gs://aiscanners-hackathon2025/adaptsim-captures/captures/safety_park/unreal/semantic_environment.json /Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/artifacts/semantic_environment.json

[verify Unreal import artifacts]
$ python3 -c $'\nimport json\nimport pathlib\nimport sys\n\nreport = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))\nsemantic = json.loads(pathlib.Path(sys.argv[2]).read_text(encoding="utf-8"))\ncapture_id = sys.argv[3]\nif report.get("contract_type") != "unreal_import_report":\n    raise SystemExit("wrong import report contract_type")\nif report.get("capture_id") != capture_id:\n    raise SystemExit("import report capture_id mismatch")\nif report.get("status") != "ready":\n    raise SystemExit("import report status is {!r}, not ready".format(report.get("status")))\nif not report.get("level_path"):\n    raise SystemExit("import report missing level_path")\nif semantic.get("contract_type") != "semantic_environment":\n    raise SystemExit("wrong semantic environment contract_type")\nif semantic.get("environment_id") != capture_id:\n    raise SystemExit("semantic environment_id mismatch")\nif len(semantic.get("anchors") or []) < 4:\n    raise SystemExit("semantic environment has too few anchors")\n' /Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/artifacts/import_report.json /Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/artifacts/semantic_environment.json safety_park

[sync scenario manifest to L4 capture root]
$ gcloud --quiet compute ssh --zone us-east1-d linux-pixel-streaming --project gecko-dev-fde --tunnel-through-iap --command $'set -euo pipefail\nmkdir -p \'/home/nicholas.parkes/adaptsim/data/captures/safety_park/scenario_manifests\'\ngcloud --quiet storage cp \'gs://aiscanners-hackathon2025/adaptsim-captures/captures/safety_park/scenario_manifests/safety_park_mvp_001.json\' \'/home/nicholas.parkes/adaptsim/data/captures/safety_park/scenario_manifests/safety_park_mvp_001.json\'\ntest -s \'/home/nicholas.parkes/adaptsim/data/captures/safety_park/scenario_manifests/safety_park_mvp_001.json\'\ntest -s \'/home/nicholas.parkes/adaptsim/data/captures/safety_park/unreal/semantic_environment.json\''

[start local AdaptSim API]
$ PORT=18787 HOST=127.0.0.1 ADAPTSIM_ENABLE_WORKER_TRIGGERS=1 ADAPTSIM_WORKER_TRIGGER_TIMEOUT_MS=120000 ADAPTSIM_L4_STATUS_TIMEOUT_MS=60000 ADAPTSIM_GCP_PROJECT=gecko-dev-fde ADAPTSIM_L4_REPO_ROOT=/home/nicholas.parkes/adaptsim/integration-runs/safety_park_golden_20260503T081523Z/repo node server/index.js > /Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/api-server.log 2>&1 &

[verify scenario manifest endpoint]
$ curl -fsS http://127.0.0.1:18787/api/v1/scenarios/safety_park_mvp_001/manifest -o /Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/artifacts/scenario_manifest_api.json

[verify scenario manifest payload]
$ python3 -c $'\nimport json\nimport pathlib\nimport sys\n\npayload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))\nscenario_id = sys.argv[2]\ncapture_id = sys.argv[3]\nif payload.get("contract_type") != "scenario_manifest":\n    raise SystemExit("wrong scenario manifest contract_type")\nif payload.get("scenario_id") != scenario_id:\n    raise SystemExit("scenario_id mismatch")\nif payload.get("environment_id") != capture_id:\n    raise SystemExit("environment_id mismatch")\nif not payload.get("events"):\n    raise SystemExit("scenario manifest has no events")\n' /Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/artifacts/scenario_manifest_api.json safety_park_mvp_001 safety_park

[launch Pixel Streaming through API]
$ curl -fsS -X POST -H Content-Type:\ application/json --data-binary @/Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/artifacts/launch-body.json http://127.0.0.1:18787/api/v1/scenes/safety_park/scenarios/safety_park_mvp_001/launch -o /Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/artifacts/launch-response.json

[poll stream status endpoint]
$ curl -fsS http://127.0.0.1:18787/api/v1/runs/run_safety_park_mvp_001_mopishcj_a58acc/stream -o /Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/artifacts/stream-status.json

[verify telemetry endpoint]
$ curl -fsS http://127.0.0.1:18787/api/v1/runs/run_safety_park_mvp_001_mopishcj_a58acc/telemetry\?tail=5 -o /Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/artifacts/telemetry.json

[verify telemetry payload]
$ python3 -c $'\nimport json\nimport pathlib\nimport sys\n\npayload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))\nrun_id = sys.argv[2]\nscenario_id = sys.argv[3]\nif payload.get("contract_type") != "telemetry_log":\n    raise SystemExit("wrong telemetry contract_type")\nif payload.get("run_id") != run_id:\n    raise SystemExit("telemetry run_id mismatch")\nif payload.get("scenario_id") != scenario_id:\n    raise SystemExit("telemetry scenario_id mismatch")\nif not payload.get("events"):\n    raise SystemExit("telemetry has no events")\n' /Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/artifacts/telemetry.json run_safety_park_mvp_001_mopishcj_a58acc safety_park_mvp_001

[verify AAR endpoint]
$ curl -fsS http://127.0.0.1:18787/api/v1/runs/run_safety_park_mvp_001_mopishcj_a58acc/aar -o /Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/artifacts/aar.json

[verify AAR payload]
$ python3 -c $'\nimport json\nimport pathlib\nimport sys\n\npayload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))\nrun_id = sys.argv[2]\nscenario_id = sys.argv[3]\nif payload.get("run_id") != run_id:\n    raise SystemExit("AAR run_id mismatch")\nif payload.get("scenario_id") != scenario_id:\n    raise SystemExit("AAR scenario_id mismatch")\nif payload.get("content_type") != "text/markdown":\n    raise SystemExit("AAR content_type mismatch")\nif "After Action Review" not in payload.get("markdown", ""):\n    raise SystemExit("AAR markdown missing expected title")\n' /Users/nicholas.parkes/Repos/adaptsim-hackathon/.adaptsim/integration-logs/safety_park_golden_20260503T081523Z/artifacts/aar.json run_safety_park_mvp_001_mopishcj_a58acc safety_park_mvp_001
```
