# Current Demo Chain

## Canonical Inputs

- Local repo docs:
  - `../../hackathon_brief.md`
  - `../../adaptsim_hackathon_reference.md`
- VM project root: `~/adaptsim`
- Current synthetic scene: `~/adaptsim/data/captures/test_corridor.png`

## Working Spine

```text
1. Synthetic or captured scene image
2. Cosmos Reason2 scene analysis
3. Stub scenario director JSON
4. Edge-control video generation
5. Cosmos Transfer2.5 distilled edge video generation
```

## Known Working Commands

Reason2 analysis:

```bash
cd ~/adaptsim
source .venv/bin/activate
python scripts/analyze_scene.py data/captures/test_corridor.png \
  | tee data/outputs/test_corridor_reason2.txt
```

Scenario director stub:

```bash
cd ~/adaptsim
source .venv/bin/activate
python scripts/direct_scenario_stub.py \
  data/outputs/test_corridor_reason2.txt \
  --out data/outputs/test_corridor_scenario_stub.json
```

Safe Transfer2.5 path:

```text
Use the 480p corridor workflow from $adaptsim-transfer25 unless there is a specific reason to retry 720p.
```

## Next Likely Work

1. Finish or refresh `corridor_smoke_edge_480.mp4`.
2. Replace synthetic corridor input with a real captured frame or video.
3. Generate Transfer2.5 prompts/specs from the scenario stub output.
4. Add GPT-5.5 scenario director when an API key is available.
5. Add COLMAP/fVDB reconstruction after the video path is stable.
