import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ml" / "pipeline"))

from health_assessment import assess_engine

DATA_DIR = ROOT / "database" / "raw"
CACHE_FILE = ROOT / "database" / "fleet_analysis.json"

engines = []
errors = []

paths = sorted(
    DATA_DIR.glob("engine_*.csv"),
    key=lambda path: int(path.stem.split("_")[1]),
)

for index, path in enumerate(paths, start=1):
    engine_id = int(path.stem.split("_")[1])

    try:
        history = pd.read_csv(path)
        result = assess_engine(history)
        engines.append({"engine_id": engine_id, **result})

        print(
            f"[{index:3}/{len(paths)}] "
            f"AC-{engine_id:03} | "
            f"RUL: {result['predicted_rul_cycles']:6.2f} | "
            f"Priority: {result['maintenance_priority']}",
            flush=True,
        )

    except Exception as exc:
        errors.append({"engine_id": engine_id, "error": str(exc)})
        print(f"ERROR AC-{engine_id:03}: {exc}", flush=True)

payload = {
    "generated_at": datetime.now(timezone.utc).isoformat(),
    "dataset": "NASA C-MAPSS FD001 test fleet",
    "total_engines": len(engines),
    "engines": engines,
    "errors": errors,
}

CACHE_FILE.write_text(json.dumps(payload, indent=2))

print("\n========== FLEET ANALYSIS ==========")
print(f"Engines analyzed: {len(engines)}")
print(f"Errors: {len(errors)}")

for priority in ["HEALTHY", "WATCH", "AT_RISK", "CRITICAL"]:
    count = sum(
        engine["maintenance_priority"] == priority
        for engine in engines
    )
    print(f"{priority}: {count}")

print(f"Cache saved: {CACHE_FILE}")
print("====================================")
