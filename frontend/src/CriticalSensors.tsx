import { useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertTriangle, CheckCircle2, ChevronRight,
  ClipboardCheck, Gauge, ShieldCheck
} from 'lucide-react'

type DetectorEvidence = {
  active: boolean
  z_score: number
  threshold: number
  exceedance_ratio: number
}

type SensorRecord = {
  sensor: string
  score: number
  current_agreement: number
  persistence_10: number
  recency_5: number
  severity_ratio: number
  verification: string
  inspection_priority: string
  detectors: Record<string, DetectorEvidence>
}

type EngineRecord = {
  engine_id: number
  current_cycle: number
  predicted_rul: number
  engine_priority: string
  engine_detector_agreement: number
  monitored_sensor_count: number
  sensors: SensorRecord[]
}

type ExportData = {
  system: string
  dataset: string
  method: string
  disclaimer: string
  engines: EngineRecord[]
}

const detectorNames: Record<string, string> = {
  short: 'Short-term deviation',
  long: 'Long-term deviation',
  slope: 'Trend / slope deviation'
}

const verificationNames: Record<string, string> = {
  MULTI_DETECTOR: 'Multiple detectors agree',
  PERSISTENT_SINGLE_DETECTOR: 'Persistent single-detector evidence',
  SINGLE_DETECTOR: 'Single-detector evidence',
  RECENT_HISTORY_ONLY: 'Recent historical evidence',
  NO_DETECTED_ANOMALY: 'No detected anomaly'
}

const engineLabel = (id: number) =>
  `AC-${String(id).padStart(3, '0')}`

