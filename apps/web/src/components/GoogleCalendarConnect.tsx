'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { CalendarCheck, CalendarPlus, Loader2, RefreshCw } from 'lucide-react'

type Status = { configured: boolean; connected: boolean; google_email: string | null; connected_at: string | null }

const RESULT_MESSAGES: Record<string, { text: string; ok: boolean }> = {
  ok: { text: 'Tu Google Calendar quedó conectado. Los eventos nuevos se van a agregar solos; para sumar los que ya existen, tocá "Sincronizar eventos existentes".', ok: true },
  cancelado: { text: 'Se canceló la conexión con Google Calendar.', ok: false },
  error: { text: 'No se pudo conectar Google Calendar. Probá de nuevo.', ok: false },
}

export function GoogleCalendarConnect() {
  const queryClient = useQueryClient()
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  // Al volver de Google, la API redirige a /eventos?gcal=ok|cancelado|error
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const result = params.get('gcal')
    if (!result) return
    setMessage(RESULT_MESSAGES[result] ?? RESULT_MESSAGES.error)
    params.delete('gcal')
    window.history.replaceState(null, '', `${window.location.pathname}${params.size ? `?${params}` : ''}`)
  }, [])

  const { data: status } = useQuery({
    queryKey: ['google-calendar'],
    queryFn: async () => (await api.get<Status>('/api/google-calendar/status')).data,
  })

  const connectMutation = useMutation({
    mutationFn: async () => (await api.get<{ url: string }>('/api/google-calendar/auth-url')).data,
    onSuccess: ({ url }) => { window.location.href = url },
    onError: (err: any) => setMessage({ text: err?.response?.data?.error ?? 'No se pudo iniciar la conexión.', ok: false }),
  })

  const syncMutation = useMutation({
    mutationFn: async () => (await api.post<{ synced: number }>('/api/google-calendar/sync')).data,
    onSuccess: ({ synced }) => setMessage({ text: `Listo: ${synced} eventos de hoy en adelante quedaron en tu calendario.`, ok: true }),
    onError: () => setMessage({ text: 'No se pudieron sincronizar los eventos.', ok: false }),
  })

  const disconnectMutation = useMutation({
    mutationFn: () => api.post('/api/google-calendar/disconnect'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-calendar'] })
      setMessage({ text: 'Tu Google Calendar quedó desconectado. Los eventos que ya estaban en tu calendario quedan ahí.', ok: true })
    },
  })

  if (!status) return null

  return (
    <div className="space-y-2">
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
        {status.connected ? (
          <>
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <CalendarCheck className="w-4 h-4 text-green-600" />
              Tu Google Calendar está conectado{status.google_email && <> · <span className="text-gray-500">{status.google_email}</span></>}
            </div>
            <div className="flex items-center gap-4 text-xs">
              <button
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
                title="Agrega al calendario los eventos de hoy en adelante que se crearon antes de conectar"
              >
                {syncMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Sincronizar eventos existentes
              </button>
              <button
                onClick={() => confirm('¿Desconectar tu Google Calendar? Los eventos nuevos dejan de agregarse a tu calendario.') && disconnectMutation.mutate()}
                className="text-gray-400 hover:text-red-600"
              >
                Desconectar
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-sm text-gray-500">
              Conectá tu Google Calendar para que cada evento aparezca en tu calendario con su fecha. Cada usuario conecta el suyo.
              {!status.configured && <span className="block text-xs text-amber-600 mt-0.5">Falta configurar las credenciales de Google en la API.</span>}
            </div>
            <button
              onClick={() => connectMutation.mutate()}
              disabled={!status.configured || connectMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {connectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarPlus className="w-4 h-4" />}
              Conectar mi Google Calendar
            </button>
          </>
        )}
      </div>
      {message && (
        <div className={`text-xs rounded-lg px-3 py-2 flex justify-between gap-4 ${message.ok ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'}`}>
          {message.text}
          <button onClick={() => setMessage(null)} className="opacity-60 hover:opacity-100">✕</button>
        </div>
      )}
    </div>
  )
}
