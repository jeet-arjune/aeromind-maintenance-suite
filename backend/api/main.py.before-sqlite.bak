import sys
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ml" / "pipeline"))

from health_assessment import assess_engine

app = FastAPI(
    title="AeroGuard AI V4 API",
    description="Aircraft engine predictive maintenance prototype",
    version="4.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173",
                   "http://127.0.0.1:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)

DATA_DIR = ROOT / "database" / "raw"


@app.get("/")
def home():
    return {
        "service": "AeroGuard AI V4",
        "status": "online",
        "model": "GRU + 4 anomaly detectors",
    }


@app.get("/api/engines")
def list_engines():
    engines = []
    for path in sorted(DATA_DIR.glob("engine_*.csv")):
        try:
            engine_id = int(path.stem.split("_")[1])
        except (ValueError, IndexError):
            continue
        engines.append({"engine_id": engine_id})
    return {"engines": engines}


@app.get("/api/engines/{engine_id}/health")
def engine_health(engine_id: int):
    if engine_id < 1:
        raise HTTPException(status_code=400, detail="Invalid engine ID")

    path = DATA_DIR / f"engine_{engine_id}.csv"

    if not path.is_file():
        raise HTTPException(
            status_code=404,
            detail=f"Engine {engine_id} data not found",
        )

    try:
        history = pd.read_csv(path)
        result = assess_engine(history)
    except (ValueError, KeyError, TypeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return {"engine_id": engine_id, **result}


# Cached fleet analysis — precomputed GRU + anomaly detector results
import json

FLEET_CACHE = ROOT / "database" / "fleet_analysis.json"


def load_fleet_cache():
    if not FLEET_CACHE.is_file():
        raise HTTPException(
            status_code=503,
            detail="Fleet cache missing. Run python ml/pipeline/build_fleet_cache.py",
        )

    try:
        return json.loads(FLEET_CACHE.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Unable to read fleet cache: {exc}",
        ) from exc


@app.get("/api/fleet/analysis")
def fleet_analysis():
    """Return precomputed health assessments for all 100 test engines."""
    return load_fleet_cache()


@app.get("/api/fleet/analysis/{engine_id}")
def cached_engine_analysis(engine_id: int):
    """Return one engine's cached RUL, priority, and detector scores."""
    if not 1 <= engine_id <= 100:
        raise HTTPException(status_code=400, detail="Invalid engine ID")

    data = load_fleet_cache()

    for engine in data["engines"]:
        if engine["engine_id"] == engine_id:
            return engine

    raise HTTPException(status_code=404, detail="Engine not found in fleet cache")


@app.get("/api/engines/{engine_id}/sensors")
def engine_sensor_history(engine_id: int):
    """Return real cycle-by-cycle NASA sensor readings for plotting."""
    if not 1 <= engine_id <= 100:
        raise HTTPException(status_code=400, detail="Invalid engine ID")

    path = DATA_DIR / f"engine_{engine_id}.csv"

    if not path.is_file():
        raise HTTPException(status_code=404, detail="Engine data not found")

    history = pd.read_csv(path)

    sensor_columns = [
        column for column in history.columns
        if column.startswith("s_")
    ]

    return {
        "engine_id": engine_id,
        "cycles": len(history),
        "sensors": sensor_columns,
        "readings": history[["time_cycles", *sensor_columns]]
            .to_dict(orient="records"),
    }
