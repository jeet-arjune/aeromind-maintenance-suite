type Props = {
  rul: number
  engineId: number
  priority: string
}

export default function RULGauge({ rul, engineId, priority }: Props) {
  const valid = Number.isFinite(rul)
  const value = valid ? Math.max(0, rul) : 0

  // Display reference only, not a model confidence or safety threshold.
  const scale = 150
  const fraction = Math.min(value / scale, 1)
  const arcLength = Math.PI * 126

  const color =
    priority === 'CRITICAL' ? '#B84249' :
    priority === 'UNDER OBSERVATION' ? '#B17A29' :
    '#247B70'

  return (
    <section className="rul-gauge-panel">
      <div className="rul-gauge-heading">
        <div>
          <span className="rul-gauge-eyebrow">PREDICTIVE ENGINE INTELLIGENCE</span>
          <h2>Remaining Useful Life</h2>
          
        </div>
        <span className="rul-gauge-priority" style={{ color }}>
          {priority}
        </span>
      </div>

      {/* AEROMIND_STEP_163_ENGINE_INFORMATION */}
      <div className="rul-gauge-content">
      <div className="rul-gauge-visual">
        <svg viewBox="0 0 340 210" role="img"
          aria-label={`Predicted remaining useful life: ${valid ? value.toFixed(1) : 'unavailable'} cycles`}>
          <path
            d="M 44 164 A 126 126 0 0 1 296 164"
            fill="none"
            stroke="#E3E8EE"
            strokeWidth="19"
            strokeLinecap="round"
          />
          <path
            d="M 44 164 A 126 126 0 0 1 296 164"
            fill="none"
            stroke={color}
            strokeWidth="19"
            strokeLinecap="round"
            strokeDasharray={`${fraction * arcLength} ${arcLength}`}
          />
          <text x="170" y="112" textAnchor="middle"
            fill="#142238" fontSize="55" fontWeight="800">
            {valid ? value.toFixed(1) : '—'}
          </text>
          <text x="170" y="140" textAnchor="middle"
            fill="#64748B" fontSize="14" fontWeight="700"
            letterSpacing="1">
            CYCLES REMAINING
          </text>
          <text x="44" y="194" textAnchor="middle"
            fill="#64748B" fontSize="12">0</text>
          <text x="296" y="194" textAnchor="middle"
            fill="#64748B" fontSize="12">{scale}</text>
        </svg>
      </div>

      <aside className="rul-engine-information">
        <h3>ENGINE INFORMATION</h3>
        <div className="rul-engine-info-row">
          <span>Engine ID</span>
          <strong>AC-{String(engineId).padStart(3, '0')}</strong>
        </div>
        <div className="rul-engine-info-row">
          <span>Health Status</span>
          <strong style={{ color }}>
            {priority === 'CRITICAL' ? 'Critical' :
             priority === 'UNDER OBSERVATION' ? 'At Risk' :
             priority === 'HEALTHY' ? 'Healthy' : priority}
          </strong>
        </div>
        <div className="rul-engine-info-row">
          <span>Predicted RUL</span>
          <strong>{valid ? value.toFixed(1) + ' cycles' : 'Unavailable'}</strong>
        </div>
        <div className="rul-engine-info-row">
          <span>Prediction Model</span>
          <strong>GRU</strong>
        </div>
      </aside>
      </div>

      <div className="rul-gauge-footer">
        <span>MODEL OUTPUT · FROZEN GRU</span>
        <span>Display scale: 0–150 cycles</span>
      </div>
    </section>
  )
}
