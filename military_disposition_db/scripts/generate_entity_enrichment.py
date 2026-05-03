#!/usr/bin/env python3
"""Generate sourced public encyclopedia and factbook enrichment rows."""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import pathlib
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "entity_context_enrichment.json"
FACTBOOK_JSON_BASE = "https://github.com/factbook/factbook.json/raw/master"
WIKIPEDIA_SUMMARY_BASE = "https://en.wikipedia.org/api/rest_v1/page/summary"
AS_OF_DATE = dt.date.today().isoformat()
USER_AGENT = "AdaptSim-public-context-enricher/0.1 (public non-operational simulation dataset)"

FACTBOOK_REGIONS = [
    "africa",
    "australia-oceania",
    "central-america-n-caribbean",
    "central-asia",
    "east-n-southeast-asia",
    "europe",
    "middle-east",
    "north-america",
    "south-america",
    "south-asia",
]

FACTBOOK_SECTION_ALLOWLIST = {
    "Introduction",
    "Geography",
    "People and Society",
    "Government",
    "Economy",
    "Energy",
    "Communications",
    "Transportation",
    "Military and Security",
    "Transnational Issues",
}

FACTBOOK_FIELD_KEYWORDS = {
    "background",
    "location",
    "geographic coordinates",
    "map references",
    "area",
    "land boundaries",
    "coastline",
    "climate",
    "terrain",
    "elevation",
    "natural resources",
    "population distribution",
    "environment",
    "population",
    "age structure",
    "urbanization",
    "government type",
    "capital",
    "administrative divisions",
    "executive branch",
    "legislative branch",
    "judicial branch",
    "international organization participation",
    "economy",
    "real gdp",
    "gdp",
    "industries",
    "labor force",
    "unemployment",
    "budget",
    "electricity",
    "coal",
    "petroleum",
    "natural gas",
    "internet",
    "telecommunication",
    "broadcast media",
    "national air transport",
    "airports",
    "railways",
    "roadways",
    "waterways",
    "merchant marine",
    "ports",
    "military",
    "security",
    "terrorism",
    "disputes",
    "refugees",
    "trafficking",
}


