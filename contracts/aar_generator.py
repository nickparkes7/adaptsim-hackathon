#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pydantic import ValidationError

if __package__ is None or __package__ == "":
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from contracts.models import AfterActionReviewInput, TelemetryEvent, TelemetryLog


SUPPORTED_INPUTS = {
    "after_action_review_input",
    "telemetry_log",
}

KEY_EVENT_TYPES = {
    "trigger_fired",
    "asset_spawned",
    "perception_contact",
    "trainee_action",
    "actor_state",
    "hit_event",
    "objective_update",
    "run_ended",
}


@dataclass(frozen=True)
class AarContext:
    input_contract_type: str
    run_id: str
    scenario_id: str
    environment_id: str | None
    trainee_id: str | None
    training_objectives: list[str]
    scenario_assumptions: list[str]
    scoring_rubric: list[str]
    events: list[TelemetryEvent]


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"{path}: invalid JSON: {exc}") from exc


def load_contract(path: Path) -> AfterActionReviewInput | TelemetryLog:
    data = load_json(path)
    if not isinstance(data, dict):
        raise ValueError(f"{path}: top-level JSON value must be an object")

    contract_type = data.get("contract_type")
    if contract_type not in SUPPORTED_INPUTS:
        expected = ", ".join(sorted(SUPPORTED_INPUTS))
        raise ValueError(
            f"{path}: unsupported contract_type {contract_type!r}; expected one of {expected}"
        )

    model = AfterActionReviewInput if contract_type == "after_action_review_input" else TelemetryLog
    try:
        return model.model_validate(data)
    except ValidationError as exc:
        raise ValueError(f"{path}: {exc}") from exc


def context_from_contract(contract: AfterActionReviewInput | TelemetryLog) -> AarContext:
    if isinstance(contract, AfterActionReviewInput):
        return AarContext(
            input_contract_type=contract.contract_type,
            run_id=contract.run_id,
            scenario_id=contract.scenario_id,
            environment_id=contract.environment_id,
            trainee_id=contract.trainee_id,
            training_objectives=list(contract.training_objectives),
            scenario_assumptions=list(contract.scenario_assumptions),
            scoring_rubric=[
                f"{metric.metric_id}: {metric.description} Success condition: {metric.success_condition}"
                for metric in contract.scoring_rubric
            ],
            events=list(contract.telemetry_events),
        )

    return AarContext(
        input_contract_type=contract.contract_type,
        run_id=contract.run_id,
        scenario_id=contract.scenario_id,
        environment_id=None,
        trainee_id=None,
        training_objectives=[],
        scenario_assumptions=[],
        scoring_rubric=[],
        events=list(contract.events),
    )


def format_seconds(value: float | None) -> str:
    if value is None:
        return "unknown"
    return f"{value:.1f}s"


def code_or_unknown(value: str | None) -> str:
    return f"`{value}`" if value else "unknown"


def humanize_token(value: str) -> str:
    return value.replace("_", " ")


def data_value(event: TelemetryEvent, key: str) -> Any:
    return event.data.get(key)


def sorted_data_summary(event: TelemetryEvent, skip_keys: set[str] | None = None) -> str:
    skip_keys = skip_keys or set()
    parts = []
    for key in sorted(event.data):
        if key in skip_keys:
            continue
        value = event.data[key]
        parts.append(f"{key}={value!r}")
    return ", ".join(parts)


