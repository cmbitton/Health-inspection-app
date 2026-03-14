#!/usr/bin/env python3
"""
Re-geocode all locations using the Google Maps Geocoding API.

Replaces Nominatim coordinates with more accurate Google results.
Saves a checkpoint every 100 records so it's safe to interrupt and resume.

Usage:
  GOOGLE_MAPS_KEY=your-key python3 scripts/regeocode.py
"""

import json
import os
import time
import urllib.parse
import urllib.request
from pathlib import Path

DATA_FILE   = Path(__file__).parent.parent / "data" / "locations.json"
GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json?address={}&key={}"

API_KEY = os.environ.get("GOOGLE_MAPS_KEY")
if not API_KEY:
    raise SystemExit("GOOGLE_MAPS_KEY environment variable not set.")


def geocode(address):
    query = urllib.parse.quote(address)
    url   = GEOCODE_URL.format(query, API_KEY)
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            data = json.loads(resp.read())
        if data["status"] == "OK":
            loc = data["results"][0]["geometry"]["location"]
            return loc["lat"], loc["lng"]
        else:
            return None, None
    except Exception as e:
        print(f"    Error: {e}")
        return None, None


def main():
    locations = json.loads(DATA_FILE.read_text())
    total     = len(locations)

    # Only process locations that haven't been re-geocoded yet
    todo = [loc for loc in locations if not loc.get("geocoded_by_google")]
    print(f"{total} total locations, {len(todo)} need re-geocoding.\n")

    for i, loc in enumerate(todo, 1):
        lat, lng = geocode(loc["address"])

        if lat is not None:
            loc["lat"] = lat
            loc["lng"] = lng
            loc["geocoded_by_google"] = True
        else:
            print(f"  Failed: {loc['address']}")

        time.sleep(0.05)  # 20 req/s, well under Google's 50 req/s limit

        if i % 100 == 0 or i == len(todo):
            print(f"  {i}/{len(todo)} — saving checkpoint…")
            DATA_FILE.write_text(json.dumps(locations, indent=2))

    print(f"\nDone. {sum(1 for l in locations if l.get('geocoded_by_google'))} locations geocoded by Google.")


if __name__ == "__main__":
    main()
