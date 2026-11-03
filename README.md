# AeroMind v4 — engine hero and inspection upgrades

**Requires:** AeroMind imported turbofan v3 already installed and working.

## Installation

1. Unzip package in your AeroMind repository root using `unzip -n`.
2. Run `python3 scripts/install_engine_hero_v4.py`.
3. Run `cd frontend && npm run build` and then `npm run dev`.

This updates the imported viewer's source/CSS, adds a new homepage component, and safely patches `App.tsx` after creating a timestamped backup. It does not modify ML, API, or model geometry. The imported model files from v3 remain in place. Re-running the script will not insert a duplicate homepage hero.

## Features

- Homepage 3D engine hero with continuous orbit and an Explore Engine action.
- Larger Engine Explorer viewport, improved lighting and camera framing.
- Selecting a sensor repositions the camera toward an *approximate* inspection region. Camera reset remains available.
- Existing approximate section selection and evidence panel retained.
- Homepage engine viewer is lazy loaded using React.lazy/Suspense.

## Important limitations

The imported generic turbofan is not a GE90. Sensor locations and selected sections are illustrative and not engineering-validated; NASA C-MAPSS FD001 is simulated data. The model meshes are grouped by material, so physically correct component isolation/exploded animation is not supported by this asset. Do not present the sensor camera focus as a true sensor installation position.

Model attribution: *Turbine | Turbofan Engine | Jet Engine* by blenderbirb, CC BY 4.0. Preserve the attribution already present in the Engine Explorer footer.