def describe_event(event: TelemetryEvent) -> str:
    anchor = f" at `{event.anchor_id}`" if event.anchor_id else ""
    actor = f" `{event.actor_id}`" if event.actor_id else ""
    scenario_event = (
        f" for scenario event `{event.scenario_event_id}`" if event.scenario_event_id else ""
    )

    if event.event_type == "run_started":
        details = sorted_data_summary(event)
        return f"Run started{f' ({details})' if details else ''}."

    if event.event_type == "trigger_fired":
        trigger_type = data_value(event, "trigger_type")
        suffix = f" via `{trigger_type}`" if trigger_type else ""
        return f"Trigger fired{scenario_event}{anchor}{suffix}."

    if event.event_type == "asset_spawned":
        behavior = data_value(event, "behavior_profile")
        behavior_text = f" using `{behavior}`" if behavior else ""
        return (
            f"Spawned {code_or_unknown(event.asset_id)}{f' as{actor}' if actor else ''}"
            f"{anchor}{behavior_text}{scenario_event}."
        )

    if event.event_type == "perception_contact":
        target = data_value(event, "target_actor_id")
        sense = data_value(event, "sense")
        target_text = f" detected `{target}`" if target else " registered contact"
        sense_text = f" by {sense}" if sense else ""
        return f"{code_or_unknown(event.actor_id)}{target_text}{sense_text}{anchor}{scenario_event}."

    if event.event_type == "trainee_action":
        action = data_value(event, "action")
        latency = data_value(event, "response_latency_s")
        action_text = f"`{action}`" if action else "action"
        latency_text = f" with response_latency_s={latency}" if latency is not None else ""
        return f"Trainee telemetry recorded {action_text}{anchor}{latency_text}."

    if event.event_type == "actor_state":
        state = data_value(event, "state")
        target_anchor = data_value(event, "target_anchor_id")
        state_text = f" state `{state}`" if state else " state update"
        target_text = f" toward `{target_anchor}`" if target_anchor else ""
        return f"{code_or_unknown(event.actor_id)} reported{state_text}{anchor}{target_text}."

    if event.event_type == "hit_event":
        details = sorted_data_summary(event)
        return f"Hit event recorded{f' ({details})' if details else ''}{anchor}."

    if event.event_type == "objective_update":
        details = sorted_data_summary(event)
        return f"Objective update recorded{f' ({details})' if details else ''}."

    if event.event_type == "run_ended":
        outcome = data_value(event, "outcome")
        outcome_text = f" with outcome `{outcome}`" if outcome else ""
        return f"Run ended{outcome_text}."

    details = sorted_data_summary(event)
    return f"{humanize_token(event.event_type).title()} from `{event.source}`{f' ({details})' if details else ''}."


def list_lines(items: list[str], empty_text: str) -> list[str]:
    if not items:
        return [f"- {empty_text}"]
    return [f"- {item}" for item in items]


def summarize_run(context: AarContext) -> list[str]:
    events = context.events
    first = events[0] if events else None
    last = events[-1] if events else None
    duration = last.sim_time_s - first.sim_time_s if first and last else None
    counts = Counter(event.event_type for event in events)
    run_end = next((event for event in reversed(events) if event.event_type == "run_ended"), None)
    outcome = data_value(run_end, "outcome") if run_end else None

    lines = [
        f"- Run: `{context.run_id}`",
        f"- Scenario: `{context.scenario_id}`",
        f"- Input contract: `{context.input_contract_type}`",
        f"- Duration covered: {format_seconds(duration)} across {len(events)} telemetry event(s)",
    ]
    if context.environment_id:
        lines.append(f"- Environment: `{context.environment_id}`")
    if context.trainee_id:
        lines.append(f"- Trainee: `{context.trainee_id}`")
    if outcome:
        lines.append(f"- Recorded outcome: `{outcome}`")
    if counts:
        event_counts = ", ".join(f"{event_type}={counts[event_type]}" for event_type in sorted(counts))
        lines.append(f"- Event counts: {event_counts}")
    if context.training_objectives:
        lines.append("- Training objectives:")
        lines.extend(f"  - {objective}" for objective in context.training_objectives)
    if context.scenario_assumptions:
        lines.append("- Scenario assumptions:")
        lines.extend(f"  - {assumption}" for assumption in context.scenario_assumptions)
    return lines


def timeline_lines(events: list[TelemetryEvent]) -> list[str]:
    if not events:
        return ["- No telemetry events supplied."]
    return [
        f"- {format_seconds(event.sim_time_s)} - `{event.event_type}` - {describe_event(event)}"
        for event in events
    ]


