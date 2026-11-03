# AeroMind — GE90-inspired 3D detail upgrade v2

Adds dense illustrative wiring harnesses, pressure/service plumbing, clamps, fasteners, and 21 clickable C-MAPSS telemetry channel markers to the existing GE90-inspired Three.js viewer. Clicking a 3D marker selects the corresponding sensor in the right-side evidence panel when the export includes it. For unranked channels, the panel explicitly says no ranked evidence is available. Existing sensor list selections also highlight the 3D marker.

**Important:** The 3D sensor locations and cable routes are artistic representations, **not** verified GE90 installations. NASA C-MAPSS FD001 is simulated generic turbofan data, not actual GE90 telemetry. C-MAPSS has 21 measured sensor channels, but this project's inspection export may rank only a subset. The upgrade does not invent readings for missing channels.

## Installation

From the repository root on your Mac:

```bash
cd /Users/user/Desktop/Projects/engine_health_monitor
unzip -n "$HOME/Downloads/AeroMind_GE90_Detail_Upgrade_v2.zip" -d .
python3 scripts/upgrade_ge90_details.py
cd frontend
npm run build
npm run dev
```

This installer checks the original v1 viewer file hashes before overwriting them, and creates timestamped backups of each file it modifies. It stops if the viewer has been edited since v1, rather than silently replacing your work. It changes no backend or ML files.

## Test

1. Open **Engine Explorer**. You should see wires and plumbing around the exposed engine core.
2. Toggle **Hide wiring** / **Show wiring** and **Hide sensors** / **Show sensors**.
3. Click a colored sensor connector. The right-side inspection evidence should switch to that sensor if ranked evidence is available; otherwise it should say no ranked evidence is available.
4. Click a sensor in the right-side list; its 3D marker should highlight.
5. Try **Explode**. External wiring and markers are hidden in exploded mode to avoid floating cables; use **Assemble** to restore them.
6. Confirm dashboard and RUL pages still work.

## Next stage

For actual photorealism and mechanically accurate GE90 harness routing, obtain a suitably licensed detailed GE90-style 3D asset and relevant engineering references, then map its named meshes to inspection controls. Do not claim this procedural prototype reproduces all real GE90 wiring and sensors.
