#!/usr/bin/env python3
"""Non-destructive AeroMind importer for the user-supplied CC BY turbofan model.

Adds a new 3D viewer rather than replacing GE90Viewer. Only edits EngineExplorer.tsx
(and makes a timestamped backup). Backend, data, models, App.tsx are untouched.
"""
from datetime import datetime
from pathlib import Path
import re
import shutil
import sys

root = Path(__file__).resolve().parents[1]
explorer = root / 'frontend/src/EngineExplorer.tsx'
viewer = root / 'frontend/src/components/engine3d/ImportedTurbofanViewer.tsx'
css = root / 'frontend/src/components/engine3d/ImportedTurbofanViewer.css'
gltf = root / 'frontend/public/models/turbofan/scene.gltf'
binary = root / 'frontend/public/models/turbofan/scene.bin'
license_file = root / 'frontend/public/models/turbofan/license.txt'

for path in (explorer, viewer, css, gltf, binary, license_file):
    if not path.is_file():
        sys.exit(f'STOP: Required file is missing: {path}. No source files modified.')

before = explorer.read_text(encoding='utf-8')
new_import = "import ImportedTurbofanViewer from './components/engine3d/ImportedTurbofanViewer'"
old_import_pattern = r"import\s+GE90Viewer\s+from\s+['\"]\./components/engine3d/GE90Viewer['\"]"

if new_import in before and '<ImportedTurbofanViewer' in before and '<GE90Viewer' not in before:
    print('Imported turbofan is already integrated. No changes made.')
    sys.exit(0)

if before.count('<GE90Viewer') != 1:
    sys.exit('STOP: Expected exactly one <GE90Viewer .../> usage in EngineExplorer.tsx. No changes made.')

if new_import in before:
    sys.exit('STOP: New viewer import exists but old viewer is still in use. Please inspect manually.')

updated, import_count = re.subn(old_import_pattern, new_import, before, count=1)
if import_count != 1:
    sys.exit('STOP: Cannot safely find the existing GE90Viewer import. No changes made.')
updated = updated.replace('<GE90Viewer', '<ImportedTurbofanViewer', 1)

if '<ImportedTurbofanViewer' not in updated or 'availableSensors=' not in updated:
    sys.exit('STOP: Sensor integration does not match the previous v2 viewer. No changes made.')

stamp = datetime.now().strftime('%Y%m%d_%H%M%S')
backup = explorer.with_name(f'EngineExplorer.tsx.before-imported-turbofan-{stamp}.bak')
shutil.copy2(explorer, backup)
print('BACKUP:', backup)
explorer.write_text(updated, encoding='utf-8')
print('UPDATED:', explorer)
print('Original GE90Viewer.tsx/.css preserved for rollback.')
print('Backend, ML, datasets, App.tsx, and existing sensor evidence unchanged.')
print('NEXT: cd frontend && npm run build && npm run dev')