def key_observed_event_lines(events: list[TelemetryEvent]) -> list[str]:
    key_events = [event for event in events if event.event_type in KEY_EVENT_TYPES]
    if not key_events:
        return ["- No key event types were present in telemetry."]
    return [
        f"- {format_seconds(event.sim_time_s)}: {describe_event(event)}"
        for event in key_events
    ]


def first_after(events: list[TelemetryEvent], start_time: float, event_type: str) -> TelemetryEvent | None:
    return next(
        (
            event
            for event in events
            if event.event_type == event_type and event.sim_time_s >= start_time
        ),
        None,
    )


def events_between(
    events: list[TelemetryEvent],
    start_time: float,
    end_time: float,
    event_type: str,
) -> list[TelemetryEvent]:
    return [
        event
        for event in events
        if event.event_type == event_type and start_time <= event.sim_time_s <= end_time
    ]


def missed_cues_and_risks(events: list[TelemetryEvent]) -> list[str]:
    risks: list[str] = []
    perception_contacts = [event for event in events if event.event_type == "perception_contact"]
    trainee_actions = [event for event in events if event.event_type == "trainee_action"]
    spawns = [event for event in events if event.event_type == "asset_spawned"]
    hit_events = [event for event in events if event.event_type == "hit_event"]
    objective_updates = [event for event in events if event.event_type == "objective_update"]
    withdrawals = [
        event
        for event in events
        if event.event_type == "actor_state" and data_value(event, "state") in {"withdraw", "reposition"}
    ]

    if spawns and perception_contacts:
        first_spawn = spawns[0]
        first_contact = perception_contacts[0]
        if first_spawn.sim_time_s < first_contact.sim_time_s:
            actions_before_contact = events_between(
                trainee_actions,
                first_spawn.sim_time_s,
                first_contact.sim_time_s,
                "trainee_action",
            )
            if actions_before_contact:
                risks.append(
                    "Trainee action telemetry exists between first asset spawn and first contact; "
                    "verify whether that action addressed the spawned contact."
                )
            else:
                risks.append(
                    f"No trainee_action telemetry appears between first asset spawn at "
                    f"{format_seconds(first_spawn.sim_time_s)} and first perception_contact at "
                    f"{format_seconds(first_contact.sim_time_s)}. This is a telemetry gap, not proof "
                    "that a visible cue was missed."
                )

    for contact in perception_contacts:
        response = first_after(trainee_actions, contact.sim_time_s, "trainee_action")
        if response:
            latency = response.sim_time_s - contact.sim_time_s
            risks.append(
                f"First trainee_action after contact `{contact.event_id}` occurred "
                f"{format_seconds(latency)} later as `{data_value(response, 'action') or 'unspecified_action'}`."
            )
        else:
            risks.append(
                f"No trainee_action telemetry follows perception_contact `{contact.event_id}`; "
                "response is unconfirmed from telemetry."
            )

    for withdrawal in withdrawals:
        follow_up = first_after(trainee_actions, withdrawal.sim_time_s, "trainee_action")
        state = data_value(withdrawal, "state")
        target_anchor = data_value(withdrawal, "target_anchor_id") or withdrawal.anchor_id
        if follow_up:
            risks.append(
                f"After `{withdrawal.actor_id}` reported `{state}` toward "
                f"{code_or_unknown(str(target_anchor) if target_anchor else None)}, next trainee_action was "
                f"`{data_value(follow_up, 'action') or 'unspecified_action'}` at "
                f"{format_seconds(follow_up.sim_time_s)}."
            )
        else:
            risks.append(
                f"After `{withdrawal.actor_id}` reported `{state}` toward "
                f"{code_or_unknown(str(target_anchor) if target_anchor else None)}, no later "
                "trainee_action telemetry confirms follow-through or route awareness."
            )

    if hit_events:
        risks.append(f"{len(hit_events)} hit_event telemetry record(s) require evaluator review.")

    failed_objectives = [
        event
        for event in objective_updates
        if str(data_value(event, "status") or data_value(event, "outcome") or "").lower()
        in {"failed", "failure", "incomplete"}
    ]
    if failed_objectives:
        risks.append(
            f"{len(failed_objectives)} objective_update telemetry record(s) indicate failed or incomplete status."
        )

    if not any(event.event_type == "run_ended" for event in events):
        risks.append("No run_ended telemetry was present; completion state is unconfirmed.")

    if not risks:
        return ["- No telemetry-only missed cues or risks were identified in the supplied events."]
    return [f"- {risk}" for risk in risks]


