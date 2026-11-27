from __future__ import annotations

import os
import sqlite3
import uuid
from pathlib import Path

import requests
from flask import Flask, jsonify, render_template, request

from hiddencost import DEMO_APARTMENTS, analyze_listing, calculate, normalize_apartment

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("HIDDENCOST_DB", str(BASE_DIR / "hiddencost.db")))
app = Flask(__name__, template_folder="templates", static_folder="static")
app.secret_key = os.environ.get("HIDDENCOST_SECRET", "development-only-change-me")


def db() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with db() as connection:
        connection.execute("CREATE TABLE IF NOT EXISTS state (session_id TEXT PRIMARY KEY, apartments TEXT NOT NULL)")


init_db()


def current_session_id() -> str:
    return request.cookies.get("hiddencost_session") or uuid.uuid4().hex


def load_apartments(session_id: str) -> list:
    with db() as connection:
        row = connection.execute("SELECT apartments FROM state WHERE session_id = ?", (session_id,)).fetchone()
    if not row:
        return [normalize_apartment(apartment, apartment["id"]) for apartment in DEMO_APARTMENTS]
    import json
    try:
        return json.loads(row["apartments"])
    except (json.JSONDecodeError, TypeError):
        return []


def save_apartments(session_id: str, apartments: list) -> None:
    import json
    with db() as connection:
        connection.execute("INSERT INTO state(session_id, apartments) VALUES(?, ?) ON CONFLICT(session_id) DO UPDATE SET apartments=excluded.apartments", (session_id, json.dumps(apartments)))


def attach_calculations(apartments: list) -> list:
    result = []
    for apartment in apartments:
        item = dict(apartment)
        item.update(calculate(apartment))
        result.append(item)
    return result


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/state")
def state():
    session_id = current_session_id()
    response = jsonify({"apartments": attach_calculations(load_apartments(session_id))})
    if not request.cookies.get("hiddencost_session"):
        response.set_cookie("hiddencost_session", session_id, httponly=True, samesite="Lax", max_age=31536000)
    return response


@app.route("/api/apartments", methods=["POST"])
def add_apartment():
    session_id = current_session_id()
    apartments = load_apartments(session_id)
    if len(apartments) >= 10:
        return jsonify({"error": "You can compare up to 10 apartments."}), 400
    apartment = normalize_apartment(request.get_json(silent=True) or {})
    apartments.append(apartment)
    save_apartments(session_id, apartments)
    return jsonify({"apartments": attach_calculations(apartments)}), 201


@app.route("/api/apartments/<apartment_id>", methods=["PUT"])
def update_apartment(apartment_id: str):
    session_id = current_session_id()
    apartments = load_apartments(session_id)
    payload = request.get_json(silent=True) or {}
    if not any(apartment["id"] == apartment_id for apartment in apartments):
        return jsonify({"error": "Apartment not found."}), 404
    updated = normalize_apartment(payload, apartment_id)
    apartments = [updated if apartment["id"] == apartment_id else apartment for apartment in apartments]
    save_apartments(session_id, apartments)
    return jsonify({"apartments": attach_calculations(apartments)})


@app.route("/api/apartments/<apartment_id>", methods=["DELETE"])
def delete_apartment(apartment_id: str):
    session_id = current_session_id()
    apartments = [apartment for apartment in load_apartments(session_id) if apartment["id"] != apartment_id]
    save_apartments(session_id, apartments)
    return jsonify({"apartments": attach_calculations(apartments)})


@app.route("/api/reset", methods=["POST"])
def reset():
    session_id = current_session_id()
    apartments = [normalize_apartment(apartment, apartment["id"]) for apartment in DEMO_APARTMENTS]
    save_apartments(session_id, apartments)
    return jsonify({"apartments": attach_calculations(apartments)})


@app.route("/api/state", methods=["PUT"])
def replace_state():
    session_id = current_session_id()
    payload = request.get_json(silent=True) or {}
    apartments = payload.get("apartments") if isinstance(payload, dict) else payload
    if not isinstance(apartments, list):
        return jsonify({"error": "Apartments array is required."}), 400
    normalized = []
    try:
        for apartment in apartments[:10]:
            normalized.append(normalize_apartment(apartment, apartment.get("id")))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    save_apartments(session_id, normalized)
    return jsonify({"apartments": attach_calculations(normalized)})


@app.route("/api/analyze", methods=["POST"])
def analyze():
    text = (request.get_json(silent=True) or {}).get("text", "")
    if not text.strip():
        return jsonify({"error": "Paste a listing description first."}), 400
    return jsonify(analyze_listing(text[:20000]))


@app.route("/api/commute", methods=["POST"])
def commute():
    payload = request.get_json(silent=True) or {}
    destination = str(payload.get("destination", "")).strip()
    apartments = payload.get("apartments") or load_apartments(current_session_id())
    if len(destination) < 8:
        return jsonify({"error": "Enter a full workplace or college street address."}), 400

    def geocode(address: str):
        response = requests.get("https://nominatim.openstreetmap.org/search", params={"format": "jsonv2", "limit": 1, "q": address}, headers={"Accept": "application/json", "User-Agent": "HiddenCost/1.0"}, timeout=12)
        response.raise_for_status()
        matches = response.json()
        if not matches:
            raise ValueError("Address not found")
        return float(matches[0]["lat"]), float(matches[0]["lon"])

    def route(start: tuple, end: tuple, mode: str):
        prefix = "car" if mode == "driving" else "foot"
        url = f"https://routing.openstreetmap.de/routed-{prefix}/route/v1/driving/{start[1]},{start[0]};{end[1]},{end[0]}"
        response = requests.get(url, params={"overview": "false"}, headers={"Accept": "application/json", "User-Agent": "HiddenCost/1.0"}, timeout=12)
        response.raise_for_status()
        data = response.json()
        if data.get("code") != "Ok" or not data.get("routes"):
            raise ValueError("No route found")
        route_data = data["routes"][0]
        return {"miles": route_data["distance"] / 1609.344, "minutes": route_data["duration"] / 60}

    try:
        destination_point = geocode(destination)
    except Exception as exc:
        return jsonify({"error": f"Destination lookup failed: {exc}"}), 422

    routes = []
    for apartment in apartments:
        address = str(apartment.get("address", "")).strip()
        if len(address) < 8:
            routes.append({"id": apartment["id"], "name": apartment["name"]})
            continue
        try:
            start = geocode(address)
            item = {"id": apartment["id"], "name": apartment["name"]}
            try:
                item["driving"] = route(start, destination_point, "driving")
            except Exception:
                item["drivingError"] = True
            try:
                item["walking"] = route(start, destination_point, "walking")
            except Exception:
                item["walkingError"] = True
            routes.append(item)
        except Exception as exc:
            routes.append({"id": apartment["id"], "name": apartment["name"], "error": str(exc)})
    return jsonify({"destination": destination, "routes": routes})


handler = None


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "4173")), debug=False)
