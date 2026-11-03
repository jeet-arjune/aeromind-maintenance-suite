import { useEffect, useState, type FormEvent } from 'react'
import {
  ArrowRight, CheckCircle2, ClipboardList, Clock3, LogOut,
  PauseCircle, PlayCircle, RefreshCw, Send, ShieldCheck,
  UserRound, Wrench
} from 'lucide-react'
import './TechnicianPortal.css'

const API = 'http://127.0.0.1:8000'

type Status = 'assigned' | 'in_progress' | 'on_hold' |
  'pending_review' | 'completed' | 'cancelled' | 'open'

type Profile = {
  id: number
  full_name: string
  email: string
  roles: string[]
}

type Order = {
  id: number
  order_number: string
  engine_code: string
  title: string
  description: string | null
  priority: string
  status: Status
  assigned_to_user_id: number | null
  created_at: string
}

type History = {
  events: {
    event_type: string
    occurred_at: string
  }[]
  logs: {
    activity_type: string
    summary: string
    details: string | null
    labor_minutes: number
    performed_at: string
  }[]
}

type Props = {
  token: string
  setToken: (value: string) => void
  onOpenWorkOrders: () => void
}

const label = (value: string) =>
  value.replaceAll('_', ' ')
    .replace(/\b\w/g, character => character.toUpperCase())

async function api<T>(
  token: string,
  path: string,
  method = 'GET',
  body?: unknown
): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const message = typeof data?.detail === 'string'
      ? data.detail
      : `Request failed (${response.status})`
    throw new Error(message)
  }

  return data as T
}

