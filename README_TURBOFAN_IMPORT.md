# AeroMind 2.0 — imported turbofan model (v3)

This package includes the actual glTF geometry uploaded by the user. It is a **generic artistic turbofan model**, not GE90 CAD or real sensor-installation geometry.

## License / attribution

Original model: **Turbine | Turbofan Engine | Jet Engine**, by **blenderbirb**.
Source: https://sketchfab.com/3d-models/turbine-turbofan-engine-jet-engine-74c6aceed86b4a41aaad3b93afc3e262
License: https://creativecommons.org/licenses/by/4.0/ (CC BY 4.0).

The original `license.txt` is included under `frontend/public/models/turbofan/` and the viewer includes visible attribution. Retain these notices if publishing or sharing the project.

## Install (macOS Terminal)

Download `AeroMind_Imported_Turbofan_v3.zip` to Downloads. Then:

```bash
cd /Users/user/Desktop/Projects/engine_health_monitor
unzip -n "$HOME/Downloads/AeroMind_Imported_Turbofan_v3.zip" -d .
python3 scripts/install_imported_turbofan.py
cd frontend
npm run build
npm run dev
```

The installer edits **only** `frontend/src/EngineExplorer.tsx`, and backs it up first. It adds a new `ImportedTurbofanViewer` component and **does not overwrite** the existing `GE90Viewer`. The backend, ML models, exported data, and `App.tsx` are untouched. The script is idempotent.

## What works

- Actual uploaded glTF geometry and six material colors; local, no external model service required.
- Orbit camera, zoom, reset, auto orbit, imported metallic materials with offline studio lighting.
- 21 clickable **illustrative** sensor-channel markers, tied to existing `availableSensors`, `onSelectSensor` and the right-hand evidence panel.
- Click a part of the engine to select an **approximate** axial region; use the region buttons below the viewer.
- Existing dashboard and RUL pages remain unchanged.

## Limitations

- The original download has `scene.gltf`, `scene.bin`, and `license.txt`; no separate texture maps or animations.
- The 19 meshes are grouped by material, not by mechanical component. Therefore there is no real fan-spin or exploded-view animation. Those controls are intentionally replaced by camera auto-orbit and reset.
- Sensor markers are illustrative locations; NASA C-MAPSS FD001 does not provide validated mounting positions for this model, and its telemetry is simulated.
- For high-detail realistic wiring, a separate licensed asset or custom modeled geometry would be required.

## Roll back

Find the timestamped `frontend/src/EngineExplorer.tsx.before-imported-turbofan-*.bak` file. Copy it over `frontend/src/EngineExplorer.tsx` to restore the previous viewer. The previous GE90 viewer source files remain in place.

## Troubleshooting

If the engine is blank, inspect the browser developer console and verify that these two URLs load from Vite:

- `http://localhost:5173/models/turbofan/scene.gltf`
- `http://localhost:5173/models/turbofan/scene.bin`

If Vite uses a different port, replace `5173` with the one printed by `npm run dev`.