def retry_focus_lines(events: list[TelemetryEvent]) -> list[str]:
    focus: list[str] = []
    perception_contacts = [event for event in events if event.event_type == "perception_contact"]
    trainee_actions = [event for event in events if event.event_type == "trainee_action"]
    withdrawals = [
        event
        for event in events
        if event.event_type == "actor_state" and data_value(event, "state") in {"withdraw", "reposition"}
    ]

    if perception_contacts:
        first_contact = perception_contacts[0]
        response = first_after(trainee_actions, first_contact.sim_time_s, "trainee_action")
        anchor_text = f" at `{first_contact.anchor_id}`" if first_contact.anchor_id else ""
        if response:
            focus.append(
                f"Repeat contact response{anchor_text} and compare the "
                f"{format_seconds(response.sim_time_s - first_contact.sim_time_s)} telemetry latency "
                "against the evaluator response window."
            )
        else:
            focus.append(
                f"Repeat contact response{anchor_text} with telemetry markers for the trainee's first "
                "post-contact action."
            )

    if withdrawals:
        withdrawal = withdrawals[0]
        target_anchor = data_value(withdrawal, "target_anchor_id") or withdrawal.anchor_id
        focus.append(
            "Capture a post-withdrawal trainee_action or objective_update"
            f"{f' tied to `{target_anchor}`' if target_anchor else ''} so route awareness is observable."
        )

    if any(event.event_type == "hit_event" for event in events):
        focus.append("Prioritize reducing exposure before the next hit_event is recorded.")

    if not focus:
        focus.append(
            "Repeat the run with explicit trainee_action and objective_update telemetry around each contact."
        )

    return [f"- {item}" for item in focus]


def render_markdown(context: AarContext) -> str:
    lines: list[str] = [
        f"# After Action Review: {context.run_id}",
        "",
        "_Mode: deterministic telemetry-only fallback. No LLM coaching was used._",
        "",
        "## Run Summary",
        *summarize_run(context),
        "",
        "## Timeline",
        *timeline_lines(context.events),
        "",
        "## Key Observed Events",
        *key_observed_event_lines(context.events),
        "",
        "## Missed Cues / Risks Based Only On Telemetry",
        *missed_cues_and_risks(context.events),
        "",
        "## Retry Focus",
        *retry_focus_lines(context.events),
    ]

    if context.scoring_rubric:
        lines.extend(
            [
                "",
                "## Rubric Context",
                *list_lines(context.scoring_rubric, "No scoring rubric supplied."),
            ]
        )

    lines.append("")
    return "\n".join(lines)


def write_output(markdown: str, output_path: Path | None) -> None:
    if output_path is None:
        print(markdown, end="")
        return

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(markdown, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate a concise deterministic AdaptSim markdown AAR from telemetry or AAR input."
    )
    parser.add_argument("input", help="telemetry_log JSON or after_action_review_input JSON")
    parser.add_argument(
        "-o",
        "--output",
        help="Markdown output path. If omitted, the AAR is written to stdout.",
    )
    parser.add_argument(
        "--mode",
        choices=["deterministic"],
        default="deterministic",
        help="Generation mode. The deterministic mode uses only validated telemetry facts.",
    )
    args = parser.parse_args()

    try:
        contract = load_contract(Path(args.input).resolve())
        context = context_from_contract(contract)
        markdown = render_markdown(context)
        write_output(markdown, Path(args.output).resolve() if args.output else None)
    except ValueError as exc:
        print(f"AAR GENERATION FAILED: {exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
