import crypto from 'crypto'
import { supabase } from './supabase'

// Integración con Google Calendar por OAuth (sin SDK: token y Calendar API por fetch).
// Cada usuario conecta su propio calendario y recibe todos los eventos como eventos de día completo.

const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events']
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

type Connection = { user_id: string; calendar_id: string; refresh_token: string }

function env() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
  return clientId && clientSecret && redirectUri ? { clientId, clientSecret, redirectUri } : null
}

export function isConfigured() {
  return env() !== null
}

export function frontendUrl() {
  return (process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].trim()
}

// El state viaja por el navegador hasta el callback: lleva el usuario, va firmado y vence a los 10 minutos.
function sign(payload: string) {
  return crypto.createHmac('sha256', env()!.clientSecret).update(payload).digest('base64url')
}

export function authUrl(user: { id: string; email: string | null }) {
  const cfg = env()
  if (!cfg) throw new Error('Google Calendar no está configurado (faltan GOOGLE_CLIENT_ID / SECRET / REDIRECT_URI)')
  const payload = Buffer.from(JSON.stringify({ uid: user.id, email: user.email, exp: Date.now() + 10 * 60_000 })).toString('base64url')
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',            // asegura que Google devuelva refresh_token
    state: `${payload}.${sign(payload)}`,
    ...(user.email ? { login_hint: user.email } : {}),
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export function readState(state: string | undefined): { uid: string; email: string | null } | null {
  if (!state || !isConfigured()) return null
  const [payload, signature] = state.split('.')
  if (!payload || !signature) return null
  const expected = sign(payload)
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return data.exp > Date.now() && data.uid ? { uid: data.uid, email: data.email ?? null } : null
  } catch {
    return null
  }
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  const data = await res.json() as any
  if (!res.ok) throw new Error(`Google token: ${data.error_description || data.error || res.status}`)
  return data as { access_token: string; refresh_token?: string; id_token?: string; expires_in: number }
}

export async function connectWithCode(code: string, user: { uid: string; email: string | null }) {
  const cfg = env()!
  const tokens = await tokenRequest({
    code, client_id: cfg.clientId, client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri, grant_type: 'authorization_code',
  })
  if (!tokens.refresh_token) throw new Error('Google no devolvió refresh_token')

  // El id_token viene directo de Google por HTTPS: alcanza con leer el email del payload.
  let googleEmail: string | null = null
  if (tokens.id_token) {
    try { googleEmail = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString()).email ?? null } catch { /* sin email */ }
  }

  // Si reconecta (u otra cuenta de Google), los eventos anteriores ya no se pueden editar: se arranca de cero
  await supabase.from('google_calendar_connections').delete().eq('user_id', user.uid)
  const { error } = await supabase.from('google_calendar_connections').insert({
    user_id: user.uid, user_email: user.email, google_email: googleEmail, calendar_id: 'primary',
    refresh_token: tokens.refresh_token, connected_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
  tokenCache.set(user.uid, { value: tokens.access_token, expiresAt: Date.now() + (tokens.expires_in - 60) * 1000 })
}

export async function getConnection(userId: string) {
  const { data } = await supabase
    .from('google_calendar_connections')
    .select('user_id, google_email, calendar_id, refresh_token, connected_at')
    .eq('user_id', userId)
    .maybeSingle()
  return data
}

export async function disconnect(userId: string) {
  const conn = await getConnection(userId)
  if (conn) {
    // Revocar es best-effort: aunque falle, la conexión se borra (y sus vínculos, en cascada).
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(conn.refresh_token)}`, { method: 'POST' }).catch(() => {})
  }
  tokenCache.delete(userId)
  await supabase.from('google_calendar_connections').delete().eq('user_id', userId)
}

const tokenCache = new Map<string, { value: string; expiresAt: number }>()

async function accessToken(conn: Connection) {
  const cached = tokenCache.get(conn.user_id)
  if (cached && cached.expiresAt > Date.now()) return cached.value
  const cfg = env()!
  const tokens = await tokenRequest({
    refresh_token: conn.refresh_token, client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: 'refresh_token',
  })
  tokenCache.set(conn.user_id, { value: tokens.access_token, expiresAt: Date.now() + (tokens.expires_in - 60) * 1000 })
  return tokens.access_token
}

async function calendarFetch(conn: Connection, path: string, init: RequestInit = {}) {
  const token = await accessToken(conn)
  return fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(conn.calendar_id)}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

function nextDay(isoDate: string) {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

async function connections(userId?: string): Promise<Connection[]> {
  let query = supabase.from('google_calendar_connections').select('user_id, calendar_id, refresh_token')
  if (userId) query = query.eq('user_id', userId)
  const { data } = await query
  return data ?? []
}

// Crea o actualiza el evento en el calendario de cada usuario conectado (o sólo en el de userId).
// Nunca tira: si Google falla, el evento igual queda guardado y se loguea el error.
export async function syncEvent(eventId: string, userId?: string) {
  if (!isConfigured()) return
  try {
    const conns = await connections(userId)
    if (!conns.length) return

    const [{ data: ev }, { data: links }] = await Promise.all([
      supabase.from('events').select('id, event_date, location, client:clients(name)').eq('id', eventId).single(),
      supabase.from('event_calendar_links').select('user_id, google_event_id').eq('event_id', eventId),
    ])
    if (!ev) return

    const clientName = (ev as any).client?.name ?? 'Sin cliente'
    const body = JSON.stringify({
      summary: `Evento ${clientName}${ev.location ? ` – ${ev.location}` : ''}`,
      location: ev.location ? `ACO Workspace – ${ev.location}` : undefined,
      description: `Ver en Eventos ACO: ${frontendUrl()}/eventos/${ev.id}`,
      start: { date: ev.event_date },
      end: { date: nextDay(ev.event_date) },
    })

    await Promise.all(conns.map(async conn => {
      try {
        const link = links?.find(l => l.user_id === conn.user_id)
        if (link) {
          const res = await calendarFetch(conn, `/events/${encodeURIComponent(link.google_event_id)}`, { method: 'PATCH', body })
          if (res.ok) return
          // Si lo borró a mano en Google, se vuelve a crear
          if (res.status !== 404 && res.status !== 410) throw new Error(`PATCH ${res.status}: ${await res.text()}`)
        }
        const res = await calendarFetch(conn, '/events', { method: 'POST', body })
        if (!res.ok) throw new Error(`POST ${res.status}: ${await res.text()}`)
        const created = await res.json() as { id: string }
        await supabase.from('event_calendar_links').upsert({ event_id: ev.id, user_id: conn.user_id, google_event_id: created.id })
      } catch (err) {
        console.error('[google-calendar] syncEvent', eventId, conn.user_id, err)
      }
    }))
  } catch (err) {
    console.error('[google-calendar] syncEvent', eventId, err)
  }
}

// Leer los vínculos ANTES de borrar el evento (se borran en cascada con él)
export async function calendarLinks(eventId: string) {
  const { data } = await supabase.from('event_calendar_links').select('user_id, google_event_id').eq('event_id', eventId)
  return data ?? []
}

export async function removeEvent(links: { user_id: string; google_event_id: string }[]) {
  if (!links.length || !isConfigured()) return
  const conns = await connections()
  await Promise.all(links.map(async link => {
    const conn = conns.find(c => c.user_id === link.user_id)
    if (!conn) return
    try {
      const res = await calendarFetch(conn, `/events/${encodeURIComponent(link.google_event_id)}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`DELETE ${res.status}: ${await res.text()}`)
    } catch (err) {
      console.error('[google-calendar] removeEvent', link.google_event_id, err)
    }
  }))
}