export default function TechnicianPortal({
  token, setToken, onOpenWorkOrders
}: Props) {
  const [me, setMe] = useState<Profile | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [history, setHistory] = useState<History | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [filter, setFilter] = useState('active')
  const [activity, setActivity] = useState('inspection')
  const [summary, setSummary] = useState('')
  const [details, setDetails] = useState('')
  const [minutes, setMinutes] = useState('0')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(Boolean(token))
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function load(access = token) {
    const profile = await api<Profile>(access, '/api/auth/me')
    setMe(profile)

    if (!profile.roles.includes('technician')) {
      setOrders([])
      setSelectedId(null)
      return
    }

    const all = await api<Order[]>(access, '/api/work-orders')
    const assigned = all.filter(
      order => order.assigned_to_user_id === profile.id
    )

    setOrders(assigned)
    setSelectedId(previous =>
      assigned.some(order => order.id === previous)
        ? previous
        : (assigned[0]?.id ?? null)
    )
  }

  useEffect(() => {
    if (!token) {
      setMe(null)
      setOrders([])
      setSelectedId(null)
      setHistory(null)
      setLoading(false)
      return
    }

    setLoading(true)
    void load(token)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    let cancelled = false
    setHistory(null)

    if (!token || selectedId === null || !me?.roles.includes('technician')) {
      return
    }

    void api<History>(
      token, `/api/work-orders/${selectedId}/history`
    ).then(data => {
      if (!cancelled) setHistory(data)
    }).catch(err => {
      if (!cancelled) setError(err.message)
    })

    return () => { cancelled = true }
  }, [token, selectedId, me?.id])

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')

    try {
      const result = await api<{ access_token: string }>(
        '', '/api/auth/login', 'POST',
        { email: email.trim(), password }
      )
      setPassword('')
      setToken(result.access_token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  async function logout() {
    try {
      await api(token, '/api/auth/logout', 'POST')
    } catch {
      // Clear the local session even if the server is unavailable.
    }
    setToken('')
    setError('')
    setSuccess('')
  }

  async function refresh() {
    setError('')
    try {
      await load()
      if (selectedId !== null) {
        const result = await api<History>(
          token, `/api/work-orders/${selectedId}/history`
        )
        setHistory(result)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed')
    }
  }

  async function changeStatus(next: Status) {
    if (selectedId === null) return

    setBusy(true)
    setError('')
    setSuccess('')

    try {
      await api(
        token, `/api/work-orders/${selectedId}`,
        'PATCH', { status: next }
      )
      await refresh()
      setConfirmed(false)
      setSuccess(
        next === 'pending_review'
          ? 'Submitted for supervisor review.'
          : `Work order updated to ${label(next)}.`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  async function saveLog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (selectedId === null) return

    setBusy(true)
    setError('')
    setSuccess('')

    try {
      await api(
        token, `/api/work-orders/${selectedId}/logs`,
        'POST',
        {
          activity_type: activity,
          summary: summary.trim(),
          details: details.trim(),
          labor_minutes: Number(minutes)
        }
      )

      setSummary('')
      setDetails('')
      setMinutes('0')
      await refresh()
      setSuccess('Maintenance report saved successfully.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Report failed')
    } finally {
      setBusy(false)
    }
  }

  const selected = orders.find(order => order.id === selectedId)
  const visible = orders.filter(order => {
    if (filter === 'active') {
      return !['completed', 'cancelled'].includes(order.status)
    }
    if (filter === 'completed') {
      return ['completed', 'cancelled'].includes(order.status)
    }
    return true
  })

  const stats = [
    {
      name: 'Assigned',
      count: orders.filter(o => o.status === 'assigned').length,
      icon: ClipboardList
    },
    {
      name: 'In Progress',
      count: orders.filter(o =>
        ['in_progress', 'on_hold'].includes(o.status)
      ).length,
      icon: Wrench
    },
    {
      name: 'Awaiting Review',
      count: orders.filter(o => o.status === 'pending_review').length,
      icon: Clock3
    },
    {
      name: 'Completed',
      count: orders.filter(o => o.status === 'completed').length,
      icon: CheckCircle2
    }
  ]

  return (
    <div className="tp-page">
      <div className="tp-heading">
        <div>
          <span className="tp-eyebrow">AEROMIND / TECHNICIAN OPERATIONS</span>
          <h2>My Workspace</h2>
          <p>Assigned maintenance tasks, inspection reports, and supervisor review.</p>
        </div>
        {token && (
          <div className="tp-actions">
            <button className="tp-secondary" onClick={() => void refresh()}>
              <RefreshCw size={16} /> Refresh
            </button>
            <button className="tp-secondary" onClick={() => void logout()}>
              <LogOut size={16} /> Sign Out
            </button>
          </div>
        )}
      </div>

      {error && <div className="tp-alert tp-error">{error}</div>}
      {success && <div className="tp-alert tp-success">{success}</div>}

      {!token ? (
        <div className="tp-login">
          <div className="tp-login-icon"><ShieldCheck size={29} /></div>
          <span className="tp-eyebrow">SECURE TECHNICIAN ACCESS</span>
          <h3>Welcome to your workspace</h3>
          <p>Sign in using the technician account created by your administrator.</p>
          <form className="tp-form" onSubmit={login}>
            <label>Email
              <input type="email" required value={email}
                autoComplete="username"
                onChange={event => setEmail(event.target.value)} />
            </label>
            <label>Password
              <input type="password" required value={password}
                autoComplete="current-password"
                onChange={event => setPassword(event.target.value)} />
            </label>
            <button className="tp-primary" disabled={busy}>
              Sign In <ArrowRight size={16} />
            </button>
          </form>
        </div>
      ) : loading ? (
        <div className="tp-empty">Loading your workspace...</div>
      ) : me && !me.roles.includes('technician') ? (
        <div className="tp-login">
          <ShieldCheck size={32} color="#087dc3" />
          <h3>Technician access required</h3>
          <p>
            You are signed in as {me.full_name}.
            Administrators can manage jobs through Work Orders.
            To test this portal, sign out and use a technician account.
          </p>
          <button className="tp-primary" onClick={onOpenWorkOrders}>
            Open Work Orders <ArrowRight size={16} />
          </button>
        </div>
      ) : me ? (
        <>
          <div className="tp-welcome">
            <div className="tp-avatar"><UserRound size={25} /></div>
            <div>
              <span className="tp-eyebrow">SIGNED IN AS TECHNICIAN</span>
              <h3>{me.full_name}</h3>
              <p>{me.email} · Your assigned jobs only</p>
            </div>
            <span className="tp-online">● Workspace Active</span>
          </div>

          <div className="tp-stats">
            {stats.map(({ name, count, icon: Icon }) => (
              <div className="tp-stat" key={name}>
                <div><span>{name}</span><Icon size={19} /></div>
                <strong>{count}</strong>
              </div>
            ))}
          </div>

          <div className="tp-layout">
            <section className="tp-panel">
              <div className="tp-panel-head">
                <h3><ClipboardList size={19} /> My Assignments</h3>
                <p>{orders.length} total assigned jobs</p>
              </div>
              <div className="tp-tabs">
                {[
                  ['active', 'Active'],
                  ['all', 'All'],
                  ['completed', 'History']
                ].map(([value, text]) => (
                  <button key={value}
                    className={filter === value ? 'active' : ''}
                    onClick={() => setFilter(value)}>
                    {text}
                  </button>
                ))}
              </div>

              <div className="tp-task-list">
                {visible.map(order => (
                  <button key={order.id}
                    className={`tp-task ${selectedId === order.id ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedId(order.id)
                      setConfirmed(false)
                      setError('')
                      setSuccess('')
                    }}>
                    <div className="tp-task-top">
                      <small>{order.order_number}</small>
                      <span className={`tp-priority ${order.priority}`}>
                        {label(order.priority)}
                      </span>
                    </div>
                    <strong>{order.title}</strong>
                    <div className="tp-task-bottom">
                      <span>{order.engine_code}</span>
                      <span className="tp-status">{label(order.status)}</span>
                    </div>
                  </button>
                ))}
                {visible.length === 0 && (
                  <div className="tp-empty">
                    No assignments in this view.
                  </div>
                )}
              </div>
            </section>

            <section className="tp-panel tp-details">
              {!selected ? (
                <div className="tp-empty">
                  <ClipboardList size={31} />
                  <p>Select a work order to view its details.</p>
                </div>
              ) : (
                <>
                  <div className="tp-panel-head">
                    <span className="tp-eyebrow">
                      WORK ORDER / {selected.order_number}
                    </span>
                    <h3>{selected.title}</h3>
                    <p>{selected.engine_code} · {label(selected.priority)} Priority</p>
                  </div>

                  <div className="tp-detail-body">
                    <div className="tp-progress">
                      {[
                        'Assigned', 'In Progress', 'Review', 'Completed'
                      ].map((step, index) => {
                        const progress: Record<Status, number> = {
                          open: 0, assigned: 0, in_progress: 1,
                          on_hold: 1, pending_review: 2,
                          completed: 3, cancelled: 0
                        }
                        return (
                          <div key={step}
                            className={index <= progress[selected.status] ? 'done' : ''}>
                            <span>{index + 1}</span>
                            <small>{step}</small>
                          </div>
                        )
                      })}
                    </div>

                    <div className="tp-brief">
                      <h4>Task Briefing</h4>
                      <p>{selected.description || 'No additional instructions.'}</p>
                    </div>

                    <div className="tp-section">
                      <h4>Current Status: {label(selected.status)}</h4>

                      {selected.status === 'assigned' && (
                        <button className="tp-primary" disabled={busy}
                          onClick={() => void changeStatus('in_progress')}>
                          <PlayCircle size={17} /> Start Work
                        </button>
                      )}

                      {selected.status === 'in_progress' && (
                        <button className="tp-secondary" disabled={busy}
                          onClick={() => void changeStatus('on_hold')}>
                          <PauseCircle size={17} /> Put On Hold
                        </button>
                      )}

                      {selected.status === 'on_hold' && (
                        <button className="tp-primary" disabled={busy}
                          onClick={() => void changeStatus('in_progress')}>
                          <PlayCircle size={17} /> Resume Work
                        </button>
                      )}

                      {selected.status === 'pending_review' && (
                        <>
                          <p>Waiting for supervisor verification.</p>
                          <button className="tp-secondary" disabled={busy}
                            onClick={() => void changeStatus('in_progress')}>
                            <Wrench size={17} /> Reopen for Corrections
                          </button>
                        </>
                      )}

                      {selected.status === 'completed' && (
                        <p className="tp-complete">
                          <CheckCircle2 size={17} /> Work order completed.
                        </p>
                      )}
                    </div>

                    {['in_progress', 'on_hold'].includes(selected.status) && (
                      <div className="tp-section">
                        <h4><Wrench size={18} /> Maintenance Report</h4>
                        <p>Record the inspection or repair work you performed.</p>
                        <form className="tp-form" onSubmit={saveLog}>
                          <div className="tp-two-fields">
                            <label>Activity Type
                              <select value={activity}
                                onChange={e => setActivity(e.target.value)}>
                                {[
                                  'inspection', 'repair', 'replacement',
                                  'test', 'other'
                                ].map(item => (
                                  <option key={item} value={item}>
                                    {label(item)}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>Labor Minutes
                              <input type="number" required min="0" max="100000"
                                value={minutes}
                                onChange={e => setMinutes(e.target.value)} />
                            </label>
                          </div>
                          <label>Work Summary
                            <input required minLength={4} maxLength={1000}
                              value={summary}
                              placeholder="Inspected turbine blade assembly"
                              onChange={e => setSummary(e.target.value)} />
                          </label>
                          <label>Findings and Actions
                            <textarea rows={3} maxLength={4000}
                              value={details}
                              placeholder="Describe your inspection findings..."
                              onChange={e => setDetails(e.target.value)} />
                          </label>
                          <button className="tp-primary" disabled={busy}>
                            Save Maintenance Report
                          </button>
                        </form>
                      </div>
                    )}

                    {selected.status === 'in_progress' && (
                      <div className="tp-section tp-review">
                        <h4><Send size={17} /> Submit for Review</h4>
                        <p>
                          Your supervisor will verify the maintenance report
                          before marking the job completed.
                        </p>
                        {!history?.logs.length && (
                          <p className="tp-hint">
                            Save at least one maintenance report first.
                          </p>
                        )}
                        <label className="tp-confirm">
                          <input type="checkbox" checked={confirmed}
                            onChange={e => setConfirmed(e.target.checked)} />
                          <span>I have completed and recorded my work.</span>
                        </label>
                        <button className="tp-primary"
                          disabled={busy || !confirmed || !history?.logs.length}
                          onClick={() => void changeStatus('pending_review')}>
                          <Send size={16} /> Submit to Supervisor
                        </button>
                      </div>
                    )}

                    <div className="tp-section">
                      <h4><Clock3 size={18} /> Maintenance History</h4>
                      {!history && <p>Loading history...</p>}
                      {history?.logs.length === 0 && (
                        <p>No maintenance reports recorded yet.</p>
                      )}
                      {history?.logs.map((log, index) => (
                        <div className="tp-log" key={index}>
                          <strong>{log.summary}</strong>
                          <small>
                            {label(log.activity_type)} · {log.labor_minutes} minutes
                          </small>
                          {log.details && <p>{log.details}</p>}
                          <small>{log.performed_at}</small>
                        </div>
                      ))}
                      {history && history.events.length > 0 && (
                        <details className="tp-events">
                          <summary>View Work Order Activity</summary>
                          {history.events.map((event, index) => (
                            <p key={index}>
                              {label(event.event_type.replaceAll('.', ' '))}
                              <small>{event.occurred_at}</small>
                            </p>
                          ))}
                        </details>
                      )}
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>

          <p className="tp-disclaimer">
            NASA C-MAPSS simulated data · Research prototype ·
            Not an aviation-certified maintenance system.
          </p>
        </>
      ) : (
        <div className="tp-empty">Unable to load account details.</div>
      )}
    </div>
  )
}
