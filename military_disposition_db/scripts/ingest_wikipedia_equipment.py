#!/usr/bin/env python3
"""Bulk-ingest low-confidence public equipment rows from Wikipedia list pages.

This importer is intentionally conservative. It creates staging rows that must
be reviewed and upgraded to better sources over time. It does not ingest live
locations, tactical readiness, basing, or operational details.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import html
import json
import pathlib
import re
import time
import urllib.parse
import urllib.request
import urllib.error
from collections import Counter, defaultdict
from typing import Any


ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "equipment_inventory_wikipedia_staging.json"
WIKI_API = "https://en.wikipedia.org/w/api.php"
INDEX_PAGE = "Lists_of_currently_active_military_equipment_by_country"
USER_AGENT = "AdaptSim-public-equipment-ingestor/0.1 (public non-operational simulation dataset)"
AS_OF_DATE = dt.date.today().isoformat()

EQUIPMENT_CATEGORIES = {
    "small_arms_family",
    "crew_served_weapons",
    "tank",
    "ifv_apc_mrap",
    "artillery",
    "mlrs",
    "tactical_missile",
    "sam_gbad",
    "radar_sensor",
    "ew_system",
    "logistics_vehicle",
    "combat_aircraft",
    "transport_aircraft",
    "helicopter",
    "uav",
    "naval_combatant",
    "submarine",
    "amphibious_vessel",
    "auxiliary_vessel",
    "coast_guard_security_asset",
    "nuclear_delivery_system",
    "other_public_system",
}

COUNTRY_ALIASES = {
    "bolivia": "BOL",
    "brunei": "BRN",
    "cape verde": "CPV",
    "china": "CHN",
    "congo": "COG",
    "cote d ivoire": "CIV",
    "czech republic": "CZE",
    "czechia": "CZE",
    "democratic republic of the congo": "COD",
    "dr congo": "COD",
    "east timor": "TLS",
    "iran": "IRN",
    "ivory coast": "CIV",
    "laos": "LAO",
    "moldova": "MDA",
    "north korea": "PRK",
    "palestine": "PSE",
    "republic of the congo": "COG",
    "russia": "RUS",
    "south korea": "KOR",
    "syria": "SYR",
    "taiwan": "TWN",
    "tanzania": "TZA",
    "the gambia": "GMB",
    "turkey": "TUR",
    "uk": "GBR",
    "united kingdom": "GBR",
    "united states": "USA",
    "united states of america": "USA",
    "venezuela": "VEN",
    "vietnam": "VNM",
}

SKIP_PAGE_PATTERNS = {
    "uniform",
    "rank",
    "decoration",
    "medal",
    "order of battle",
    "military history",
}


def normalize_text(value: Any) -> str:
    text = html.unescape(str(value or ""))
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    text = re.sub(r"<ref\b[^>/]*/>", "", text, flags=re.I)
    text = re.sub(r"<ref\b.*?</ref>", "", text, flags=re.I | re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("&nbsp;", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def normalize_key(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", normalize_text(value).lower()).strip()


def slug(value: Any, limit: int = 80) -> str:
    text = re.sub(r"[^A-Za-z0-9]+", "_", normalize_text(value)).strip("_").upper()
    return (text or "UNKNOWN")[:limit]


def request_wiki(params: dict[str, str]) -> dict[str, Any]:
    query = urllib.parse.urlencode(params)
    request = urllib.request.Request(
        f"{WIKI_API}?{query}",
        headers={"User-Agent": USER_AGENT},
    )
    for attempt in range(5):
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            if exc.code != 429 or attempt == 4:
                raise
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError("unreachable wiki retry state")


def fetch_wikitext(page: str) -> str:
    payload = request_wiki(
        {
            "action": "parse",
            "format": "json",
            "page": page,
            "prop": "wikitext",
            "redirects": "1",
        }
    )
    return payload.get("parse", {}).get("wikitext", {}).get("*", "")


def build_entity_lookup() -> dict[str, str]:
    entities = json.loads((ROOT / "data" / "entities.json").read_text(encoding="utf-8"))["entities"]
    lookup = dict(COUNTRY_ALIASES)
    for entity in entities:
        for field in ("name", "official_name", "iso3", "iso2"):
            value = entity.get(field)
            if value:
                lookup[normalize_key(value)] = entity["entity_id"]
    return lookup


def strip_templates(value: str) -> str:
    text = value
    for _ in range(6):
        match = re.search(r"\{\{([^{}]+)\}\}", text)
        if not match:
            break
        parts = [part.strip() for part in match.group(1).split("|")]
        name = normalize_key(parts[0] if parts else "")
        if (
            name in {"citation needed", "cn", "refn", "efn", "notelist", "reflist", "sfn", "harv", "harvnb", "rp"}
            or name.startswith("cite ")
            or name in {"failed verification", "dead link", "better source needed", "unreliable source"}
        ):
            replacement = ""
        elif name.startswith("flag"):
            replacement = parts[1] if len(parts) > 1 else ""
        elif name in {"sort", "sortname"} and len(parts) > 2:
            replacement = parts[-1]
        elif len(parts) > 1:
            replacement = next((part for part in reversed(parts[1:]) if "=" not in part and normalize_key(part)), "")
        else:
            replacement = ""
        text = text[: match.start()] + replacement + text[match.end() :]
    return text


def strip_markup(value: Any) -> str:
    text = str(value or "")
    text = strip_templates(text)
    text = re.sub(r"\[\[(?:File|Image):[^\]]+\]\]", "", text, flags=re.I)
    text = re.sub(r"\[\[([^|\]#]+)(?:#[^|\]]*)?\|([^\]]+)\]\]", r"\2", text)
    text = re.sub(r"\[\[([^|\]#]+)(?:#[^\]]*)?\]\]", r"\1", text)
    text = re.sub(r"\[https?://[^\s\]]+\s*([^\]]*)\]", r"\1", text)
    text = re.sub(r"'''?", "", text)
    text = re.sub(r"\{\|.*", "", text)
    return normalize_text(text)


def extract_links_from_line(line: str) -> list[tuple[str, str]]:
    links = []
    for match in re.finditer(r"\[\[([^|\]#]+)(?:#[^|\]]*)?(?:\|([^\]]+))?\]\]", line):
        page = normalize_text(match.group(1).replace("_", " "))
        label = strip_markup(match.group(2) or match.group(1))
        if page and not any(pattern in normalize_key(page) for pattern in SKIP_PAGE_PATTERNS):
            links.append((page, label))
    return links


def index_equipment_pages(wikitext: str, entity_lookup: dict[str, str]) -> tuple[list[dict[str, str]], list[str]]:
    pages: list[dict[str, str]] = []
    unresolved: list[str] = []
    current_country = ""
    current_entity = ""
    seen = set()

    for raw_line in wikitext.splitlines():
        line = raw_line.strip()
        heading = re.match(r"^(=+)\s*(.*?)\s*\1$", line)
        if heading:
            label = strip_markup(heading.group(2))
            key = normalize_key(label)
            current_country = label
            current_entity = entity_lookup.get(key, "")
            if label and not current_entity and key not in {"see also", "references"}:
                unresolved.append(label)
            continue

        if not current_entity or not line.startswith("*"):
            continue

        for page, label in extract_links_from_line(line):
            dedupe_key = (current_entity, page)
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            pages.append(
                {
                    "entity_id": current_entity,
                    "country_heading": current_country,
                    "page_title": page,
                    "link_label": label,
                }
            )

    return pages, sorted(set(unresolved))


def extract_tables(wikitext: str) -> list[str]:
    tables: list[str] = []
    current: list[str] = []
    depth = 0
    for line in wikitext.splitlines():
        stripped = line.strip()
        if stripped.startswith("{|"):
            if depth == 0:
                current = [line]
            else:
                current.append(line)
            depth += 1
            continue
        if depth:
            current.append(line)
            if stripped.startswith("|}"):
                depth -= 1
                if depth == 0:
                    tables.append("\n".join(current))
                    current = []
    return tables


def split_wiki_cells(line: str, header: bool) -> list[str]:
    line = line.strip()
    if header:
        line = line.lstrip("!").strip()
        parts = re.split(r"\s*!!\s*", line)
    else:
        line = line.lstrip("|").strip()
        parts = re.split(r"\s*\|\|\s*", line)

    cells = []
    for part in parts:
        if re.match(r"^[a-zA-Z-]+=\"", part) or "style=" in part or "scope=" in part or "rowspan=" in part or "colspan=" in part:
            pieces = part.split("|", 1)
            if len(pieces) == 2:
                part = pieces[1]
        cells.append(part)
    return cells


def parse_table(table: str) -> tuple[list[str], list[list[str]], str]:
    rows: list[tuple[bool, list[str]]] = []
    current: list[str] = []
    caption = ""

    def flush() -> None:
        nonlocal current
        if not current:
            return
        first = next((line.strip() for line in current if line.strip()), "")
        header = first.startswith("!")
        cells: list[str] = []
        for line in current:
            stripped = line.strip()
            if not stripped or stripped.startswith("|-") or stripped.startswith("|+"):
                continue
            if stripped.startswith("!") or stripped.startswith("|"):
                cells.extend(split_wiki_cells(stripped, header=stripped.startswith("!")))
        rows.append((header, [strip_markup(cell) for cell in cells]))
        current = []

    for line in table.splitlines():
        stripped = line.strip()
        if stripped.startswith("|+"):
            caption = strip_markup(stripped[2:])
            continue
        if stripped.startswith("|-"):
            flush()
            continue
        if stripped.startswith("!") or (stripped.startswith("|") and not stripped.startswith("|}")):
            current.append(line)
    flush()

    headers: list[str] = []
    data_rows: list[list[str]] = []
    for is_header, cells in rows:
        if is_header and len(cells) >= 2 and not headers:
            headers = [normalize_text(cell) for cell in cells]
            continue
        if cells and headers and len(cells) >= 2:
            data_rows.append(cells)
    return headers, data_rows, caption


def find_column(headers: list[str], candidates: list[str]) -> int | None:
    normalized = [normalize_key(header) for header in headers]
    for candidate in candidates:
        for index, header in enumerate(normalized):
            if candidate == header or candidate in header:
                return index
    return None


def get_cell(row: list[str], index: int | None) -> str:
    if index is None or index >= len(row):
        return ""
    return normalize_text(row[index])


def parse_count(value: str) -> tuple[int | None, int | None, int | None, str]:
    text = normalize_text(value)
    if not text or normalize_key(text) in {"unknown", "n a", "none", "not known"}:
        return None, None, None, "qualitative_assessment"
    clean = text.replace(",", "")
    range_match = re.search(r"(\d{1,6})\s*(?:-|–|to)\s*(\d{1,6})", clean)
    if range_match:
        low = int(range_match.group(1))
        high = int(range_match.group(2))
        return None, min(low, high), max(low, high), "estimated_range"
    plus_match = re.search(r"(?:about|around|approx(?:imately)?|c\.?|~)?\s*(\d{1,6})\s*\+", clean, flags=re.I)
    if plus_match:
        low = int(plus_match.group(1))
        return None, low, None, "estimated_range"
    number_match = re.search(r"(?:about|around|approx(?:imately)?|c\.?|~)?\s*(\d{1,6})", clean, flags=re.I)
    if number_match:
        number = int(number_match.group(1))
        return number, None, None, "reported"
    return None, None, None, "qualitative_assessment"


def infer_category(page_title: str, caption: str, row_type: str, role: str, system_name: str) -> str:
    text = normalize_key(f"{page_title} {caption} {row_type} {role} {system_name}")
    if any(term in text for term in ["submarine"]):
        return "submarine"
    if any(term in text for term in ["amphibious", "landing craft", "landing ship"]):
        return "amphibious_vessel"
    if any(term in text for term in ["frigate", "destroyer", "corvette", "cruiser", "patrol vessel", "naval", "ship", "navy"]):
        return "naval_combatant"
    if any(term in text for term in ["auxiliary", "replenishment", "oiler", "support ship"]):
        return "auxiliary_vessel"
    if any(term in text for term in ["helicopter", "rotorcraft"]):
        return "helicopter"
    if any(term in text for term in ["transport aircraft", "tanker", "airlifter", "cargo aircraft"]):
        return "transport_aircraft"
    if any(term in text for term in ["aircraft", "fighter", "bomber", "trainer", "attack aircraft", "air force"]):
        return "combat_aircraft"
    if any(term in text for term in ["uav", "ucav", "drone", "unmanned", "loitering"]):
        return "uav"
    if any(term in text for term in ["main battle tank", " tank", "mbt"]):
        return "tank"
    if any(term in text for term in ["ifv", "apc", "armoured personnel", "armored personnel", "mrap", "infantry fighting", "armoured fighting", "armored fighting"]):
        return "ifv_apc_mrap"
    if any(term in text for term in ["mlrs", "multiple rocket", "rocket artillery"]):
        return "mlrs"
    if any(term in text for term in ["howitzer", "mortar", "artillery", "self propelled gun"]):
        return "artillery"
    if any(term in text for term in ["surface to air", "air defense", "air defence", "sam", "manpads"]):
        return "sam_gbad"
    if any(term in text for term in ["missile", "ballistic", "cruise missile", "anti tank guided"]):
        return "tactical_missile"
    if any(term in text for term in ["radar", "sensor", "sonar"]):
        return "radar_sensor"
    if any(term in text for term in ["electronic warfare", "jamming", "signals intelligence"]):
        return "ew_system"
    if any(term in text for term in ["truck", "logistics", "recovery vehicle", "utility vehicle", "engineering vehicle"]):
        return "logistics_vehicle"
    if any(term in text for term in ["rifle", "pistol", "carbine", "small arms", "machine gun", "submachine gun"]):
        return "small_arms_family"
    if any(term in text for term in ["grenade launcher", "anti tank weapon", "recoilless"]):
        return "crew_served_weapons"
    if any(term in text for term in ["nuclear"]):
        return "nuclear_delivery_system"
    return "other_public_system"


def source_locator(page_title: str, caption: str) -> str:
    anchor = page_title.replace(" ", "_")
    suffix = f"; table: {caption}" if caption else ""
    return f"https://en.wikipedia.org/wiki/{urllib.parse.quote(anchor)}{suffix}"


def row_from_table(entity_id: str, page_title: str, headers: list[str], row: list[str], caption: str) -> dict[str, Any] | None:
    name_index = find_column(headers, ["name", "equipment", "system", "model", "aircraft", "vehicle", "ship", "weapon", "class", "type"])
    if name_index is None:
        name_index = 0
    origin_index = find_column(headers, ["country of origin", "origin country", "origin"])
    quantity_index = find_column(headers, ["in service", "quantity", "number", "inventory", "total", "amount"])
    type_index = find_column(headers, ["type", "role", "category", "class"])
    variant_index = find_column(headers, ["variant", "version", "model"])
    notes_index = find_column(headers, ["notes", "details", "comments", "comment"])

    system_name = get_cell(row, name_index)
    if not system_name or normalize_key(system_name) in {"image", "name", "type", "total", "notes"}:
        return None
    if len(system_name) > 120:
        return None

    row_type = get_cell(row, type_index)
    role = row_type or get_cell(row, notes_index)
    variant = get_cell(row, variant_index)
    if normalize_key(variant) == normalize_key(system_name):
        variant = ""

    total, low, high, estimate_type = parse_count(get_cell(row, quantity_index))
    category = infer_category(page_title, caption, row_type, role, system_name)
    if category not in EQUIPMENT_CATEGORIES:
        category = "other_public_system"

    locator = source_locator(page_title, caption)
    fingerprint = hashlib.sha1(
        "|".join([entity_id, category, system_name, variant, locator]).encode("utf-8")
    ).hexdigest()[:10].upper()
    return {
        "equipment_id": f"{entity_id}_{slug(category, 28)}_{slug(system_name, 58)}_{fingerprint}_WIKI",
        "entity_id": entity_id,
        "service_branch": None,
        "category": category,
        "subcategory": row_type or None,
        "system_name": system_name,
        "variant": variant or None,
        "origin_country": get_cell(row, origin_index) or None,
        "manufacturer": None,
        "role": role or None,
        "estimated_total_count": total,
        "estimated_active_count": None,
        "estimated_storage_count": None,
        "estimated_ordered_count": None,
        "estimated_delivered_count": None,
        "readiness_status": None,
        "upgrade_status": None,
        "introduction_year": None,
        "retirement_year": None,
        "source_id": "WIKIPEDIA_LOW_CONF",
        "source_locator": locator,
        "as_of_date": AS_OF_DATE,
        "confidence": "low",
        "estimate_type": estimate_type,
        "uncertainty_low": low,
        "uncertainty_high": high,
        "public_sensitivity": "public_low",
        "notes": f"Bulk low-confidence Wikipedia staging row from {page_title}. Review against official/IISS/SIPRI/UNROCA sources before analytical use.",
    }


def ingest_page(page: dict[str, str]) -> list[dict[str, Any]]:
    wikitext = fetch_wikitext(page["page_title"])
    rows: list[dict[str, Any]] = []
    for table in extract_tables(wikitext):
        headers, data_rows, caption = parse_table(table)
        if len(headers) < 2 or not data_rows:
            continue
        header_text = normalize_key(" ".join(headers))
        if not any(term in header_text for term in ["name", "type", "origin", "quantity", "number", "in service", "aircraft", "ship", "equipment"]):
            continue
        for data_row in data_rows:
            parsed = row_from_table(page["entity_id"], page["page_title"], headers, data_row, caption)
            if parsed:
                rows.append(parsed)
    return rows


def load_existing_keys() -> set[tuple[str, str, str, str]]:
    payload = json.loads((ROOT / "data" / "equipment_inventory.json").read_text(encoding="utf-8"))
    keys = set()
    for row in payload.get("equipment", []):
        keys.add((row["entity_id"], row["category"], normalize_key(row["system_name"]), normalize_key(row.get("variant"))))
    return keys


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=pathlib.Path, default=OUT, help="Output staging JSON path.")
    parser.add_argument("--max-pages", type=int, default=0, help="Optional page limit for smoke tests. 0 means all indexed pages.")
    parser.add_argument("--delay", type=float, default=0.25, help="Delay between Wikipedia page requests.")
    parser.add_argument("--progress-every", type=int, default=25, help="Print progress every N source pages.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    entity_lookup = build_entity_lookup()
    index_text = fetch_wikitext(INDEX_PAGE)
    pages, unresolved_countries = index_equipment_pages(index_text, entity_lookup)
    if args.max_pages:
        pages = pages[: args.max_pages]

    existing_keys = load_existing_keys()
    seen_ids: set[str] = set()
    seen_keys = set(existing_keys)
    equipment: list[dict[str, Any]] = []
    failures: list[dict[str, str]] = []
    page_counts: Counter[str] = Counter()

    for index, page in enumerate(pages, start=1):
        try:
            page_rows = ingest_page(page)
        except Exception as exc:  # noqa: BLE001 - keep importer robust across messy public pages.
            failures.append({"page_title": page["page_title"], "entity_id": page["entity_id"], "error": str(exc)})
            continue
        for row in page_rows:
            key = (row["entity_id"], row["category"], normalize_key(row["system_name"]), normalize_key(row.get("variant")))
            if key in seen_keys or row["equipment_id"] in seen_ids:
                continue
            seen_keys.add(key)
            seen_ids.add(row["equipment_id"])
            equipment.append(row)
            page_counts[page["page_title"]] += 1
        if args.progress_every and index % args.progress_every == 0:
            print(f"processed {index}/{len(pages)} pages; rows={len(equipment)}; failures={len(failures)}", flush=True)
        if args.delay and index < len(pages):
            time.sleep(args.delay)

    by_entity = Counter(row["entity_id"] for row in equipment)
    by_category = Counter(row["category"] for row in equipment)
    payload = {
        "metadata": {
            "title": "Wikipedia Low-Confidence Equipment Inventory Staging",
            "scope": "Bulk candidate rows from public Wikipedia equipment list pages. This file is designed to create thousands of reviewable public equipment rows, not final authoritative inventory.",
            "source_page": INDEX_PAGE,
            "generated_at": AS_OF_DATE,
            "source_id": "WIKIPEDIA_LOW_CONF",
            "page_count": len(pages),
            "record_count": len(equipment),
            "safety_note": "No live basing, tasking, targeting, vulnerability, readiness, or weapon employment data is intentionally included.",
            "review_policy": "Upgrade rows to official, IISS, SIPRI, UNROCA, FlightGlobal, or naval-register sources before high-confidence analytical use.",
        },
        "summary": {
            "by_entity": dict(sorted(by_entity.items())),
            "by_category": dict(sorted(by_category.items())),
            "top_source_pages": dict(page_counts.most_common(40)),
            "unresolved_country_headings": unresolved_countries,
            "failed_pages": failures,
        },
        "equipment": equipment,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"indexed pages: {len(pages)}")
    print(f"wrote {len(equipment)} staging equipment rows to {args.out}")
    print(f"failed pages: {len(failures)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