def load_json(path: pathlib.Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def json_text(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def normalize(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()


def safe_request_json(url: str, retries: int = 3) -> dict[str, Any] | None:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                return None
            if exc.code == 429 and attempt < retries - 1:
                time.sleep(1.5 * (attempt + 1))
                continue
            return None
        except Exception:
            if attempt < retries - 1:
                time.sleep(0.5 * (attempt + 1))
                continue
            return None
    return None


def factbook_code_from_reference(reference: dict[str, Any]) -> str:
    match = re.search(r"/([a-z]{2})(?:\.json)?/?$", reference.get("url", "") or reference.get("source_locator", ""))
    return match.group(1) if match else ""


def fetch_factbook_profile(code: str) -> tuple[dict[str, Any] | None, str]:
    if not code:
        return None, ""
    for region in FACTBOOK_REGIONS:
        url = f"{FACTBOOK_JSON_BASE}/{region}/{code}.json"
        payload = safe_request_json(url, retries=2)
        if payload:
            return payload, url
    return None, ""


def walk_factbook_texts(value: Any, path: list[str] | None = None) -> list[tuple[list[str], str]]:
    path = path or []
    rows: list[tuple[list[str], str]] = []
    if isinstance(value, dict):
        if "text" in value and isinstance(value["text"], str):
            rows.append((path, value["text"]))
        for key, child in value.items():
            if key == "text":
                continue
            rows.extend(walk_factbook_texts(child, [*path, key]))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            rows.extend(walk_factbook_texts(child, [*path, str(index)]))
    return rows


def should_keep_factbook_path(path: list[str]) -> bool:
    if not path or path[0] not in FACTBOOK_SECTION_ALLOWLIST:
        return False
    normalized = normalize(" ".join(path))
    return any(keyword in normalized for keyword in FACTBOOK_FIELD_KEYWORDS)


def make_id(parts: list[str]) -> str:
    base = "__".join(re.sub(r"[^A-Za-z0-9]+", "_", part).strip("_").upper()[:48] for part in parts if part)
    digest = hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:10].upper()
    return f"{base[:170]}__{digest}"


def factbook_rows(entity_id: str, reference: dict[str, Any]) -> tuple[list[dict[str, Any]], str | None]:
    code = factbook_code_from_reference(reference)
    payload, locator = fetch_factbook_profile(code)
    if not payload:
        return [], f"No factbook JSON profile found for code {code or '<missing>'}."

    rows = []
    for path, text in walk_factbook_texts(payload):
        if not should_keep_factbook_path(path):
            continue
        clean_text = re.sub(r"\s+", " ", text).strip()
        if not clean_text:
            continue
        field_group = path[0]
        field_name = " / ".join(path[1:] or path)
        rows.append(
            {
                "enrichment_id": make_id([entity_id, "FACTBOOK_JSON_CC0", *path]),
                "entity_id": entity_id,
                "source_id": "FACTBOOK_JSON_CC0",
                "source_locator": locator,
                "field_group": field_group,
                "field_name": field_name,
                "value": {"text": clean_text, "path": path},
                "as_of_date": AS_OF_DATE,
                "confidence": "medium",
                "public_sensitivity": "public_low",
                "notes": "Structured public factbook enrichment derived from factbook.json archive of CIA World Factbook material.",
            }
        )
    return rows, None


def wikipedia_title_from_reference(reference: dict[str, Any], fallback_name: str) -> str:
    url = reference.get("url", "")
    if "/wiki/" in url:
        return urllib.parse.unquote(url.rsplit("/wiki/", 1)[1]).replace("_", " ")
    return fallback_name


def wikipedia_summary_rows(entity: dict[str, Any], reference: dict[str, Any]) -> tuple[list[dict[str, Any]], str | None]:
    title = wikipedia_title_from_reference(reference, entity["name"])
    url = f"{WIKIPEDIA_SUMMARY_BASE}/{urllib.parse.quote(title.replace(' ', '_'))}"
    payload = safe_request_json(url)
    if not payload or payload.get("type") == "disambiguation":
        return [], f"No direct Wikipedia summary found for {title}."

    page_url = payload.get("content_urls", {}).get("desktop", {}).get("page") or reference.get("url")
    fields = [
        ("encyclopedia_description", payload.get("description")),
        ("encyclopedia_summary", payload.get("extract")),
    ]
    rows = []
    for field_name, text in fields:
        clean_text = re.sub(r"\s+", " ", str(text or "")).strip()
        if not clean_text:
            continue
        rows.append(
            {
                "enrichment_id": make_id([entity["entity_id"], "WIKIPEDIA_PUBLIC_INDEX", field_name]),
                "entity_id": entity["entity_id"],
                "source_id": "WIKIPEDIA_PUBLIC_INDEX",
                "source_locator": page_url,
                "field_group": "Public Encyclopedia",
                "field_name": field_name,
                "value": {"text": clean_text, "title": payload.get("title"), "pageid": payload.get("pageid")},
                "as_of_date": AS_OF_DATE,
                "confidence": "low",
                "public_sensitivity": "public_low",
                "notes": "Public encyclopedia context; use page citations or stronger sources for final military assertions.",
            }
        )
    return rows, None


def main() -> int:
    entities = load_json(ROOT / "data" / "entities.json")["entities"]
    references = load_json(ROOT / "data" / "entity_public_references.json")["references"]
    refs_by_entity: dict[str, list[dict[str, Any]]] = {}
    for reference in references:
        refs_by_entity.setdefault(reference["entity_id"], []).append(reference)

    enrichment: list[dict[str, Any]] = []
    failures: list[dict[str, str]] = []
    seen_ids: set[str] = set()

    for index, entity in enumerate(entities, start=1):
        entity_refs = refs_by_entity.get(entity["entity_id"], [])
        factbook_ref = next((ref for ref in entity_refs if ref["source_id"] == "FACTBOOK_JSON_CC0"), None)
        wiki_ref = next((ref for ref in entity_refs if ref["reference_type"] == "public_country_reference"), None)

        if factbook_ref:
            rows, error = factbook_rows(entity["entity_id"], factbook_ref)
            if error:
                failures.append({"entity_id": entity["entity_id"], "source_id": "FACTBOOK_JSON_CC0", "error": error})
            for row in rows:
                if row["enrichment_id"] not in seen_ids:
                    seen_ids.add(row["enrichment_id"])
                    enrichment.append(row)

        if wiki_ref:
            rows, error = wikipedia_summary_rows(entity, wiki_ref)
            if error:
                failures.append({"entity_id": entity["entity_id"], "source_id": "WIKIPEDIA_PUBLIC_INDEX", "error": error})
            for row in rows:
                if row["enrichment_id"] not in seen_ids:
                    seen_ids.add(row["enrichment_id"])
                    enrichment.append(row)

        if index % 25 == 0:
            print(f"processed {index}/{len(entities)} entities; enrichment_rows={len(enrichment)}; failures={len(failures)}", flush=True)
        time.sleep(0.08)

    payload = {
        "metadata": {
            "title": "Public Encyclopedia and Factbook Context Enrichment",
            "scope": "Sourced country context rows from public encyclopedia summaries and public factbook JSON. These enrich baseline simulation context and do not replace equipment inventory sources.",
            "generated_at": AS_OF_DATE,
            "record_count": len(enrichment),
            "safety_note": "No live military disposition, targeting, vulnerabilities, classified data, or weapon employment instructions.",
        },
        "summary": {
            "by_source": {
                source_id: sum(1 for row in enrichment if row["source_id"] == source_id)
                for source_id in sorted({row["source_id"] for row in enrichment})
            },
            "failed_lookups": failures,
        },
        "enrichment": enrichment,
    }
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {len(enrichment)} enrichment rows to {OUT}")
    print(f"failed lookups: {len(failures)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
