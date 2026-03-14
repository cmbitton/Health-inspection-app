#!/usr/bin/env python3
"""
Refresh data/locations.json with latest inspection data from the RI health inspections API.

Phases:
  1. Incremental update — fetch new/re-inspected facilities from the top of the API
     (most recent first) and stop once we hit a full page of already-current records.
  2. Backfill — populate violation_count/risk_score for any location still missing it
     (only needed on the very first run after these fields were added).

Usage:
  python3 scripts/refresh.py
"""

import base64
import json
import time
import urllib.parse
import urllib.request
import urllib.error
from pathlib import Path

DATA_FILE    = Path(__file__).parent.parent / "data" / "locations.json"
FACILITIES   = "https://ri.healthinspections.us/ri/API/index.cfm/facilities/{}/0"
INSPECTIONS  = "https://ri.healthinspections.us/ri/API/index.cfm/inspectionsData/{}"
NOMINATIM    = "https://nominatim.openstreetmap.org/search?q={}&format=json&limit=1&countrycodes=us"

API_HEADERS = {
    "Accept":     "application/json",
    "User-Agent": "Mozilla/5.0",
    "Referer":    "https://ri.healthinspections.us/",
}


# ── Violation severity weights (FDA Food Code) ────────────────────────────────
# Critical (weight 3): directly linked to foodborne illness
CRITICAL = {5, 6, 7, 8, 9, 15, 20, 21, 22, 23, 25, 28, 29, 38}
# Priority Foundation (weight 2): support the food safety system
PRIORITY_FOUNDATION = {1, 2, 3, 4, 10, 11, 12, 13, 14, 16, 33, 35, 36, 39}
# Everything else = Core (weight 1): maintenance/sanitation


def violation_weight(violation_str):
    """Extract the code number from a violation string and return its weight."""
    try:
        code = int(violation_str.split(" - ")[0].strip())
        if code in CRITICAL:           return 3
        if code in PRIORITY_FOUNDATION: return 2
        return 1
    except (ValueError, IndexError):
        return 1


def score_inspection(violations_dict):
    """Return (violation_count, risk_score) from a violations dict."""
    items = [v[0] for v in violations_dict.values() if v and v[0]]
    count = len(items)
    score = sum(violation_weight(v) for v in items)
    return count, score


# ── Helpers ───────────────────────────────────────────────────────────────────

def fetch_json(url, headers=API_HEADERS):
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())

def decode_id(b64_str):
    padded = b64_str + "=" * (-len(b64_str) % 4)
    return base64.b64decode(padded).decode()

def encode_id(numeric_id):
    return base64.b64encode(str(numeric_id).encode()).decode()

def parse_facility(item):
    return {
        "id":             decode_id(item["id"]),
        "name":           item.get("name", ""),
        "address":        item.get("mapAddress", ""),
        "last_inspection": item.get("columns", {}).get("1", "").replace("Last Inspection Date:", "").strip(),
        "license_type":   item.get("columns", {}).get("2", "").replace("License Type: ", "").strip(),
    }

def get_inspection_scores(facility_id):
    """Return (violation_count, risk_score) for the most recent inspection, or (None, None) on error."""
    url = INSPECTIONS.format(encode_id(facility_id))
    try:
        data = fetch_json(url)
        if not data:
            return 0, 0
        count, score = score_inspection(data[0].get("violations", {}))
        return count, score
    except urllib.error.HTTPError as e:
        print(f"    Warning: HTTP {e.code} fetching violations for {facility_id}")
        return None, None
    except Exception as e:
        print(f"    Warning: {e}")
        return None, None

def geocode(address):
    query = urllib.parse.quote(f"{address}, Rhode Island")
    url   = NOMINATIM.format(query)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "ri-health-inspections-refresh/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            results = json.loads(resp.read())
        if results:
            return float(results[0]["lat"]), float(results[0]["lon"])
    except Exception as e:
        print(f"    Warning: geocoding failed for '{address}': {e}")
    return None, None


# ── Phase 1: Incremental update ───────────────────────────────────────────────

def incremental_update(locations, by_id):
    updated_count = 0
    added_count   = 0
    offset        = 0

    print("─── Phase 1: Incremental update ───")

    while True:
        url = FACILITIES.format(offset)
        try:
            batch = fetch_json(url)
        except Exception as e:
            print(f"Error at offset {offset}: {e}")
            break

        if not batch:
            print("Reached end of API.")
            break

        all_current = True
        for item in batch:
            fac = parse_facility(item)
            existing = by_id.get(fac["id"])

            if existing and existing.get("last_inspection") == fac["last_inspection"]:
                continue  # already up to date

            all_current = False

            if existing:
                print(f"  Updated: {fac['name']} ({fac['last_inspection']})")
                count, score = get_inspection_scores(fac["id"])
                existing["last_inspection"] = fac["last_inspection"]
                if count is not None:
                    existing["violation_count"] = count
                    existing["risk_score"]      = score
                updated_count += 1
            else:
                print(f"  New:     {fac['name']}")
                lat, lng = geocode(fac["address"])
                time.sleep(1.1)  # Nominatim rate limit: 1 req/s
                count, score = get_inspection_scores(fac["id"])
                fac["lat"]             = lat
                fac["lng"]             = lng
                fac["violation_count"] = count if count is not None else 0
                fac["risk_score"]      = score if score is not None else 0
                locations.append(fac)
                by_id[fac["id"]]       = fac
                added_count += 1

            time.sleep(0.4)

        if all_current:
            print(f"Full page current at offset {offset} — stopping.")
            break

        offset += 1
        time.sleep(0.4)

    print(f"Phase 1 done: {updated_count} updated, {added_count} added.\n")


# ── Phase 2: Backfill violation_count ────────────────────────────────────────

def backfill(locations):
    missing = [loc for loc in locations if "risk_score" not in loc]
    if not missing:
        print("─── Phase 2: No backfill needed ───\n")
        return

    print(f"─── Phase 2: Backfilling {len(missing)} locations ───")

    for i, loc in enumerate(missing, 1):
        count, score = get_inspection_scores(loc["id"])
        if count is not None:
            loc["violation_count"] = count
            loc["risk_score"]      = score
        time.sleep(0.35)

        if i % 100 == 0 or i == len(missing):
            print(f"  {i}/{len(missing)} — saving checkpoint…")
            DATA_FILE.write_text(json.dumps(locations, indent=2))

    print("Phase 2 done.\n")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    locations = json.loads(DATA_FILE.read_text())
    by_id     = {loc["id"]: loc for loc in locations}
    print(f"Loaded {len(locations)} locations from {DATA_FILE}\n")

    incremental_update(locations, by_id)
    backfill(locations)

    DATA_FILE.write_text(json.dumps(locations, indent=2))
    print(f"Saved {len(locations)} locations to {DATA_FILE}")


if __name__ == "__main__":
    main()
