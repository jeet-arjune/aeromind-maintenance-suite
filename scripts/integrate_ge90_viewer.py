#!/usr/bin/env python3
"""Safely install the GE90-inspired 3D preview into AeroMind's existing UI.

Requires files from AeroMind_GE90_3D_Starter.zip to be unzipped into repo root.
Creates backups before writing; never edits backend or ML files.
"""
from pathlib import Path
from datetime import datetime
import re
import shutil
import sys

root = Path(__file__).resolve().parents[1]
app = root / 'frontend/src/App.tsx'
explorer = root / 'frontend/src/EngineExplorer.tsx'
viewer = root / 'frontend/src/components/engine3d/GE90Viewer.tsx'

for p in (app, explorer, viewer):
    if not p.is_file():
        sys.exit(f'STOP: Required file not found: {p}. Nothing changed.')

app_before = app.read_text()
explorer_before = explorer.read_text()
app_after = app_before
explorer_after = explorer_before

# Replace only the previous conceptual SVG, preserving sensor panels and data.
if "import GE90Viewer from './components/engine3d/GE90Viewer'" not in explorer_after:
    marker = "import './EngineExplorer.css'"
    if explorer_after.count(marker) != 1:
        sys.exit('STOP: EngineExplorer.css import not found exactly once. Nothing changed.')
    explorer_after = explorer_after.replace(
        marker, "import GE90Viewer from './components/engine3d/GE90Viewer'\n" + marker, 1
    )

if '<GE90Viewer' not in explorer_after:
    # Limit match to the <svg> that has className="ae-engine-svg".
    pattern = re.compile(r'(?s)<svg\b(?:(?!</svg>).)*?className="ae-engine-svg"(?:(?!</svg>).)*?</svg>')
    matches = list(pattern.finditer(explorer_after))
    if len(matches) != 1:
        sys.exit(f'STOP: Expected one old engine schematic, found {len(matches)}. Nothing changed.')
    explorer_after = pattern.sub(
        '              <GE90Viewer selectedZone={zone} onSelectZone={setZone} />',
        explorer_after, count=1
    )

explorer_after = explorer_after.replace('CONCEPTUAL SCHEMATIC', 'INTERACTIVE 3D PREVIEW')

# App.tsx may already be integrated from the earlier optional step.
if "import EngineExplorer from './EngineExplorer'" not in app_after:
    marker = "import EngineIntelligence from './EngineIntelligence'"
    if app_after.count(marker) != 1:
        sys.exit('STOP: Cannot safely locate EngineIntelligence import. Nothing changed.')
    app_after = app_after.replace(marker, marker + "\nimport EngineExplorer from './EngineExplorer'", 1)

if "{ label: 'Engine Explorer', icon: Cpu }," not in app_after:
    marker = "{ label: 'Critical Sensors', icon: Activity },"
    if app_after.count(marker) != 1:
        sys.exit('STOP: Cannot safely locate sidebar navigation. Nothing changed.')
    app_after = app_after.replace(marker, "{ label: 'Engine Explorer', icon: Cpu },\n  " + marker, 1)

if "{activeNav === 'Engine Explorer' && (" not in app_after:
    marker = "{activeNav === 'Critical Sensors' && <CriticalSensors />}"
    if app_after.count(marker) != 1:
        sys.exit('STOP: Cannot safely locate page content. Nothing changed.')
    app_after = app_after.replace(marker, """{activeNav === 'Engine Explorer' && (
              <EngineExplorer selectedId={selectedId} onSelect={setSelectedId} />
            )}
            """ + marker, 1)

old = "activeNav === 'RUL Prediction' || activeNav === 'Critical Sensors'"
new = old + " || activeNav === 'Engine Explorer'"
if new not in app_after:
    if app_after.count(old) != 1:
        sys.exit('STOP: Cannot safely locate dashboard visibility condition. Nothing changed.')
    app_after = app_after.replace(old, new, 1)

changed = [(p, old_text, new_text) for p, old_text, new_text in (
    (app, app_before, app_after), (explorer, explorer_before, explorer_after)
) if old_text != new_text]

if not changed:
    print('Already integrated. No files modified.')
else:
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    for p, _, _ in changed:
        backup = p.with_name(f'{p.name}.before-ge90-3d-{timestamp}.bak')
        shutil.copy2(p, backup)
        print('BACKUP:', backup)
    for p, _, new_text in changed:
        p.write_text(new_text)
        print('UPDATED:', p)

print('3D viewer integrated. Backend, ML pipeline and source data unchanged.')
print('NEXT: cd frontend && npm run build && npm run dev')
