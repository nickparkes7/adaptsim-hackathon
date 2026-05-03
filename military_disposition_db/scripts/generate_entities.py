#!/usr/bin/env python3
"""Generate the starter entity coverage index from public country metadata.

The generated file is deliberately a coverage scaffold, not a military profile.
It includes UN member states, UN observer states, and a short curated list of
commonly tracked disputed/partially recognized entities where public military
or security-force data may exist.
"""

from __future__ import annotations

import json
import pathlib
import sys
import urllib.request
from datetime import date


ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "entities.json"
REST_URL = "https://restcountries.com/v3.1/all?fields=name,cca2,cca3,unMember,independent,status,region,subregion"
AS_OF_DATE = date.today().isoformat()


STATUS_UN_MEMBER = "un_member_state"
STATUS_UN_OBSERVER = "un_observer_state"
STATUS_PARTIAL = "partially_recognized_or_disputed"


CURATED_ENTITIES = [
    {
        "entity_id": "GNB",
        "name": "Guinea-Bissau",
        "official_name": "Republic of Guinea-Bissau",
        "iso3": "GNB",
        "iso2": "GW",
        "entity_status": STATUS_UN_MEMBER,
        "un_membership": "member_state",
        "restcountries_status": "officially-assigned",
        "independent": True,
        "region": "Africa",
        "subregion": "Western Africa",
        "included_reason": "UN member state; included by explicit override because REST Countries marked unMember=false at generation time.",
        "sovereignty_context": None,
        "public_military_data_available": True,
        "coverage_tier": "index_only",
        "notes": "Verify against the official UN member-state list during refresh.",
        "source_ids": ["UN_MEMBER_STATES", "RESTCOUNTRIES"],
    },
    {
        "entity_id": "VAT",
        "name": "Holy See",
        "iso3": "VAT",
        "iso2": "VA",
        "entity_status": STATUS_UN_OBSERVER,
        "un_membership": "non_member_observer_state",
        "included_reason": "UN non-member observer state; minimal public military data.",
        "sovereignty_context": "Sovereign subject of international law associated with Vatican City State.",
        "public_military_data_available": True,
        "coverage_tier": "index_only",
        "notes": "Profile should distinguish Holy See diplomacy from Vatican City territorial security.",
    },
    {
        "entity_id": "PSE",
        "name": "State of Palestine",
        "iso3": "PSE",
        "iso2": "PS",
        "entity_status": STATUS_UN_OBSERVER,
        "un_membership": "non_member_observer_state",
        "included_reason": "UN non-member observer state.",
        "sovereignty_context": "UN observer state with disputed/occupied-territory context.",
        "public_military_data_available": True,
        "coverage_tier": "index_only",
        "notes": "Represent military/security variables with care; avoid factional or live operational detail.",
    },
    {
        "entity_id": "TWN",
        "name": "Taiwan",
        "iso3": "TWN",
        "iso2": "TW",
        "entity_status": STATUS_PARTIAL,
        "un_membership": "not_un_member",
        "included_reason": "Commonly tracked self-governing entity with extensive public defense data.",
        "sovereignty_context": "Self-governing; claimed by the People's Republic of China; recognition is limited.",
        "public_military_data_available": True,
        "coverage_tier": "seed_profile",
        "notes": "Use neutral naming and explicit status fields in simulations.",
    },
    {
        "entity_id": "XKX",
        "name": "Kosovo",
        "iso3": "XKX",
        "iso2": "XK",
        "entity_status": STATUS_PARTIAL,
        "un_membership": "not_un_member",
        "included_reason": "Commonly tracked partially recognized state with public security-force data.",
        "sovereignty_context": "Declared independence from Serbia; recognized by many states but not a UN member.",
        "public_military_data_available": True,
        "coverage_tier": "index_only",
        "notes": "Use XKX as a user-assigned code, not an ISO 3166-1 alpha-3 code.",
    },
    {
        "entity_id": "ESH_SADR",
        "name": "Western Sahara / Sahrawi Arab Democratic Republic",
        "iso3": "ESH",
        "iso2": "EH",
        "entity_status": STATUS_PARTIAL,
        "un_membership": "not_un_member",
        "included_reason": "Commonly tracked disputed territory/statehood claim.",
        "sovereignty_context": "Territory disputed between Morocco and the Polisario Front/SADR.",
        "public_military_data_available": True,
        "coverage_tier": "index_only",
        "notes": "Keep territorial-control assumptions separate from entity identity.",
    },
    {
        "entity_id": "SOMALILAND",
        "name": "Somaliland",
        "iso3": None,
        "iso2": None,
        "entity_status": STATUS_PARTIAL,
        "un_membership": "not_un_member",
        "included_reason": "Commonly tracked de facto authority with public security-force data.",
        "sovereignty_context": "Self-declared state internationally treated as part of Somalia.",
        "public_military_data_available": True,
        "coverage_tier": "index_only",
        "notes": "No ISO 3166-1 state code; use stable local entity_id.",
    },
    {
        "entity_id": "TRNC",
        "name": "Northern Cyprus",
        "iso3": None,
        "iso2": None,
        "entity_status": STATUS_PARTIAL,
        "un_membership": "not_un_member",
        "included_reason": "Commonly tracked de facto authority with public security-force data.",
        "sovereignty_context": "Self-declared state recognized only by Turkiye; internationally treated as part of Cyprus.",
        "public_military_data_available": True,
        "coverage_tier": "index_only",
        "notes": "Separate Turkish military presence assumptions from local forces.",
    },
    {
        "entity_id": "ABKHAZIA",
        "name": "Abkhazia",
        "iso3": None,
        "iso2": None,
        "entity_status": STATUS_PARTIAL,
        "un_membership": "not_un_member",
        "included_reason": "Commonly tracked de facto authority with public security-force data.",
        "sovereignty_context": "Breakaway region internationally treated by most states as part of Georgia.",
        "public_military_data_available": True,
        "coverage_tier": "index_only",
        "notes": "Do not infer Russian disposition beyond public high-level descriptions.",
    },
    {
        "entity_id": "SOUTH_OSSETIA",
        "name": "South Ossetia",
        "iso3": None,
        "iso2": None,
        "entity_status": STATUS_PARTIAL,
        "un_membership": "not_un_member",
        "included_reason": "Commonly tracked de facto authority with public security-force data.",
        "sovereignty_context": "Breakaway region internationally treated by most states as part of Georgia.",
        "public_military_data_available": True,
        "coverage_tier": "index_only",
        "notes": "Do not infer Russian disposition beyond public high-level descriptions.",
    },
    {
        "entity_id": "TRANSNISTRIA",
        "name": "Transnistria",
        "iso3": None,
        "iso2": None,
        "entity_status": STATUS_PARTIAL,
        "un_membership": "not_un_member",
        "included_reason": "Commonly tracked de facto authority with public security-force data.",
        "sovereignty_context": "Breakaway region internationally treated by most states as part of Moldova.",
        "public_military_data_available": True,
        "coverage_tier": "index_only",
        "notes": "Keep Russian peacekeeping/operational assumptions separate and source-bound.",
    },
]


