#!/usr/bin/env python3
"""
Re-score all locations using exact FDA code sections from HTML inspection reports.

One-time migration from item-number scoring to code-section scoring.
Safe to interrupt and resume — processed locations are marked with
score_method='code_section' and skipped on subsequent runs.

Usage:
  python3 scripts/rescore.py [--dry-run]
"""

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from refresh import (
    DATA_FILE, INSPECTIONS,
    encode_id, fetch_json, fetch_report_codes, score_inspection,
)

RATE_LIMIT = 0.5  # seconds between locations (covers two HTTP requests per location)


def main():
    dry_run = "--dry-run" in sys.argv
    locations = json.loads(DATA_FILE.read_text())

    todo = [loc for loc in locations if loc.get("score_method") != "code_section"]
    print(f"{len(todo)} locations to rescore ({'dry run' if dry_run else 'live'}).\n")

    changed = 0
    for i, loc in enumerate(todo, 1):
        try:
            data = fetch_json(INSPECTIONS.format(encode_id(loc["id"])))
            if not data:
                loc["score_method"] = "code_section"
                continue
            insp  = data[0]
            pp    = insp.get("printablePath", "")
            codes = fetch_report_codes(pp) if pp else []
            count, score = score_inspection(insp.get("violations", {}), codes or None)

            old_score = loc.get("risk_score", 0)
            loc["violation_count"] = count
            loc["risk_score"]      = score
            loc["score_method"]    = "code_section"

            if score != old_score:
                method = f"{len(codes)} codes" if codes else ("clean" if count == 0 else "item fallback")
                print(f"  {loc['name']}: {old_score} → {score} ({method})")
                changed += 1

        except Exception as e:
            print(f"  Error for {loc['name']}: {e}")

        time.sleep(RATE_LIMIT)

        if i % 100 == 0 or i == len(todo):
            print(f"  {i}/{len(todo)} scored" + (" (dry run, not saving)" if dry_run else " — checkpoint saved"))
            if not dry_run:
                DATA_FILE.write_text(json.dumps(locations, indent=2))

    # Strip the progress-tracking field before final save
    for loc in locations:
        loc.pop("score_method", None)
    if not dry_run:
        DATA_FILE.write_text(json.dumps(locations, indent=2))

    print(f"\nDone. {changed}/{len(todo)} scores changed.")


if __name__ == "__main__":
    main()
