import { useEffect, useState, type FormEvent } from 'react'
import {
  ClipboardList, Plus, RefreshCw, LogOut, ShieldCheck,
  Wrench, CheckCircle2, AlertTriangle, X, History
} from 'lucide-react'
import './WorkOrders.css'

const API = (
  import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
).replace(/\/$/, '')

type Status = 'open' | 'assigned' | 'in_progress' |
  'on_hold' | 'pending_review' | 'completed' | 'cancelled'
type Priority = 'low' | 'medium' | 'high' | 'critical'
type Activity = 'inspection' | 'repair' | 'replacement' | 'test' | 'other'

type Engine = {
  engine_id: number
  maintenance_priority: string
  predicted_rul_cycles: number
}
type User = { id: number; full_name: string; roles: string[] }
type Technician = {
  id: number
  full_name: string
  employee_code: string
  specialization: string
  availability: string
  is_active: boolean
}
type Order = {
  id: number
  order_number: string
  engine_code: string
  title: string
  description: string
  priority: Priority
  status: Status
  assigned_to_user_id: number | null
  technician_name: string | null
  created_at: string
  updated_at: string
}
type OrderHistory = {
  events: { event_type: string; occurred_at: string; note: string | null }[]
  logs: {
    activity_type: string
    summary: string
    details: string
    labor_minutes: number
    performed_at: string
  }[]
}
type Props = {
  token: string
  setToken: (value: string) => void
  engines: Engine[]
}

const transitions: Record<Status, Status[]> = {
  open: ['assigned', 'cancelled'],
  assigned: ['open', 'in_progress', 'cancelled'],
  in_progress: ['on_hold', 'pending_review', 'cancelled'],
  on_hold: ['in_progress', 'cancelled'],
  pending_review: ['in_progress', 'completed', 'cancelled'],
  completed: [],
  cancelled: []
}

const label = (value: string) =>
  value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())

