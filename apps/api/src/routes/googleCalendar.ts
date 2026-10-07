import { Router } from 'express'
import { supabase } from '../lib/supabase'
import { authUrl, connectWithCode, disconnect, frontendUrl, getConnection, isConfigured, readState, syncEvent } from '../lib/googleCalendar'

// Rutas protegidas (/api/google-calendar): todo es sobre el calendario del usuario logueado
const router = Router()

router.get('/status', async (_req, res) => {
  const conn = await getConnection(res.locals.user.id)
  res.json({
    configured: isConfigured(),
    connected: !!conn,
    google_email: conn?.google_email ?? null,
    connected_at: conn?.connected_at ?? null,
  })
})

router.get('/auth-url', (_req, res) => {
  try {
    res.json({ url: authUrl(res.locals.user) })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

router.post('/disconnect', async (_req, res) => {
  await disconnect(res.locals.user.id)
  res.status(204).send()
})

// Sube a su calendario los eventos de hoy en adelante (los creados antes de conectar)
router.post('/sync', async (_req, res) => {
  const userId = res.locals.user.id
  if (!(await getConnection(userId))) return res.status(400).json({ error: 'Tu Google Calendar no está conectado' })
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase.from('events').select('id').gte('event_date', today)
  if (error) return res.status(500).json({ error: error.message })
  for (const ev of data ?? []) await syncEvent(ev.id, userId)
  res.json({ synced: (data ?? []).length })
})

export default router

// Callback de Google: lo abre el navegador, así que va fuera de /api (sin token de sesión);
// el usuario viaja en el state firmado.
export const callbackRouter = Router()

callbackRouter.get('/google/callback', async (req, res) => {
  const back = (status: string) => res.redirect(`${frontendUrl()}/eventos?gcal=${status}`)
  const { code, state, error } = req.query as Record<string, string | undefined>
  if (error) return back('cancelado')
  const user = readState(state)
  if (!code || !user) return back('error')
  try {
    await connectWithCode(code, user)
    back('ok')
  } catch (err) {
    console.error('[google-calendar] callback', err)
    back('error')
  }
})
