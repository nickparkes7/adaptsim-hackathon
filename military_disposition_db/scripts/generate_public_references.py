#!/usr/bin/env python3
"""Generate per-entity public reference locators with explicit source IDs."""

from __future__ import annotations

import datetime as dt
import html
import json
import pathlib
import re
import urllib.parse
import urllib.request
from typing import Any


ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "entity_public_references.json"
FACTBOOK_INDEX = "https://factbook.github.io/"
FACTBOOK_JSON_BASE = "https://github.com/factbook/factbook.json/raw/master"
AS_OF_DATE = dt.date.today().isoformat()

FACTBOOK_REGION_BY_CODE = {
    # Fallback region map for common Factbook two-letter GEC codes.
    # The factbook.github.io page itself is used for code/name discovery.
    "africa": {
        "ag", "ao", "bc", "bn", "by", "cd", "cf", "cm", "ct", "cv", "dj", "eg", "ek", "er", "et",
        "gb", "gh", "gv", "iv", "ke", "lt", "ly", "ma", "mi", "ml", "mo", "mp", "mr", "mz", "ng",
        "ni", "od", "pu", "rw", "se", "sf", "sg", "sl", "so", "su", "to", "tp", "ts", "tz", "ug",
        "uv", "wa", "wz", "za", "zi",
    },
    "australia-oceania": {"as", "bp", "fj", "fm", "kr", "nr", "nz", "pp", "ps", "rm", "tn", "tv", "vc", "ws"},
    "central-america-n-caribbean": {
        "ac", "bb", "bf", "bh", "cj", "cs", "cu", "do", "dr", "gj", "gt", "ha", "ho", "jm", "mh",
        "nu", "pm", "sc", "st", "td",
    },
    "central-asia": {"kg", "kz", "ti", "tx", "uz"},
    "east-n-southeast-asia": {
        "bm", "bx", "cb", "ch", "id", "ja", "kn", "ks", "la", "mc", "my", "rp", "sn", "th", "tt",
        "tw", "vm",
    },
    "europe": {
        "al", "an", "au", "be", "bo", "bu", "cy", "da", "ee", "en", "ez", "fi", "fr", "gg", "gm",
        "gr", "hr", "hu", "ic", "it", "kv", "lg", "lh", "li", "lo", "ls", "lu", "md", "mk", "mn",
        "mj", "mt", "nl", "no", "pl", "po", "ri", "ro", "rs", "si", "sm", "sp", "sw", "sz",
        "uk", "up", "vt",
    },
    "middle-east": {"ae", "am", "ba", "gz", "ir", "is", "iz", "jo", "ku", "le", "mu", "qa", "sa", "sy", "tu", "we", "ym"},
    "north-america": {"ca", "gl", "mx", "us"},
    "south-america": {"ar", "bl", "br", "ci", "co", "ec", "gy", "ns", "pa", "pe", "uy", "ve"},
}


