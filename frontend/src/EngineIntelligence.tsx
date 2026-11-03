import { useMemo } from 'react'
import { Activity, AlertTriangle, ShieldCheck } from 'lucide-react'
import {
  Area, AreaChart, CartesianGrid, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts'

export type IntelligenceEngine = {
  engine_id: number
  predicted_rul_cycles: number
  maintenance_priority: string
  anomaly_count: number
  recalibrated_rarity?: number
  anomaly_evidence?: string
}

export type IntelligenceHistory = {
  unit_number: number
  time_cycles: number
  Predicted_RUL: number
  Current_Detectors: number
  Stateful_Replayed_Priority: string
}

type Props = {
  engines: IntelligenceEngine[]
  selectedId: number | null
  onSelect: (id: number) => void
  history: IntelligenceHistory[]
}

const priorityLevel = (priority: string) =>
  priority === 'CRITICAL' ? 2 :
  priority === 'UNDER OBSERVATION' ? 1 : 0

const priorityNames = ['HEALTHY', 'UNDER OBSERVATION', 'CRITICAL']

export default function EngineIntelligence({
  engines, selectedId, onSelect, history
}: Props) {
  const selected = engines.find(e => e.engine_id === selectedId)

  const data = useMemo(() =>
    history
      .filter(row => row.unit_number === selectedId)
      .sort((a, b) => a.time_cycles - b.time_cycles)
      .map(row => ({
        cycle: row.time_cycles,
        rul: row.Predicted_RUL,
        detectors: row.Current_Detectors,
        priorityLevel: priorityLevel(row.Stateful_Replayed_Priority)
      })),
    [history, selectedId]
  )

  return (
    <div className="intelligence-page">
      <div className="intelligence-toolbar">
        <div>
          <span className="intelligence-kicker">ENGINE HEALTH INTELLIGENCE</span>
          <h2>Engine {String(selectedId ?? 0).padStart(3, '0')}</h2>
          <p>Historical frozen-GRU inference · NASA C-MAPSS FD001</p>
        </div>
        <div className="intelligence-controls">
          <select
            value={selectedId ?? ''}
            onChange={event => onSelect(Number(event.target.value))}
            aria-label="Select engine"
          >
            {engines.map(engine => (
              <option key={engine.engine_id} value={engine.engine_id}>
                ENG-{String(engine.engine_id).padStart(3, '0')}
              </option>
            ))}
          </select>
          <span className={`intelligence-status ${
            selected?.maintenance_priority === 'CRITICAL' ? 'critical' :
            selected?.maintenance_priority === 'UNDER OBSERVATION' ? 'observation' : 'healthy'
          }`}>
            {selected?.maintenance_priority ?? 'UNKNOWN'}
          </span>
        </div>
      </div>

      <div className="intelligence-metrics">
        <article>
          <span>Predicted remaining life</span>
          <strong>{selected ? selected.predicted_rul_cycles.toFixed(2) : '—'}</strong>
          <small>Operating cycles · Frozen GRU</small>
        </article>
        <article>
          <span>Active anomaly detectors</span>
          <strong>{selected?.anomaly_count ?? '—'}<em> / 4</em></strong>
          <small>Current detector agreement</small>
        </article>
        <article>
          <span>Calibrated rarity score</span>
          <strong>{selected?.recalibrated_rarity?.toFixed(2) ?? '—'}</strong>
          <small>Stage-conditioned anomaly rarity</small>
        </article>
        <article>
          <span>Evidence classification</span>
          <strong className="evidence-label">
            {selected?.anomaly_evidence?.replaceAll('_', ' ') ?? '—'}
          </strong>
          <small>Frozen priority-evidence rules</small>
        </article>
      </div>

      <div className="intelligence-chart-grid">
        <section className="aero-panel intelligence-chart-card">
          <div className="panel-title">
            <span className="panel-icon"><Activity size={22}/></span>
            <h2>RUL Prediction Trajectory</h2>
          </div>
          <p className="intelligence-subheading">
            Actual exported GRU predictions across observed cycles
          </p>
          <div className="intelligence-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 16, right: 20, bottom: 8, left: 0 }}>
                <defs>
                  <linearGradient id="detailRulFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1765e9" stopOpacity={0.20}/>
                    <stop offset="100%" stopColor="#1765e9" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e8eef6"/>
                <XAxis dataKey="cycle" tick={{ fontSize: 11 }}/>
                <YAxis domain={[0, 130]} tick={{ fontSize: 11 }}/>
                <Tooltip formatter={value => [`${Number(value).toFixed(2)} cycles`, 'Predicted RUL']}/>
                <ReferenceLine y={30} stroke="#ef5960" strokeDasharray="5 5"/>
                <Area type="monotone" dataKey="rul" stroke="#1765e9"
                  strokeWidth={3} fill="url(#detailRulFill)" dot={false}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="intelligence-chart-note">
            Red dashed line = 30-cycle RUL urgency boundary.
          </p>
        </section>

        <section className="aero-panel intelligence-chart-card">
          <div className="panel-title">
            <span className="panel-icon"><AlertTriangle size={22}/></span>
            <h2>Anomaly Agreement</h2>
          </div>
          <p className="intelligence-subheading">
            Number of active detectors at each observed cycle
          </p>
          <div className="intelligence-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 16, right: 20, bottom: 8, left: 0 }}>
                <CartesianGrid stroke="#e8eef6"/>
                <XAxis dataKey="cycle" tick={{ fontSize: 11 }}/>
                <YAxis domain={[0, 4]} ticks={[0, 1, 2, 3, 4]}
                  allowDecimals={false} tick={{ fontSize: 11 }}/>
                <Tooltip formatter={value => [`${value} / 4`, 'Active detectors']}/>
                <Line type="stepAfter" dataKey="detectors" stroke="#f39a1f"
                  strokeWidth={2.5} dot={false}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="intelligence-chart-note">
            Agreement across short-term, long-term, slope, and Isolation Forest detectors.
          </p>
        </section>

        <section className="aero-panel intelligence-chart-card intelligence-wide">
          <div className="panel-title">
            <span className="panel-icon"><ShieldCheck size={22}/></span>
            <h2>Priority History</h2>
          </div>
          <p className="intelligence-subheading">
            Reconstructed stateful investigation priority across engine cycles
          </p>
          <div className="intelligence-chart intelligence-chart-short">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 16, right: 25, bottom: 5, left: 10 }}>
                <CartesianGrid stroke="#e8eef6"/>
                <XAxis dataKey="cycle" tick={{ fontSize: 11 }}/>
                <YAxis domain={[0, 2]} ticks={[0, 1, 2]} width={125}
                  tickFormatter={value => priorityNames[value] ?? ''}
                  tick={{ fontSize: 11 }}/>
                <Tooltip formatter={value => [
                  priorityNames[Number(value)] ?? 'UNKNOWN',
                  'Investigation priority'
                ]}/>
                <Line type="stepAfter" dataKey="priorityLevel" stroke="#1264de"
                  strokeWidth={2.7} dot={false}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="intelligence-chart-note">
            Priority is an investigation recommendation, not a confirmed physical engine fault.
            {data.length > 0 ? ` Latest recorded cycle: ${data[data.length - 1].cycle}.` : ''}
          </p>
        </section>
      </div>
    </div>
  )
}