def fetch_restcountries() -> list[dict]:
    req = urllib.request.Request(REST_URL, headers={"User-Agent": "public-simulation-db-starter/0.1"})
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response)


def normalize_rest_entity(raw: dict) -> dict | None:
    if not raw.get("unMember"):
        return None
    iso3 = raw["cca3"]
    return {
        "entity_id": iso3,
        "name": raw["name"]["common"],
        "official_name": raw["name"].get("official"),
        "iso3": iso3,
        "iso2": raw.get("cca2"),
        "entity_status": STATUS_UN_MEMBER,
        "un_membership": "member_state",
        "restcountries_status": raw.get("status"),
        "independent": raw.get("independent"),
        "region": raw.get("region"),
        "subregion": raw.get("subregion"),
        "included_reason": "UN member state.",
        "sovereignty_context": None,
        "public_military_data_available": True,
        "coverage_tier": "index_only",
        "profile_seeded": False,
        "source_ids": ["UN_MEMBER_STATES", "RESTCOUNTRIES"],
        "as_of_date": AS_OF_DATE,
        "confidence": "medium",
        "recency": "current_index_generated",
        "notes": None,
    }


def finish_curated(entity: dict) -> dict:
    finished = {
        "official_name": None,
        "restcountries_status": None,
        "independent": None,
        "region": None,
        "subregion": None,
        "profile_seeded": False,
        "source_ids": ["UN_OBSERVER_STATES" if entity["entity_status"] == STATUS_UN_OBSERVER else "CURATED_ENTITY_STATUS"],
        "as_of_date": AS_OF_DATE,
        "confidence": "medium",
        "recency": "current_index_generated",
    }
    finished.update(entity)
    return finished


def main() -> int:
    entities = {}
    for raw in fetch_restcountries():
        normalized = normalize_rest_entity(raw)
        if normalized:
            entities[normalized["entity_id"]] = normalized

    for curated in CURATED_ENTITIES:
        finished = finish_curated(curated)
        previous = entities.get(finished["entity_id"], {})
        previous.update(finished)
        entities[finished["entity_id"]] = previous

    for seeded in ["USA", "CHN", "RUS", "IND", "GBR", "FRA", "IRN", "ISR", "UKR", "TWN"]:
        if seeded in entities:
            entities[seeded]["coverage_tier"] = "seed_profile"
            entities[seeded]["profile_seeded"] = True

    ordered = sorted(entities.values(), key=lambda item: (item["entity_status"], item["name"]))
    payload = {
        "metadata": {
            "title": "Military Disposition Public Coverage Entity Index",
            "generated_at": AS_OF_DATE,
            "generator": "scripts/generate_entities.py",
            "coverage_policy": "UN member states + UN observer states + curated commonly tracked disputed/partially recognized entities.",
            "record_count": len(ordered),
        },
        "entities": ordered,
    }
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({len(ordered)} records)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