export default function CriticalSensors() {
  const [data, setData] = useState<ExportData | null>(null)
  const [engineId, setEngineId] = useState<number | null>(0)
  const [expandedSensor, setExpandedSensor] = useState<string | null>(null)
  const [filter, setFilter] = useState<'ALL' | 'P1' | 'P2' | 'P3'>('ALL')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/data/critical_sensor_priorities.json')
      .then(response => {
        if (!response.ok) throw new Error('Sensor export not found')
        return response.json() as Promise<ExportData>
      })
      .then(result => {
        setData(result)
        setEngineId(0)
      })
      .catch(err => setError(String(err)))
  }, [])

  const engine = data?.engines.find(item => item.engine_id === engineId) ?? data?.engines[0]
  const allEngines = engineId === 0

  const allSensors = useMemo(() => {
    const source = engineId === 0
      ? (data?.engines ?? [])
      : (data?.engines.filter(item => item.engine_id === engineId) ?? [])

    return source.flatMap(item =>
      item.sensors.map(sensor => ({
        ...sensor,
        engine_id: item.engine_id,
        engine_rul: item.predicted_rul
      }))
    ).sort((a, b) =>
      a.inspection_priority.localeCompare(b.inspection_priority) ||
      b.score - a.score ||
      a.engine_rul - b.engine_rul
    )
  }, [data, engineId])

  const sensors = useMemo(
    () => allSensors.filter(item =>
      filter === 'ALL' || item.inspection_priority === filter
    ),
    [allSensors, filter]
  )

  const counts = {
    P1: allSensors.filter(s => s.inspection_priority === 'P1').length,
    P2: allSensors.filter(s => s.inspection_priority === 'P2').length,
    P3: allSensors.filter(s => s.inspection_priority === 'P3').length
  }

  if (error) {
    return <div className="sensor-error">Unable to load sensor evidence: {error}</div>
  }

  if (!data || !engine) {
    return <div className="sensor-loading">Loading hybrid sensor analysis...</div>
  }

  return (
    <div className="sensor-page">
      <header className="sensor-page-header">
        <div>
          <span className="sensor-eyebrow">AEROGUARD / ENGINE DIAGNOSTICS</span>
          <h2>Critical Sensor Intelligence</h2>
          <p>Hybrid anomaly verification and technician inspection prioritization</p>
        </div>
        <div className="sensor-engine-picker">
          <label htmlFor="critical-engine">CRITICAL ENGINE</label>
          <select
            id="critical-engine"
            value={engineId ?? ''}
            onChange={event => {
              setEngineId(Number(event.target.value))
              setExpandedSensor(null)
              setFilter('ALL')
            }}
          >
            <option value={0}>All Critical Engines</option>
            {data.engines.map(item => (
              <option key={item.engine_id} value={item.engine_id}>
                {engineLabel(item.engine_id)}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="sensor-kpi-grid">
        <article className="sensor-kpi">
          <div className="sensor-kpi-label"><Gauge size={17}/> GRU PREDICTED RUL</div>
          <strong>{(allEngines ? Math.min(...data.engines.map(e => e.predicted_rul)) : engine.predicted_rul).toFixed(1)} <small>cycles</small></strong>
          <span>Engine-level remaining useful life</span>
        </article>
        <article className="sensor-kpi">
          <div className="sensor-kpi-label"><AlertTriangle size={17}/> P1 INSPECTIONS</div>
          <strong>{counts.P1}</strong>
          <span>Highest-ranked sensor signals</span>
        </article>
        <article className="sensor-kpi">
          <div className="sensor-kpi-label"><Activity size={17}/> FLAGGED SIGNALS</div>
          <strong>{allSensors.length} <small>{allEngines ? 'signals' : `/ ${engine.monitored_sensor_count}`}</small></strong>
          <span>Current or recent anomaly evidence</span>
        </article>
        <article className="sensor-kpi">
          <div className="sensor-kpi-label"><ShieldCheck size={17}/> ENGINE DETECTORS</div>
          <strong>{allEngines ? data.engines.length : engine.engine_detector_agreement} <small>{allEngines ? 'critical engines' : '/ 4'}</small></strong>
          <span>Engine-level hybrid agreement</span>
        </article>
      </div>

      <section className="sensor-workspace">
        <div className="sensor-workspace-heading">
          <div>
            <span className="sensor-eyebrow">TECHNICIAN INVESTIGATION QUEUE</span>
            <h3>Sensor Inspection Priority</h3>
            <p>
              {allEngines
                ? `${data.engines.length} critical engines · ${allSensors.length} flagged sensor signals`
                : `${engineLabel(engine.engine_id)} · Cycle ${engine.current_cycle} · ${allSensors.length} flagged sensor signals`}
            </p>
          </div>
          <div className="sensor-filter-group" aria-label="Filter inspection priority">
            {(['ALL', 'P1', 'P2', 'P3'] as const).map(value => (
              <button
                key={value}
                className={filter === value ? 'active' : ''}
                onClick={() => setFilter(value)}
              >
                {value === 'ALL' ? 'All sensors' : `${value} (${counts[value]})`}
              </button>
            ))}
          </div>
        </div>

        <div className="sensor-column-head">
          <span>SENSOR / INSPECTION ORDER</span>
          <span>VERIFICATION</span>
          <span>EVIDENCE SCORE</span>
          <span>DETAILS</span>
        </div>

        <div className="sensor-stack">
          {sensors.map((sensor, index) => {
            const expanded = expandedSensor === `${sensor.engine_id}-${sensor.sensor}`
            return (
              <article
                key={`${sensor.engine_id}-${sensor.sensor}`}
                className={`sensor-row sensor-${sensor.inspection_priority.toLowerCase()}`}
              >
                <button
                  className="sensor-row-main"
                  onClick={() => setExpandedSensor(expanded ? null : `${sensor.engine_id}-${sensor.sensor}`)}
                  aria-expanded={expanded}
                >
                  <div className="sensor-identity">
                    <span className="sensor-rank">
                      {filter === 'ALL'
                        ? String(index + 1).padStart(2, '0')
                        : '—'}
                    </span>
                    <div>
                      <strong className="sensor-full-id">
                        <span className="sensor-engine-id">{engineLabel(sensor.engine_id)}</span>
                        <span className="sensor-id-divider">/</span>
                        <span>{sensor.sensor}</span>
                      </strong>
                      <small>
                        {sensor.current_agreement} active detector(s) ·
                        {' '}{sensor.persistence_10}/10 recent cycles flagged
                      </small>
                    </div>
                    <span className={`sensor-priority-pill ${sensor.inspection_priority.toLowerCase()}`}>
                      {sensor.inspection_priority}
                    </span>
                  </div>

                  <div className="sensor-verification">
                    {sensor.verification === 'MULTI_DETECTOR'
                      ? <CheckCircle2 size={16}/>
                      : <ClipboardCheck size={16}/>}
                    <span>{verificationNames[sensor.verification] ?? sensor.verification}</span>
                  </div>

                  <div className="sensor-score">
                    <strong>{sensor.score.toFixed(1)}</strong>
                    <div className="sensor-score-track">
                      <div style={{ width: `${Math.min(sensor.score, 100)}%` }}/>
                    </div>
                  </div>

                  <ChevronRight
                    className={`sensor-expand-icon ${expanded ? 'expanded' : ''}`}
                    size={18}
                  />
                </button>

                {expanded && (
                  <div className="sensor-evidence-panel">
                    <div className="sensor-evidence-intro">
                      <strong>Hybrid verification evidence</strong>
                      <span>
                        Persistence: {sensor.persistence_10}/10 cycles ·
                        Recency: {sensor.recency_5}/5 cycles ·
                        Max threshold ratio: {sensor.severity_ratio.toFixed(2)}×
                      </span>
                    </div>
                    <div className="sensor-detector-grid">
                      {Object.entries(sensor.detectors).map(([name, result]) => (
                        <div key={name} className="sensor-detector">
                          <span>{detectorNames[name] ?? name}</span>
                          <strong className={result.active ? 'triggered' : 'normal'}>
                            {result.active ? 'TRIGGERED' : 'NOT TRIGGERED'}
                          </strong>
                          <small>
                            Z-score {result.z_score.toFixed(2)} /
                            threshold {result.threshold.toFixed(2)}
                          </small>
                        </div>
                      ))}
                    </div>
                    <p>
                      <strong>Technician action:</strong> Review the sensor trend,
                      compare related engine measurements, and investigate
                      the underlying subsystem before replacing any hardware.
                    </p>
                  </div>
                )}
              </article>
            )
          })}

          {sensors.length === 0 && (
            <p className="sensor-empty">No sensors match this priority filter.</p>
          )}
        </div>
      </section>

      <footer className="sensor-disclaimer">
        <ShieldCheck size={17}/>
        <span>
          {data.disclaimer} Rankings are heuristic evidence scores,
          not calibrated failure probabilities. Isolation Forest corroborates
          engine-level anomalies, not individual sensor faults.
        </span>
      </footer>
    </div>
  )
}
