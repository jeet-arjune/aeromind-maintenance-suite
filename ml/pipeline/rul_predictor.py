import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import tensorflow as tf

MODEL_DIR = Path(__file__).resolve().parents[1] / "models"

config = json.loads((MODEL_DIR / "aeroguard_v3_config.json").read_text())
sensors = config["sensor_channels"]
features = config["features"]
window_size = config["window_size"]

scaler = joblib.load(MODEL_DIR / "aeroguard_v3_scaler.joblib")
model = tf.keras.models.load_model(
    MODEL_DIR / "aeroguard_v3_gru_42.keras",
    compile=False
)

def predict_rul(engine_history):
    required = ["time_cycles"] + sensors
    missing = [c for c in required if c not in engine_history.columns]
    if missing:
        raise ValueError(f"Missing columns: {missing}")

    df = engine_history[required].copy()
    df[required] = df[required].apply(pd.to_numeric, errors="raise")
    df = df.sort_values("time_cycles")

    if len(df) < window_size:
        raise ValueError(f"At least {window_size} cycles are required")
    if df["time_cycles"].duplicated().any():
        raise ValueError("Duplicate cycle numbers detected")
    if not np.isfinite(df[required].to_numpy(dtype=float)).all():
        raise ValueError("Sensor data contains missing or infinite values")

    for sensor in sensors:
        cumulative = df[sensor].expanding().mean()
        df[f"{sensor}_cummean"] = cumulative
        df[f"{sensor}_cumdiff"] = df[sensor] - cumulative

    scaled = scaler.transform(df[features])
    sequence = scaled[-window_size:].astype(np.float32)[None, :, :]
    prediction = float(model.predict(sequence, verbose=0)[0, 0])

    return {
        "predicted_rul_cycles": round(float(np.clip(prediction, 0, 125)), 2),
        "current_cycle": int(df["time_cycles"].iloc[-1]),
        "model": "AeroGuard V3 GRU",
    }

if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: python ml/pipeline/rul_predictor.py engine.csv")
    result = predict_rul(pd.read_csv(sys.argv[1]))
    print(json.dumps(result, indent=2))
