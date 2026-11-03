#!/usr/bin/env python3
"""Install AeroMind v4 visual upgrades; refuse ambiguous App.tsx modifications."""
from pathlib import Path
from datetime import datetime
import shutil, sys, re
root=Path(__file__).resolve().parents[1]
app=root/'frontend/src/App.tsx'
viewer=root/'frontend/src/components/engine3d/ImportedTurbofanViewer.tsx'
hero=root/'frontend/src/components/engine3d/EngineHero.tsx'
for p in [app,viewer,hero]:
    if not p.exists(): sys.exit(f'STOP: Missing {p}')
s=app.read_text()
if 'EngineHero' in s and '<EngineHero' in s:
    print('Homepage hero already integrated. No changes to App.tsx.'); sys.exit(0)
if "setActiveNav('Engine Explorer')" not in s and 'Engine Explorer' not in s:
    sys.exit('STOP: Engine Explorer navigation not found in App.tsx. No changes.')
if not re.search(r'<section\s+className=[\'"]aero-dashboard-grid[\'"]',s):
    sys.exit('STOP: Cannot locate dashboard grid. No changes.')
if 'import EngineHero' in s or '<EngineHero' in s:
    sys.exit('STOP: Partial EngineHero integration detected. No changes.')
new="import EngineHero from './components/engine3d/EngineHero'\n"+s
new,n=re.subn(r'(?P<indent>^[ \t]*)(?=<section\s+className=[\'"]aero-dashboard-grid[\'"])',
 lambda m:m.group('indent')+"{activeNav === 'Dashboard' && <EngineHero onExplore={() => setActiveNav('Engine Explorer')} />}\n"+m.group('indent'),new,count=1,flags=re.M)
if n!=1: sys.exit('STOP: Dashboard insertion failed. No changes.')
stamp=datetime.now().strftime('%Y%m%d_%H%M%S')
backup=app.with_name('App.tsx.before-engine-hero-'+stamp+'.bak')
shutil.copy2(app,backup)
app.write_text(new)
print('Backup:',backup)
print('Homepage 3D hero installed. Existing dashboard retained.')
print('Run: cd frontend && npm run build')
