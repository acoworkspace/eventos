'use client'

import { MouseEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { QuoteSummary } from '@/types'
import { formatARS, formatDate } from '@/lib/format'
import { ClientSelect } from '@/components/ClientSelect'
import { LocationPicker } from '@/components/LocationPicker'
import { Plus, Loader2, Trash2, CheckCircle2 } from 'lucide-react'

type NewQuotePayload = { client_id: string; event_date: string; location: string; pax: string }

export default function CotizadorPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [showNewModal, setShowNewModal] = useState(false)

  const { data: quotes, isLoading } = useQuery({
    queryKey: ['quotes'],
    queryFn: async () => (await api.get<QuoteSummary[]>('/api/quotes')).data,
  })

  const createMutation = useMutation({
    mutationFn: (payload: NewQuotePayload) =>
      api.post('/api/quotes', {
        client_id: payload.client_id,
        event_date: payload.event_date || null,
        location: payload.location || null,
        pax: payload.pax ? Number(payload.pax) : null,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] })
      setShowNewModal(false)
      router.push(`/cotizador/${res.data.id}`)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (quoteId: string) => api.delete(`/api/quotes/${quoteId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quotes'] }),
  })

  function handleDelete(e: MouseEvent, quote: QuoteSummary) {
    e.stopPropagation()
    const msg = quote.status === 'confirmada'
      ? '¿Eliminar esta cotización? El evento que se creó al confirmarla no se borra.'
      : '¿Eliminar esta cotización? Esta acción no se puede deshacer.'
    if (confirm(msg)) deleteMutation.mutate(quote.id)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Cotizador</h1>
            <p className="text-xs text-gray-500 mt-0.5">Presupuestos para clientes. Al confirmarlos se crea el evento.</p>
          </div>
          <button
            onClick={() => setShowNewModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> Nueva cotización
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Cliente</th>
                <th className="text-left px-4 py-3 font-medium">Fecha evento</th>
                <th className="text-left px-4 py-3 font-medium">Lugar</th>
                <th className="text-right px-4 py-3 font-medium">Costo</th>
                <th className="text-right px-4 py-3 font-medium">Precio cliente</th>
                <th className="text-right px-4 py-3 font-medium">Ganancia</th>
                <th className="text-center px-4 py-3 font-medium">Estado</th>
                <th className="px-2 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>
              )}
              {!isLoading && (quotes ?? []).length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Todavía no hay cotizaciones.</td></tr>
              )}
              {(quotes ?? []).map(q => (
                <tr key={q.id} onClick={() => router.push(`/cotizador/${q.id}`)} className="hover:bg-gray-50 cursor-pointer">
                  <td className="px-4 py-3 font-medium text-gray-900">{q.client?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(q.event_date)}</td>
                  <td className="px-4 py-3 text-gray-600">{q.location || '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap"><PerOption quote={q} field="costo" /></td>
                  <td className="px-4 py-3 text-right font-medium text-gray-800 whitespace-nowrap"><PerOption quote={q} field="precio" /></td>
                  <td className="px-4 py-3 text-right font-medium whitespace-nowrap"><PerOption quote={q} field="ganancia" colored /></td>
                  <td className="px-4 py-3 text-center">
                    {q.status === 'confirmada' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700"><CheckCircle2 className="w-3.5 h-3.5" /> Confirmada</span>
                    ) : (
                      <span className="text-xs text-gray-500">Borrador</span>
                    )}
                  </td>
                  <td className="px-2 py-3 text-center">
                    <button onClick={(e) => handleDelete(e, q)} className="text-gray-300 hover:text-red-600" title="Eliminar cotización">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {showNewModal && (
        <NewQuoteModal
          onClose={() => setShowNewModal(false)}
          onSubmit={(payload) => createMutation.mutate(payload)}
          loading={createMutation.isPending}
        />
      )}
    </div>
  )
}

// Con alternativas, cada columna muestra un valor por opción (la confirmada, si ya se eligió)
function PerOption({ quote, field, colored }: { quote: QuoteSummary; field: 'costo' | 'precio' | 'ganancia'; colored?: boolean }) {
  const options = quote.chosen_option != null
    ? quote.options.filter(o => o.option === quote.chosen_option)
    : quote.options
  return (
    <div className="space-y-0.5">
      {options.map(o => (
        <div key={o.option ?? 'unica'} className={colored ? (o[field] >= 0 ? 'text-green-700' : 'text-red-700') : ''}>
          {o.option != null && <span className="text-[10px] font-normal text-gray-400 mr-1">Op. {o.option}</span>}
          {formatARS(o[field])}
        </div>
      ))}
    </div>
  )
}

function NewQuoteModal({
  onClose, onSubmit, loading,
}: {
  onClose: () => void
  onSubmit: (payload: NewQuotePayload) => void
  loading: boolean
}) {
  const [clientId, setClientId] = useState<string | null>(null)
  const [eventDate, setEventDate] = useState('')
  const [location, setLocation] = useState('')
  const [pax, setPax] = useState('')

  const inputClass = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Nueva cotización</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!clientId) return
            onSubmit({ client_id: clientId, event_date: eventDate, location, pax })
          }}
          className="space-y-3"
        >
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Cliente</label>
            <ClientSelect value={clientId} onChange={setClientId} className={`${inputClass} bg-white`} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha del evento</label>
            <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Espacio</label>
            <LocationPicker value={location} onChange={setLocation} className={`${inputClass} bg-white`} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Cantidad de pax</label>
            <input type="number" min="0" value={pax} onChange={e => setPax(e.target.value)} className={inputClass} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
            <button type="submit" disabled={loading || !clientId}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Crear cotización
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
