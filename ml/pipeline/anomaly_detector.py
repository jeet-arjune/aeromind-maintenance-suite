import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

MODEL_DIR = Path(__file__).resolve().parents[1] / "models"

detectors = {
    "isolation_forest": joblib.load(MODEL_DIR / "isolation_forest_bundle.joblib"),
    "short_term": joblib.load(MODEL_DIR / "short_term_detector.joblib"),
    "long_term": joblib.load(MODEL_DIR / "long_term_detector.joblib"),
    "slope": joblib.load(MODEL_DIR / "slope_detector.joblib"),
}

SENSORS = [f.replace("_rsu", "") for f in detectors["short_term"]["features"]]


def rolling_slope(values):
    x = np.arange(len(values), dtype=float)
    return float(np.polyfit(x, values, 1)[0])


def detect_anomalies(engine_history):
    required = ["time_cycles"] + SENSORS
    missing = [c for c in required if c not in engine_history.columns]
    if missing:
        raise ValueError(f"Missing columns: {missing}")

    df = engine_history[required].copy()
    df[required] = df[required].apply(pd.to_numeric, errors="raise")
    df = df.sort_values("time_cycles").reset_index(drop=True)

    if len(df) < 11:
        raise ValueError("At least 11 cycles are required")
    if df["time_cycles"].duplicated().any():
        raise ValueError("Duplicate cycle numbers detected")
    if not np.isfinite(df[required].to_numpy(dtype=float)).all():
        raise ValueError("Sensor data contains invalid values")

    window = 10

    for sensor in SENSORS:
        values = df[sensor]

        df[f"{sensor}_roll_mean"] = values.rolling(window, min_periods=window).mean()
        df[f"{sensor}_roll_std"] = values.rolling(window, min_periods=window).std(ddof=0)
        df[f"{sensor}_diff"] = values.diff()
        df[f"{sensor}_slope"] = values.rolling(window, min_periods=window).apply(
            rolling_slope, raw=True
        )

        previous_mean = values.shift(1).rolling(
            window, min_periods=window
        ).mean()
        df[f"{sensor}_rsu"] = values - previous_mean

        baseline = values.iloc[:10].mean()
        df[f"{sensor}_long_rsu"] = values - baseline

    latest = df.iloc[[-1]]
    results = {}

    bundle = detectors["isolation_forest"]
    scaled = bundle["scaler"].transform(latest[bundle["features"]])
    score = float(-bundle["model"].score_samples(scaled)[0])

    results["isolation_forest"] = {
        "score": round(score, 4),
        "threshold": round(float(bundle["threshold"]), 4),
        "anomaly": bool(score > bundle["threshold"]),
    }

    for name in ["short_term", "long_term", "slope"]:
        bundle = detectors[name]
        features = bundle["features"]

        values = latest[features].iloc[0]
        mean = bundle["mean"].reindex(features)
        std = bundle["std"].reindex(features)

        if std.isna().any() or (std <= 0).any():
            raise ValueError(f"Invalid normalization parameters: {name}")

        zscores = ((values - mean) / std).abs()
        score = float(zscores.max())

        results[name] = {
            "score": round(score, 4),
            "threshold": round(float(bundle["threshold"]), 4),
            "anomaly": bool(score > bundle["threshold"]),
            "top_feature": str(zscores.idxmax()),
        }

    return {
        "current_cycle": int(df["time_cycles"].iloc[-1]),
        "detectors": results,
        "anomaly_count": sum(
            int(item["anomaly"]) for item in results.values()
        ),
    }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: python ml/pipeline/anomaly_detector.py engine.csv")

    history = pd.read_csv(sys.argv[1])
    print(json.dumps(detect_anomalies(history), indent=2))
