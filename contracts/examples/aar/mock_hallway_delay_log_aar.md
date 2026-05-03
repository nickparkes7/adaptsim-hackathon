# After Action Review: run_hallway_delay_001

_Mode: deterministic telemetry-only fallback. No LLM coaching was used._

## Run Summary
- Run: `run_hallway_delay_001`
- Scenario: `scan_hallway_delay_001`
- Input contract: `telemetry_log`
- Duration covered: 62.0s across 8 telemetry event(s)
- Recorded outcome: `completed`
- Event counts: actor_state=1, asset_spawned=2, perception_contact=1, run_ended=1, run_started=1, trainee_action=1, trigger_fired=1

## Timeline
- 0.0s - `run_started` - Run started (operator='hackathon_demo').
- 4.8s - `trigger_fired` - Trigger fired for scenario event `delay_contact_001` at `hallway_main` via `trainee_enters_anchor`.
- 5.1s - `asset_spawned` - Spawned `adversary_rifleman_irregular` as `AI_Adversary_01` at `side_room_cover` using `ambush_then_reposition` for scenario event `delay_contact_001`.
- 5.2s - `asset_spawned` - Spawned `adversary_rifleman_irregular` as `AI_Adversary_02` at `side_room` using `ambush_then_reposition` for scenario event `delay_contact_001`.
- 8.7s - `perception_contact` - `AI_Adversary_01` detected `Trainee_01` by sight at `side_room_cover` for scenario event `delay_contact_001`.
- 9.1s - `trainee_action` - Trainee telemetry recorded `move_to_cover` at `hallway_main` with response_latency_s=0.4.
- 13.6s - `actor_state` - `AI_Adversary_01` reported state `withdraw` at `exit_rear` toward `exit_rear`.
- 62.0s - `run_ended` - Run ended with outcome `completed`.

## Key Observed Events
- 4.8s: Trigger fired for scenario event `delay_contact_001` at `hallway_main` via `trainee_enters_anchor`.
- 5.1s: Spawned `adversary_rifleman_irregular` as `AI_Adversary_01` at `side_room_cover` using `ambush_then_reposition` for scenario event `delay_contact_001`.
- 5.2s: Spawned `adversary_rifleman_irregular` as `AI_Adversary_02` at `side_room` using `ambush_then_reposition` for scenario event `delay_contact_001`.
- 8.7s: `AI_Adversary_01` detected `Trainee_01` by sight at `side_room_cover` for scenario event `delay_contact_001`.
- 9.1s: Trainee telemetry recorded `move_to_cover` at `hallway_main` with response_latency_s=0.4.
- 13.6s: `AI_Adversary_01` reported state `withdraw` at `exit_rear` toward `exit_rear`.
- 62.0s: Run ended with outcome `completed`.

## Missed Cues / Risks Based Only On Telemetry
- No trainee_action telemetry appears between first asset spawn at 5.1s and first perception_contact at 8.7s. This is a telemetry gap, not proof that a visible cue was missed.
- First trainee_action after contact `perception_contact_001` occurred 0.4s later as `move_to_cover`.
- After `AI_Adversary_01` reported `withdraw` toward `exit_rear`, no later trainee_action telemetry confirms follow-through or route awareness.

## Retry Focus
- Repeat contact response at `side_room_cover` and compare the 0.4s telemetry latency against the evaluator response window.
- Capture a post-withdrawal trainee_action or objective_update tied to `exit_rear` so route awareness is observable.
