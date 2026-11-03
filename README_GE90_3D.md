# AeroMind GE90-inspired 3D viewer — starter v1

This is a **procedural visual prototype**, not a real GE90 CAD model. It does not imply that NASA C-MAPSS FD001 sensor IDs correspond to GE90 component locations. The viewer has 360-degree orbit controls, zoom, fan animation, exploded view, and clickable conceptual sections.

## Install (Mac Terminal)

1. Download `AeroMind_GE90_3D_Starter.zip` to your Downloads folder.
2. In Terminal:

```bash
cd /Users/user/Desktop/Projects/engine_health_monitor
unzip -n "$HOME/Downloads/AeroMind_GE90_3D_Starter.zip" -d .
python3 scripts/integrate_ge90_viewer.py
cd frontend
npm run build
npm run dev
```

If your browser changed the ZIP filename, use its actual path in the unzip command.

The script creates backups of `App.tsx` and `EngineExplorer.tsx` before changing either. It does not touch the Python backend, models, or data. It will stop without modifying existing files if the expected integration points are missing. It is safe to rerun; it detects existing integration.

## Next iteration

Replace the procedural meshes with a properly licensed, high-detail GE90-style `.glb` model. Do not treat the photo as an accurate source for invisible rear/internal geometry. Map clickable model components using mesh names or explicit metadata. Keep C-MAPSS-derived analytics separate from GE90-specific engineering claims.
