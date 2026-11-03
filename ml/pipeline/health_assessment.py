import json
import sys

import pandas as pd

from rul_predictor import predict_rul
from anomaly_detector import detect_anomalies


def assess_engine(history):
    rul_result = predict_rul(history)
    anomaly_result = detect_anomalies(history)

    rul = rul_result["predicted_rul_cycles"]
    anomaly_count = anomaly_result["anomaly_count"]

    if rul <= 30:
        status = "CRITICAL"
        reason = "Predicted remaining life is 30 cycles or less"
    elif rul <= 60 or anomaly_count > 0:
        status = "UNDER OBSERVATION"
        reason = "Reduced remaining life or anomalous sensor behavior"
    else:
        status = "HEALTHY"
        reason = "No detected anomalies and remaining life above 60 cycles"

    return {
        "current_cycle": rul_result["current_cycle"],
        "predicted_rul_cycles": rul,
        "maintenance_priority": status,
        "priority_reason": reason,
        "anomaly_count": anomaly_count,
        "detectors": anomaly_result["detectors"],
        "model": "AeroGuard AI V4 prototype",
    }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: python ml/pipeline/health_assessment.py engine.csv")

    history = pd.read_csv(sys.argv[1])
    print(json.dumps(assess_engine(history), indent=2))