const dateLabel = (value: string) => {
  if (!value) return '—'
  const date = new Date(value.replace(' ', 'T') + (value.includes('Z') ? '' : 'Z'))
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export default function WorkOrders({ token, setToken, engines }: Props) {
  const [me, setMe] = useState<User | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [filter, setFilter] = useState('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [engineId, setEngineId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<Priority>('high')
  const [assignee, setAssignee] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [history, setHistory] = useState<OrderHistory | null>(null)
  const [activity, setActivity] = useState<Activity>('inspection')
  const [summary, setSummary] = useState('')
  const [details, setDetails] = useState('')
  const [minutes, setMinutes] = useState('0')

  async function request<T>(
    path: string, method = 'GET', body?: unknown, access = token
  ): Promise<T> {
    const headers: Record<string, string> = {}
    if (access) headers.Authorization = `Bearer ${access}`
    if (body !== undefined) headers['Content-Type'] = 'application/json'

    const response = await fetch(`${API}${path}`, {
      method, headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      let reason = `Request failed (${response.status})`
      if (typeof data?.detail === 'string') reason = data.detail
      if (Array.isArray(data?.detail)) {
        reason = data.detail.map((item: { msg?: string }) => item.msg).join('; ')
      }
      throw new Error(reason)
    }
    return data as T
  }

  async function load(access = token) {
    const profile = await request<User>('/api/auth/me', 'GET', undefined, access)
    const manager = profile.roles.some(role => ['admin', 'supervisor'].includes(role))
    const [items, staff] = await Promise.all([
      request<Order[]>('/api/work-orders', 'GET', undefined, access),
      manager
        ? request<Technician[]>('/api/technicians', 'GET', undefined, access)
        : Promise.resolve([])
    ])
    setMe(profile)
    setOrders(items)
    setTechnicians(staff)
  }

  async function loadHistory(id: number) {
    setHistory(await request<OrderHistory>(`/api/work-orders/${id}/history`))
  }

  useEffect(() => {
    if (!token) {
      setMe(null)
      setOrders([])
      setTechnicians([])
      setSelectedId(null)
      setHistory(null)
      return
    }
    void load(token).catch(err => setError(err.message))
  }, [token])

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await request<{ access_token: string }>(
        '/api/auth/login', 'POST', { email: email.trim(), password }, ''
      )
      setPassword('')
      setToken(result.access_token)
      setSuccess('Signed in successfully.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  async function logout() {
    try { await request('/api/auth/logout', 'POST') } catch { /* clear locally */ }
    setToken('')
    setSuccess('')
    setError('')
  }

  async function refresh() {
    setError('')
    try {
      await load()
      if (selectedId !== null) await loadHistory(selectedId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed')
    }
  }

  function openCreate() {
    const first = [...engines].sort((a, b) => {
      const rank = (e: Engine) =>
        e.maintenance_priority === 'CRITICAL' ? 0 :
        e.maintenance_priority === 'UNDER OBSERVATION' ? 1 : 2
      return rank(a) - rank(b)
    })[0]
    setEngineId(first ? String(first.engine_id) : '')
    setTitle('')
    setDescription('')
    setPriority('high')
    setAssignee('')
    setError('')
    setCreateOpen(true)
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      const result = await request<Order>('/api/work-orders', 'POST', {
        engine_id: Number(engineId),
        title: title.trim(),
        description: description.trim(),
        priority,
        assigned_to_user_id: assignee ? Number(assignee) : null
      })
      setCreateOpen(false)
      await load()
      setSelectedId(result.id)
      await loadHistory(result.id)
      setSuccess(`${result.order_number} created successfully.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Creation failed')
    } finally {
      setBusy(false)
    }
  }

  async function updateOrder(id: number, changes: unknown) {
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await request(`/api/work-orders/${id}`, 'PATCH', changes)
      await load()
      await loadHistory(id)
      setSuccess('Work order updated.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  async function addLog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (selectedId === null) return
    setBusy(true)
    setError('')
    try {
      await request(`/api/work-orders/${selectedId}/logs`, 'POST', {
        activity_type: activity,
        summary: summary.trim(),
        details: details.trim(),
        labor_minutes: Number(minutes)
      })
      setSummary('')
      setDetails('')
      setMinutes('0')
      await loadHistory(selectedId)
      setSuccess('Maintenance log saved permanently.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Log failed')
    } finally {
      setBusy(false)
    }
  }

  async function selectOrder(order: Order) {
    setSelectedId(order.id)
    setAssignee(order.assigned_to_user_id === null
      ? '' : String(order.assigned_to_user_id))
    setHistory(null)
    setError('')
    try {
      await loadHistory(order.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'History unavailable')
    }
  }

  const manager = Boolean(me?.roles.some(role =>
    role === 'admin' || role === 'supervisor'
  ))
  const available = technicians.filter(person =>
    person.is_active && person.availability === 'available'
  )
  const selected = orders.find(order => order.id === selectedId) ?? null
  const canLog = selected !== null &&
    ['assigned', 'in_progress', 'on_hold'].includes(selected.status) &&
    (manager || selected.assigned_to_user_id === me?.id)

  const filtered = orders.filter(order =>
    filter === 'all' || order.status === filter
  )
  const active = orders.filter(order =>
    !['completed', 'cancelled'].includes(order.status)
  ).length
  const critical = orders.filter(order =>
    order.priority === 'critical' && !['completed', 'cancelled'].includes(order.status)
  ).length
  const completed = orders.filter(order => order.status === 'completed').length

  return (
    <div className="wo-page">
      <div className="wo-heading">
        <div>
          <div className="wo-kicker">AEROMIND / MAINTENANCE OPERATIONS</div>
          <h2>Maintenance Work Orders</h2>
          <p>From predictive alerts to technician action. Simulated fleet workflow.</p>
        </div>
        {token && (
          <div className="wo-actions">
            <button className="wo-secondary" onClick={() => void refresh()}>
              <RefreshCw size={16} /> Refresh
            </button>
            <button className="wo-secondary" onClick={() => void logout()}>
              <LogOut size={16} /> Sign Out
            </button>
          </div>
        )}
      </div>

      {error && <div className="wo-alert wo-error">{error}</div>}
      {success && <div className="wo-alert wo-success">{success}</div>}

      {!token ? (
        <div className="wo-login">
          <div className="wo-login-icon"><ShieldCheck size={27} /></div>
          <h3>Maintenance Operations Login</h3>
          <p>Use your AeroMind admin, supervisor, or technician account.</p>
          <form className="wo-form" onSubmit={login}>
            <label>Email
              <input type="email" value={email} required
                autoComplete="username"
                onChange={e => setEmail(e.target.value)} />
            </label>
            <label>Password
              <input type="password" value={password} required
                autoComplete="current-password"
                onChange={e => setPassword(e.target.value)} />
            </label>
            <button className="wo-primary" disabled={busy}>
              {busy ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      ) : (
        <>
          <div className="wo-stats">
            {[
              { name: 'Total Orders', value: orders.length },
              { name: 'Active Work', value: active },
              { name: 'Critical Priority', value: critical },
              { name: 'Completed', value: completed }
            ].map(stat => (
              <div className="wo-stat" key={stat.name}>
                <span>{stat.name}</span>
                <strong>{stat.value}</strong>
              </div>
            ))}
          </div>

          <div className="wo-panel">
            <div className="wo-toolbar">
              <div>
                <h3><ClipboardList size={21} /> Work Order Register</h3>
                <p>{manager ? 'Fleet maintenance tasks' : 'Your assigned maintenance tasks'}</p>
              </div>
              {manager && (
                <button className="wo-primary" onClick={openCreate}>
                  <Plus size={17} /> Create Work Order
                </button>
              )}
            </div>

            <div className="wo-filters">
              {['all', 'open', 'assigned', 'in_progress', 'on_hold',
                'pending_review', 'completed'].map(item => (
                <button key={item}
                  className={filter === item ? 'selected' : ''}
                  onClick={() => setFilter(item)}>
                  {label(item)}
                </button>
              ))}
            </div>

            <div className="wo-table-wrap">
              <table className="wo-table">
                <thead>
                  <tr>
                    <th>WORK ORDER</th>
                    <th>ENGINE</th>
                    <th>PRIORITY</th>
                    <th>TECHNICIAN</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(order => (
                    <tr key={order.id}
                      className={selectedId === order.id ? 'selected' : ''}
                      onClick={() => void selectOrder(order)}>
                      <td>
                        <strong>{order.title}</strong>
                        <small>{order.order_number}</small>
                      </td>
                      <td>{order.engine_code}</td>
                      <td><span className={`wo-pill priority-${order.priority}`}>
                        {label(order.priority)}
                      </span></td>
                      <td>{order.technician_name ?? 'Unassigned'}</td>
                      <td><span className={`wo-pill status-${order.status}`}>
                        {label(order.status)}
                      </span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="wo-empty">
                  {orders.length === 0
                    ? 'No work orders yet. Create your first maintenance task.'
                    : 'No work orders match this status.'}
                </div>
              )}
            </div>
          </div>

          {selected && (
            <div className="wo-panel wo-detail">
              <div className="wo-toolbar">
                <div>
                  <div className="wo-kicker">{selected.order_number} · {selected.engine_code}</div>
                  <h3>{selected.title}</h3>
                  <p>Created {dateLabel(selected.created_at)}</p>
                </div>
                <button className="wo-icon" title="Close details"
                  onClick={() => { setSelectedId(null); setHistory(null) }}>
                  <X size={20} />
                </button>
              </div>

              <div className="wo-detail-grid">
                <div className="wo-detail-main">
                  <p className="wo-description">
                    {selected.description || 'No additional description.'}
                  </p>
                  <div className="wo-detail-meta">
                    <span>Priority <b>{label(selected.priority)}</b></span>
                    <span>Status <b>{label(selected.status)}</b></span>
                    <span>Assigned to <b>{selected.technician_name || 'Nobody yet'}</b></span>
                  </div>

                  {manager && !['completed', 'cancelled'].includes(selected.status) && (
                    <div className="wo-section">
                      <h4>Technician Assignment</h4>
                      <div className="wo-inline">
                        <select value={assignee}
                          onChange={e => setAssignee(e.target.value)}>
                          <option value="">Choose available technician</option>
                          {available.map(person => (
                            <option key={person.id} value={person.id}>
                              {person.full_name} · {person.employee_code}
                            </option>
                          ))}
                        </select>
                        <button className="wo-primary"
                          disabled={busy || !assignee}
                          onClick={() => void updateOrder(selected.id, {
                            assigned_to_user_id: Number(assignee),
                            ...(selected.status === 'open'
                              ? { status: 'assigned' } : {})
                          })}>
                          Assign
                        </button>
                      </div>
                    </div>
                  )}

                  {transitions[selected.status].filter(next =>
                    next !== 'assigned' &&
                    (manager || ['in_progress', 'on_hold',
                      'pending_review'].includes(next))
                  ).length > 0 && (
                    <div className="wo-section">
                      <h4>Update Progress</h4>
                      <div className="wo-actions">
                        {transitions[selected.status]
                          .filter(next =>
                            next !== 'assigned' &&
                            (manager || ['in_progress', 'on_hold',
                              'pending_review'].includes(next))
                          )
                          .map(next => (
                            <button key={next} className="wo-secondary"
                              disabled={busy}
                              onClick={() => void updateOrder(selected.id,
                                next === 'open'
                                  ? { status: 'open', assigned_to_user_id: null }
                                  : { status: next }
                              )}>
                              {next === 'completed'
                                ? <CheckCircle2 size={16} />
                                : <Wrench size={16} />}
                              {label(next)}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}

                  {canLog && (
                    <div className="wo-section">
                      <h4><Wrench size={17} /> Add Maintenance Log</h4>
                      <form className="wo-form" onSubmit={addLog}>
                        <div className="wo-form-grid">
                          <label>Activity
                            <select value={activity}
                              onChange={e => setActivity(e.target.value as Activity)}>
                              {['inspection', 'repair', 'replacement', 'test',
                                'other'].map(item => (
                                <option key={item} value={item}>{label(item)}</option>
                              ))}
                            </select>
                          </label>
                          <label>Labor Minutes
                            <input type="number" min="0" max="100000"
                              value={minutes}
                              onChange={e => setMinutes(e.target.value)} />
                          </label>
                        </div>
                        <label>Summary
                          <input required minLength={4} maxLength={1000}
                            value={summary}
                            placeholder="Inspected compressor blade assembly"
                            onChange={e => setSummary(e.target.value)} />
                        </label>
                        <label>Details
                          <textarea rows={3} maxLength={4000}
                            value={details}
                            placeholder="Inspection observations and actions taken..."
                            onChange={e => setDetails(e.target.value)} />
                        </label>
                        <button className="wo-primary" disabled={busy}>
                          Save Maintenance Log
                        </button>
                      </form>
                    </div>
                  )}
                </div>

                <div className="wo-history">
                  <h4><History size={17} /> Maintenance History</h4>
                  {!history && <p>Loading history...</p>}
                  {history?.logs.length === 0 && (
                    <p>No maintenance logs recorded yet.</p>
                  )}
                  {history?.logs.map((log, index) => (
                    <div className="wo-history-item" key={`log-${index}`}>
                      <strong>{log.summary}</strong>
                      <span>{label(log.activity_type)} · {log.labor_minutes} min</span>
                      {log.details && <p>{log.details}</p>}
                      <small>{dateLabel(log.performed_at)}</small>
                    </div>
                  ))}
                  <h4 className="wo-event-title">Activity Timeline</h4>
                  {history?.events.map((event, index) => (
                    <div className="wo-history-item" key={`event-${index}`}>
                      <strong>{label(event.event_type.replaceAll('.', ' '))}</strong>
                      <small>{dateLabel(event.occurred_at)}</small>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <p className="wo-disclaimer">
            <AlertTriangle size={15} />
            Demonstration using simulated NASA C-MAPSS engine data.
            Not an approved aviation maintenance record system.
          </p>
        </>
      )}

      {createOpen && (
        <div className="wo-overlay">
          <div className="wo-modal" role="dialog" aria-modal="true"
            aria-label="Create maintenance work order">
            <div className="wo-modal-heading">
              <div>
                <div className="wo-kicker">NEW MAINTENANCE TASK</div>
                <h3>Create Work Order</h3>
              </div>
              <button className="wo-icon" title="Close"
                onClick={() => setCreateOpen(false)}><X size={20} /></button>
            </div>
            <form className="wo-form" onSubmit={create}>
              <div className="wo-form-grid">
                <label>Engine
                  <select required value={engineId}
                    onChange={e => setEngineId(e.target.value)}>
                    <option value="">Select engine</option>
                    {[...engines].sort((a, b) => a.engine_id - b.engine_id)
                      .map(engine => (
                        <option key={engine.engine_id} value={engine.engine_id}>
                          AC-{String(engine.engine_id).padStart(3, '0')}
                          {' · '}{label(engine.maintenance_priority)}
                          {' · RUL '}{Math.round(engine.predicted_rul_cycles)}
                        </option>
                      ))}
                  </select>
                </label>
                <label>Priority
                  <select value={priority}
                    onChange={e => setPriority(e.target.value as Priority)}>
                    {['low', 'medium', 'high', 'critical'].map(item => (
                      <option key={item} value={item}>{label(item)}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>Task Title
                <input required minLength={4} maxLength={160}
                  value={title}
                  placeholder="Inspect turbine temperature anomalies"
                  onChange={e => setTitle(e.target.value)} />
              </label>
              <label>Description
                <textarea rows={4} maxLength={2000}
                  value={description}
                  placeholder="Describe the inspection or repair task..."
                  onChange={e => setDescription(e.target.value)} />
              </label>
              <label>Assign Technician (optional)
                <select value={assignee}
                  onChange={e => setAssignee(e.target.value)}>
                  <option value="">Leave unassigned for now</option>
                  {available.map(person => (
                    <option key={person.id} value={person.id}>
                      {person.full_name} · {person.specialization}
                    </option>
                  ))}
                </select>
              </label>
              {error && <div className="wo-alert wo-error">{error}</div>}
              <div className="wo-actions wo-modal-actions">
                <button type="button" className="wo-secondary"
                  onClick={() => setCreateOpen(false)}>Cancel</button>
                <button className="wo-primary" disabled={busy || !engineId}>
                  {busy ? 'Creating...' : 'Create Work Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
