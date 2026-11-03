#!/usr/bin/env python3
"""AeroMind GE90-inspired viewer v2: safely add illustrative wiring and sensor channels.

Install this package in the repository root. This script only updates:
- frontend/src/components/engine3d/GE90Viewer.tsx
- frontend/src/components/engine3d/GE90Viewer.css
- frontend/src/EngineExplorer.tsx
It refuses to overwrite locally modified v1 viewer files.
"""
from datetime import datetime
from pathlib import Path
import hashlib
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / 'frontend/src'
DIR = FRONT / 'components/engine3d'
TEMPLATES = [
    (DIR / 'GE90Viewer.v2.tsx', DIR / 'GE90Viewer.tsx', '4b401f1a069a6248c04befc28f11cde05bbbf6c21c146a29f9f24e9c5ce0d283'),
    (DIR / 'GE90Viewer.v2.css', DIR / 'GE90Viewer.css', '43e4ab46b06a1f526e34281d8f08061890f9581406c9cf08c7dd158268620bd4'),
]
EXPLORER = FRONT / 'EngineExplorer.tsx'

def digest(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()

for template, destination, expected in TEMPLATES:
    if not template.is_file() or not destination.is_file():
        sys.exit(f'STOP: Missing {template if not template.is_file() else destination}. No files modified.')
if not EXPLORER.is_file():
    sys.exit(f'STOP: Missing {EXPLORER}. No files modified.')

planned = []
for template, destination, expected in TEMPLATES:
    current = destination.read_text()
    replacement = template.read_text()
    if current == replacement:
        continue
    if digest(current) != expected:
        sys.exit(f'STOP: {destination.name} differs from the original v1 starter. No files modified. Send me the diff to merge safely.')
    planned.append((destination, current, replacement))

original = EXPLORER.read_text()
updated = original
pattern = re.compile(r'<GE90Viewer\s+selectedZone=\{zone\}\s+onSelectZone=\{setZone\}\s*/>')
replacement = '''<GE90Viewer selectedZone={zone} onSelectZone={setZone}
                    selectedSensor={sensor?.sensor ?? sensorId}
                    onSelectSensor={setSensorId}
                    availableSensors={sensors.map(item => ({
                      id: item.sensor,
                      priority: item.inspection_priority,
                      detectorCount: item.current_agreement
                    }))}
                  />'''
if 'availableSensors={sensors.map' not in updated:
    updated, count = pattern.subn(replacement, updated)
    if count != 1:
        sys.exit('STOP: Cannot locate the original GE90Viewer JSX call. No files modified.')

old_sensor = 'const sensor = sensors.find(item => item.sensor === sensorId) ?? sensors[0]'
new_sensor = '''const sensor = sensors.find(item => item.sensor === sensorId)
    ?? (!sensorId ? sensors[0] : undefined)'''
if old_sensor in updated:
    updated = updated.replace(old_sensor, new_sensor, 1)
elif new_sensor not in updated:
    sys.exit('STOP: Cannot locate original sensor selection logic. No files modified.')

if 'ae-unranked-channel' not in updated:
    marker = '{sensor && ('
    if updated.count(marker) != 1:
        sys.exit('STOP: Cannot locate sensor detail panel. No files modified.')
    note = '''{!sensor && sensorId && (
                <div className="ae-unranked-channel" role="status">
                  <strong>{sensorId.toUpperCase()}</strong> — This channel has no ranked inspection
                  evidence in the current export. No anomaly status is inferred.
                </div>
              )}
              '''
    updated = updated.replace(marker, note + marker, 1)

if updated != original:
    planned.append((EXPLORER, original, updated))

if not planned:
    print('GE90 detail upgrade already installed. No changes made.')
    sys.exit(0)

stamp = datetime.now().strftime('%Y%m%d_%H%M%S')
for path, _, _ in planned:
    backup = path.with_name(f'{path.name}.before-ge90-detail-v2-{stamp}.bak')
    shutil.copy2(path, backup)
    print('BACKUP:', backup)
for path, _, replacement in planned:
    path.write_text(replacement)
    print('UPDATED:', path)

print('GE90-style wiring, 21 conceptual channel markers, and panel integration installed.')
print('Backend and ML pipeline unchanged.')
print('NEXT: cd frontend && npm run build && npm run dev')
