from __future__ import annotations

import re
from copy import deepcopy
from typing import Any, Dict, Iterable, List, Optional

COST_FIELDS = ("parking", "utilities", "internet", "fees", "once", "deposit")

DEMO_APARTMENTS = [
    {"id": "demo-a", "name": "Oak Ridge", "address": "", "months": 12, "rent": 1500, "parking": 125, "utilities": 90, "internet": 65, "fees": 55, "once": 175, "deposit": 500, "concession": 0, "firstMonth": True},
    {"id": "demo-b", "name": "The Juniper", "address": "", "months": 12, "rent": 1650, "parking": 0, "utilities": 100, "internet": 0, "fees": 35, "once": 75, "deposit": 400, "concession": 1650, "firstMonth": True},
    {"id": "demo-c", "name": "Parkside Flats", "address": "", "months": 12, "rent": 1595, "parking": 80, "utilities": 110, "internet": 55, "fees": 30, "once": 225, "deposit": 600, "concession": 500, "firstMonth": True},
]


def number(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        result = float(value)
        return result if result >= 0 else None
    except (TypeError, ValueError):
        return None


def normalize_apartment(payload: Dict[str, Any], apartment_id: Optional[str] = None) -> Dict[str, Any]:
    apartment: Dict[str, Any] = {
        "id": apartment_id or payload.get("id") or "apt-" + __import__("uuid").uuid4().hex,
        "name": str(payload.get("name", "")).strip()[:65],
        "address": str(payload.get("address", "")).strip()[:180],
        "months": max(1, min(60, int(number(payload.get("months") or 12) or 12))),
        "rent": number(payload.get("rent")) or 0,
        "concession": number(payload.get("concession")) or 0,
        "firstMonth": bool(payload.get("firstMonth", True)),
    }
    for field in COST_FIELDS:
        apartment[field] = number(payload.get(field))
    if not apartment["name"]:
        raise ValueError("Apartment name is required")
    if number(payload.get("rent")) is None:
        raise ValueError("Advertised base rent is required")
    return apartment


def calculate(apartment: Dict[str, Any]) -> Dict[str, Any]:
    months = max(1, int(apartment.get("months") or 1))
    rent = number(apartment.get("rent")) or 0
    recurring = rent + sum(number(apartment.get(field)) or 0 for field in ("parking", "utilities", "internet", "fees"))
    one_time = number(apartment.get("once")) or 0
    concession = number(apartment.get("concession")) or 0
    deposit = number(apartment.get("deposit")) or 0
    total = max(0, recurring * months + one_time - concession)
    missing = [field for field in COST_FIELDS if apartment.get(field) is None]
    upfront = one_time + deposit
    if apartment.get("firstMonth", True):
        upfront += recurring
    return {
        "recurring": recurring,
        "total": total,
        "effective": total / months,
        "upfront": upfront,
        "missing": missing,
        "extras": recurring - rent,
    }


def analyze_listing(text: str) -> Dict[str, Any]:
    text = re.sub(r"\u00a0", " ", text)
    text = re.sub(r"[–—]", "-", text)
    items: List[Dict[str, Any]] = []
    used: Dict[str, float] = {}
    warnings: List[str] = []

    money = r"\$\s*([\d,]+(?:\.\d{1,2})?)"

    def add_money(label: str, field: str, regex: str, aggregate: bool = False) -> None:
        values = [float(value.replace(",", "")) for value in re.findall(regex, text, re.I)]
        if not values:
            return
        if not aggregate and len(set(values)) > 1:
            warnings.append(f"Multiple {label.lower()} amounts found; verify which applies.")
            return
        value = sum(values) if aggregate else values[0]
        used[field] = value
        items.append({"label": label, "field": field, "value": value})

    add_money("Base rent", "rent", r"(?:base\s+rent|monthly\s+rent|rent\s+is|rent\s+of|(?:apartment|unit|studio|bedroom)\s+(?:available\s+)?for)\s*(?:is|at|of|:)?\s*" + money)
    if "rent" not in used:
        add_money("Base rent", "rent", money + r"\s*(?:/\s*(?:mo|month)|per\s+month)")

    lease_match = re.search(r"(?:on\s+a|for\s+a|on\s+an?|for\s+an?|lease\s+(?:term|of|is|:)\s*)?(\d{1,2})\s*-?\s*months?\s*lease", text, re.I)
    if not lease_match:
        lease_match = re.search(r"(?:on|for)\s+a\s*(\d{1,2})\s*-?\s*month\s*lease|lease\s*(?:term|of|is|:)\s*(\d{1,2})\s*months?", text, re.I)
    if lease_match:
        raw = next((group for group in lease_match.groups() if group), None)
        if raw:
            months = int(raw)
            if 1 <= months <= 60:
                used["months"] = float(months)
                items.append({"label": "Lease duration", "field": "months", "value": months})

    specs = [
        ("Parking", "parking", r"parking(?:\s+(?:fee|cost|charge|is))?"),
        ("Internet", "internet", r"(?:internet|wi[- ]?fi)(?:\s+(?:fee|cost|charge|is))?"),
        ("Utilities", "utilities", r"(?:utilities|utility\s+estimate)(?:\s+(?:fee|cost|charge|is))?"),
        ("Trash", "fees", r"(?:trash|valet\s+trash)(?:\s+(?:fee|service|cost|charge|is))?"),
        ("Amenity", "fees", r"(?:amenit(?:y|ies))(?:\s+(?:fee|cost|charge|is))?"),
        ("Pest control", "fees", r"(?:pest\s+control)(?:\s+(?:fee|cost|charge|is))?"),
        ("Application fee", "once", r"(?:application|app)(?:\s+(?:fee|cost|charge|is))?"),
        ("Administration fee", "once", r"(?:administration|administrative|admin)(?:\s+(?:fee|cost|charge|is))?"),
        ("Security deposit", "deposit", r"(?:(?:refundable\s+)?security\s+deposit|deposit)"),
    ]

    for label, field, expression in specs:
        forward = re.findall(expression + r"\s*(?:of|at|:)?\s*" + money, text, re.I)
        reverse = re.findall(money + r"\s*(?:(?:/|per)\s*(?:month|mo)\s*)?" + expression + r"\b", text, re.I)
        values = [float(value.replace(",", "")) for value in forward + reverse]
        if not values:
            continue
        if len(set(values)) > 1:
            warnings.append(f"More than one {label.lower()} amount; enter it manually.")
            continue
        value = values[0]
        used[field] = used.get(field, 0) + value
        items.append({"label": label, "field": field, "value": value})

    if re.search(r"\b(?:one|1)\s+month\s+(?:of\s+rent\s+)?free\b|\b(?:one|1)\s+free\s+month\b", text, re.I) and "rent" in used:
        used["concession"] = used["rent"]
        items.append({"label": "One month free (estimated concession)", "field": "concession", "value": used["rent"]})

    return {"items": items, "values": used, "warnings": warnings}