def load_json(path: pathlib.Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def normalize(value: Any) -> str:
    text = html.unescape(str(value or "")).lower()
    text = text.replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def fetch_factbook_codes() -> dict[str, dict[str, str]]:
    with urllib.request.urlopen(FACTBOOK_INDEX, timeout=30) as response:
        index_html = response.read().decode("utf-8", errors="replace")
    matches = re.findall(r'<code[^>]*>([a-z]{2})</code>\s*<a href="([^"]+)">([^<]+)</a>', index_html)
    entries = {}
    for code, href, name in matches:
        region = next((region for region, codes in FACTBOOK_REGION_BY_CODE.items() if code in codes), "")
        entries[normalize(name)] = {
            "factbook_code": code,
            "factbook_url": urllib.parse.urljoin(FACTBOOK_INDEX, href),
            "factbook_json_url": f"{FACTBOOK_JSON_BASE}/{region}/{code}.json" if region else "",
        }
    return entries


def build_entity_aliases(entity: dict[str, Any]) -> list[str]:
    aliases = [entity.get("name"), entity.get("official_name"), entity.get("iso3"), entity.get("iso2")]
    aliases.extend(
        {
            "Côte d'Ivoire": "Cote d'Ivoire",
            "Czechia": "Czech Republic",
            "Congo": "Congo",
            "Democratic Republic of the Congo": "Congo DR",
            "Eswatini": "Swaziland",
            "Myanmar": "Burma",
            "North Macedonia": "Macedonia",
            "Timor-Leste": "Timor-Leste",
            "Türkiye": "Turkey",
            "Holy See": "Vatican City (Holy See)",
            "State of Palestine": "West Bank",
            "Taiwan": "Taiwan",
            "Kosovo": "Kosovo",
        }.get(entity.get("name"), "")
    )
    return [alias for alias in aliases if alias]


def wikipedia_url(title: str) -> str:
    return f"https://en.wikipedia.org/wiki/{urllib.parse.quote(title.replace(' ', '_'))}"


def wikipedia_search_url(query: str) -> str:
    return f"https://en.wikipedia.org/w/index.php?search={urllib.parse.quote(query)}"


def main() -> int:
    entities = load_json(ROOT / "data" / "entities.json")["entities"]
    factbook = fetch_factbook_codes()
    references = []

    for entity in entities:
        factbook_match = None
        for alias in build_entity_aliases(entity):
            factbook_match = factbook.get(normalize(alias))
            if factbook_match:
                break

        if factbook_match:
            references.append(
                {
                    "reference_id": f"{entity['entity_id']}__FACTBOOK_JSON_CC0",
                    "entity_id": entity["entity_id"],
                    "source_id": "FACTBOOK_JSON_CC0",
                    "reference_type": "public_factbook_profile",
                    "url": factbook_match["factbook_json_url"] or factbook_match["factbook_url"],
                    "source_locator": factbook_match["factbook_url"],
                    "as_of_date": AS_OF_DATE,
                    "confidence": "medium",
                    "public_sensitivity": "public_low",
                    "notes": f"Factbook code {factbook_match['factbook_code']}; archived structured public factbook context.",
                }
            )
        else:
            references.append(
                {
                    "reference_id": f"{entity['entity_id']}__CIA_WORLD_FACTBOOK_LOOKUP",
                    "entity_id": entity["entity_id"],
                    "source_id": "CIA_WORLD_FACTBOOK",
                    "reference_type": "public_factbook_lookup",
                    "url": "https://www.cia.gov/stories/story/spotlighting-the-world-factbook-as-we-bid-a-fond-farewell/",
                    "source_locator": "CIA Factbook has sunset; use archived/final public factbook records when available.",
                    "as_of_date": AS_OF_DATE,
                    "confidence": "low",
                    "public_sensitivity": "public_low",
                    "notes": "No direct Factbook JSON code matched during generated lookup.",
                }
            )

        references.append(
            {
                "reference_id": f"{entity['entity_id']}__WIKIPEDIA_COUNTRY_REFERENCE",
                "entity_id": entity["entity_id"],
                "source_id": "WIKIPEDIA_PUBLIC_INDEX",
                "reference_type": "public_country_reference",
                "url": wikipedia_url(entity["name"]),
                "source_locator": wikipedia_search_url(entity["name"]),
                "as_of_date": AS_OF_DATE,
                "confidence": "low",
                "public_sensitivity": "public_low",
                "notes": "Discovery/reference locator only; use cited page references or stronger sources for final assertions.",
            }
        )
        references.append(
            {
                "reference_id": f"{entity['entity_id']}__WIKIPEDIA_EQUIPMENT_SEARCH",
                "entity_id": entity["entity_id"],
                "source_id": "WIKIPEDIA_LOW_CONF",
                "reference_type": "public_equipment_search",
                "url": wikipedia_search_url(f"List of equipment of {entity['name']} armed forces"),
                "source_locator": wikipedia_search_url(f"List of equipment of {entity['name']} armed forces"),
                "as_of_date": AS_OF_DATE,
                "confidence": "low",
                "public_sensitivity": "public_low",
                "notes": "Low-confidence discovery locator for equipment inventory ingestion.",
            }
        )

    payload = {
        "metadata": {
            "title": "Entity Public Reference Locators",
            "scope": "Per-entity public source locators for CIA/public factbook context and Wikipedia discovery. These rows are provenance scaffolding, not final military assertions.",
            "generated_at": AS_OF_DATE,
            "record_count": len(references),
            "safety_note": "Reference locators only; no live military disposition, targeting, vulnerabilities, or operational details.",
        },
        "references": references,
    }
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {len(references)} public reference rows to {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
