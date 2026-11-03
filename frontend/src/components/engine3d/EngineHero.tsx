import { lazy, Suspense } from 'react'
import { ArrowUpRight, Rotate3D } from 'lucide-react'
import './EngineHero.css'
const ImportedTurbofanViewer = lazy(() => import('./ImportedTurbofanViewer'))

export default function EngineHero({ onExplore }: { onExplore: () => void }) {
  return <section className="aero-engine-hero" aria-label="Interactive turbofan engine overview">
    <div className="aero-engine-hero-copy">
      <span className="aero-engine-hero-eyebrow">AEROMIND / ENGINE INTELLIGENCE</span>
      <h2>Explore the engine behind the insights.</h2>
      <p>Inspect a detailed 3D turbofan and investigate simulated sensor evidence in Engine Explorer.</p>
      <button type="button" onClick={onExplore}>Explore Engine <ArrowUpRight size={17}/></button>
      <span className="aero-engine-hero-hint"><Rotate3D size={14}/> Drag to rotate · Scroll to zoom</span>
    </div>
    <div className="aero-engine-hero-model">
      <Suspense fallback={<div className="aero-engine-hero-loading">Loading 3D engine…</div>}>
        <ImportedTurbofanViewer variant="hero" selectedZone="fan" onSelectZone={() => {}} />
      </Suspense>
    </div>
    <span className="aero-engine-hero-disclaimer">Illustrative turbofan · NASA C-MAPSS simulated data</span>
  </section>
}
