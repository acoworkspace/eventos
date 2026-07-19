'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { createClient } from '@/lib/supabase/client'
import { EventSummary } from '@/types'
import { formatARS, formatDate } from '@/lib/format'
import { Plus, LogOut, Loader2 } from 'lucide-react'

export default function EventosPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [showNewModal, setShowNewModal] = useState(false)

  const { data: events, isLoading } = useQuery({
    queryKey: ['events'],
    queryFn: async () => (await api.get<EventSummary[]>('/api/events')).data,
  })

  const createMutation = useMutation({
    mutationFn: (payload: { client_name: string; event_date: string; location: string; exchange_rate: string }) =>
      api.post('/api/events', {
        client_name: payload.client_name,
        event_date: payload.event_date,
        location: payload.location || null,
        exchange_rate: payload.exchange_rate ? Number(payload.exchange_rate) : null,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['events'] })
      setShowNewModal(false)
      router.push(`/eventos/${res.data.id}`)
    },
  })

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Eventos ACO</h1>
        <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1.5">
          <LogOut className="w-4 h-4" /> Salir
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-medium text-gray-700">Todos los eventos</h2>
          <button
            onClick={() => setShowNewModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> Nuevo evento
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Cliente</th>
                <th className="text-left px-4 py-3 font-medium">Fecha</th>
                <th className="text-left px-4 py-3 font-medium">Lugar</th>
                <th className="text-right px-4 py-3 font-medium">Resultado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>
              )}
              {!isLoading && events?.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Todavía no hay eventos cargados.</td></tr>
              )}
              {events?.map(ev => (
                <tr
                  key={ev.id}
                  onClick={() => router.push(`/eventos/${ev.id}`)}
                  className="hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{ev.client_name}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(ev.event_date)}</td>
                  <td className="px-4 py-3 text-gray-600">{ev.location || '—'}</td>
                  <td className={`px-4 py-3 text-right font-medium ${ev.resultado >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {formatARS(ev.resultado)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {showNewModal && (
        <NewEventModal
          onClose={() => setShowNewModal(false)}
          onSubmit={(payload) => createMutation.mutate(payload)}
          loading={createMutation.isPending}
        />
      )}
    </div>
  )
}

function NewEventModal({
  onClose, onSubmit, loading,
}: {
  onClose: () => void
  onSubmit: (payload: { client_name: string; event_date: string; location: string; exchange_rate: string }) => void
  loading: boolean
}) {
  const [clientName, setClientName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [location, setLocation] = useState('')
  const [exchangeRate, setExchangeRate] = useState('')

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Nuevo evento</h3>
        <form
          onSubmit={(e) => { e.preventDefault(); onSubmit({ client_name: clientName, event_date: eventDate, location, exchange_rate: exchangeRate }) }}
          className="space-y-3"
        >
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Cliente</label>
            <input required value={clientName} onChange={e => setClientName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
            <input required type="date" value={eventDate} onChange={e => setEventDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Lugar</label>
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="SUM / Terraza"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de cambio (opcional)</label>
            <input type="number" step="0.01" value={exchangeRate} onChange={e => setExchangeRate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
            <button type="submit" disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Crear evento
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
