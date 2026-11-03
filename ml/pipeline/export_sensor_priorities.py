import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
MODELS = ROOT / "ml/models"
RAW = ROOT / "database/raw"
OUTPUT = ROOT / "frontend/public/data/critical_sensor_priorities.json"

bundles = {
    name: joblib.load(MODELS / filename)
    for name, filename in {
        "short": "short_term_detector.joblib",
        "long": "long_term_detector.joblib",
        "slope": "slope_detector.joblib",
    }.items()
}

fleet = json.loads(
    (ROOT / "frontend/public/data/fleet_overview.json").read_text()
)

critical = [
    row for row in fleet
    if row["Stateful_Replayed_Priority"] == "CRITICAL"
]

sensors = [
    feature.removesuffix("_rsu")
    for feature in bundles["short"]["features"]
]

def compute_engine(engine):
    engine_id = int(engine["unit_number"])
    path = RAW / f"engine_{engine_id}.csv"
    df = pd.read_csv(path).sort_values("time_cycles").reset_index(drop=True)

    if len(df) < 20:
        raise ValueError(f"Engine {engine_id}: insufficient sensor history")

    missing = [s for s in sensors if s not in df.columns]
    if missing:
        raise ValueError(f"Engine {engine_id}: missing sensors {missing}")

    readings = df[sensors].apply(pd.to_numeric, errors="raise")

    if not np.isfinite(readings.to_numpy()).all():
        raise ValueError(f"Engine {engine_id}: invalid sensor readings")

    ranked = []

    for sensor in sensors:
        values = readings[sensor]

        previous_mean = values.shift(1).rolling(
            10, min_periods=10
        ).mean()

        baseline = values.iloc[:10].mean()

        features = {
            "short": values - previous_mean,
            "long": values - baseline,
            "slope": values.rolling(
                10, min_periods=10
            ).apply(
                lambda a: np.polyfit(
                    np.arange(len(a)), a, 1
                )[0],
                raw=True,
            ),
        }

        detector_results = {}
        combined_alerts = np.zeros(len(df), dtype=bool)

        for name, series in features.items():
            bundle = bundles[name]
            suffix = {
                "short": "_rsu",
                "long": "_long_rsu",
                "slope": "_slope",
            }[name]

            feature_name = sensor + suffix

            # Each trained detector may monitor a different sensor subset.
            if feature_name not in bundle["features"]:
                continue

            mean = float(bundle["mean"].loc[feature_name])
            std = float(bundle["std"].loc[feature_name])
            threshold = float(bundle["threshold"])

            if std <= 0 or threshold <= 0:
                raise ValueError(f"Invalid model parameters: {feature_name}")

            z = ((series - mean) / std).abs()
            alerts = (z > threshold).fillna(False)
            combined_alerts |= alerts.to_numpy()

            latest_z = float(z.iloc[-1])

            detector_results[name] = {
                "active": bool(alerts.iloc[-1]),
                "z_score": round(latest_z, 3),
                "threshold": round(threshold, 3),
                "exceedance_ratio": round(latest_z / threshold, 3),
            }

        current_agreement = sum(
            item["active"] for item in detector_results.values()
        )

        recent = combined_alerts[-10:]
        persistence = int(recent.sum())
        recency = int(combined_alerts[-5:].sum())

        severity = max(
            item["exceedance_ratio"]
            for item in detector_results.values()
        )

        # Transparent heuristic, not a trained fault-probability model.
        score = (
            40 * current_agreement / max(len(detector_results), 1)
            + 25 * persistence / 10
            + 20 * recency / 5
            + 15 * min(max(severity - 1, 0), 2) / 2
        )

        if current_agreement >= 2:
            verification = "MULTI_DETECTOR"
        elif current_agreement == 1 and persistence >= 3:
            verification = "PERSISTENT_SINGLE_DETECTOR"
        elif current_agreement == 1:
            verification = "SINGLE_DETECTOR"
        elif persistence:
            verification = "RECENT_HISTORY_ONLY"
        else:
            verification = "NO_DETECTED_ANOMALY"

        ranked.append({
            "sensor": sensor.upper().replace("_", "-"),
            "score": round(score, 2),
            "current_agreement": current_agreement,
            "persistence_10": persistence,
            "recency_5": recency,
            "severity_ratio": round(severity, 3),
            "verification": verification,
            "detectors": detector_results,
        })

    ranked.sort(
        key=lambda row: (
            -row["score"],
            -row["current_agreement"],
            -row["persistence_10"],
            row["sensor"],
        )
    )

    actionable = [
        item for item in ranked
        if item["current_agreement"] > 0
        or item["persistence_10"] > 0
    ]

    for index, item in enumerate(actionable):
        item["inspection_priority"] = (
            "P1" if index < 3 else
            "P2" if item["current_agreement"] > 0 else
            "P3"
        )

    return {
        "engine_id": engine_id,
        "current_cycle": int(engine["time_cycles"]),
        "predicted_rul": float(engine["Predicted_RUL"]),
        "engine_priority": engine["Stateful_Replayed_Priority"],
        "engine_detector_agreement": int(engine["Current_Detectors"]),
        "top_exported_sensor": engine.get("Top_Alert_Sensor"),
        "sensors": actionable,
        "monitored_sensor_count": len(sensors),
    }

results = [compute_engine(engine) for engine in critical]

payload = {
    "system": "AeroGuard Hybrid Sensor Inspection Prioritization",
    "dataset": "NASA C-MAPSS FD001",
    "method": "Trained detector thresholds plus heuristic evidence ranking",
    "disclaimer": (
        "Priorities indicate signals to investigate, not confirmed "
        "sensor hardware faults or required replacements."
    ),
    "engines": results,
}

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(json.dumps(payload, indent=2))

print("Hybrid sensor priority export completed.")
print("Critical engines processed:", len(results))
print("Monitored sensors per engine:", len(sensors))
print("Output:", OUTPUT)
print("Example engine:", results[0]["engine_id"])
print("Top inspection candidates:")
for sensor in results[0]["sensors"][:5]:
    print(
        sensor["inspection_priority"],
        sensor["sensor"],
        "score:", sensor["score"],
        "verification:", sensor["verification"],
    )
