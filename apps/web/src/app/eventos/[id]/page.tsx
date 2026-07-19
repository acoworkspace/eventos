'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { EventDetail, EventLine, LineKind } from '@/types'
import { formatARS, formatUSD, formatDate, toUsd } from '@/lib/format'
import { ProviderSelect } from '@/components/ProviderSelect'
import { PaymentModal } from '@/components/PaymentModal'
import { InvoiceModal } from '@/components/InvoiceModal'
import { AddLineModal } from '@/components/AddLineModal'
import { ArrowLeft, FileText, CheckCircle2, Circle, ExternalLink, Plus, Trash2 } from 'lucide-react'

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [paymentLine, setPaymentLine] = useState<EventLine | null>(null)
  const [invoiceLine, setInvoiceLine] = useState<EventLine | null>(null)
  const [addLineKind, setAddLineKind] = useState<LineKind | null>(null)

  const { data: event, isLoading } = useQuery({
    queryKey: ['event', id],
    queryFn: async () => (await api.get<EventDetail>(`/api/events/${id}`)).data,
  })

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['event', id] })
  }

  const updateLineMutation = useMutation({
    mutationFn: ({ lineId, data }: { lineId: string; data: Record<string, unknown> }) =>
      api.put(`/api/event-lines/${lineId}`, data),
    onSuccess: invalidate,
  })

  const statusMutation = useMutation({
    mutationFn: ({ lineId, data }: { lineId: string; data: Record<string, unknown> }) =>
      api.patch(`/api/event-lines/${lineId}/status`, data),
    onSuccess: () => { invalidate(); setPaymentLine(null) },
  })

  const invoiceMutation = useMutation({
    mutationFn: ({ lineId, data }: { lineId: string; data: Record<string, unknown> }) =>
      api.put(`/api/event-lines/${lineId}`, { ...data, has_invoice: true }),
    onSuccess: () => { invalidate(); setInvoiceLine(null) },
  })

  const addLineMutation = useMutation({
    mutationFn: (data: { event_id: string; kind: LineKind; category_label: string }) =>
      api.post('/api/event-lines', data),
    onSuccess: () => { invalidate(); setAddLineKind(null) },
  })

  const deleteLineMutation = useMutation({
    mutationFn: (lineId: string) => api.delete(`/api/event-lines/${lineId}`),
    onSuccess: invalidate,
  })

  const updateExchangeRateMutation = useMutation({
    mutationFn: (exchange_rate: number | null) => api.put(`/api/events/${id}`, { ...event, exchange_rate }),
    onSuccess: invalidate,
  })

  async function openAttachment(path: string, bucket: 'facturas' | 'comprobantes') {
    const res = await api.get('/api/invoices/sign', { params: { bucket, path } })
    window.open(res.data.url, '_blank')
  }

  if (isLoading || !event) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">Cargando…</div>
  }

  const ingresos = event.event_lines.filter(l => l.kind === 'ingreso')
  const gastos = event.event_lines.filter(l => l.kind === 'gasto')
  const totalIngresos = ingresos.reduce((s, l) => s + Number(l.total), 0)
  const totalGastos = gastos.reduce((s, l) => s + Number(l.total), 0)
  const resultado = totalIngresos - totalGastos
  const resultadoUsd = toUsd(resultado, event.exchange_rate)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <button onClick={() => router.push('/eventos')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-3">
          <ArrowLeft className="w-4 h-4" /> Eventos
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{event.client_name}</h1>
            <p className="text-sm text-gray-500">{formatDate(event.event_date)} · {event.location || 'Sin lugar'}</p>
          </div>
          <div className="text-right">
            <label className="block text-xs text-gray-500 mb-1">Tipo de cambio</label>
            <input
              type="number"
              step="0.01"
              defaultValue={event.exchange_rate ?? ''}
              onBlur={(e) => updateExchangeRateMutation.mutate(e.target.value ? Number(e.target.value) : null)}
              placeholder="Sin definir"
              className="w-28 px-2 py-1 text-sm text-right border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <LinesTable
          title="Ingresos"
          kind="ingreso"
          lines={ingresos}
          exchangeRate={event.exchange_rate}
          onUpdateLine={(lineId, data) => updateLineMutation.mutate({ lineId, data })}
          onOpenPayment={setPaymentLine}
          onOpenInvoice={setInvoiceLine}
          onOpenAttachment={openAttachment}
          onAddLine={() => setAddLineKind('ingreso')}
          onDeleteLine={(lineId) => deleteLineMutation.mutate(lineId)}
          total={totalIngresos}
        />

        <LinesTable
          title="Gastos"
          kind="gasto"
          lines={gastos}
          exchangeRate={event.exchange_rate}
          onUpdateLine={(lineId, data) => updateLineMutation.mutate({ lineId, data })}
          onOpenPayment={setPaymentLine}
          onOpenInvoice={setInvoiceLine}
          onOpenAttachment={openAttachment}
          onAddLine={() => setAddLineKind('gasto')}
          onDeleteLine={(lineId) => deleteLineMutation.mutate(lineId)}
          total={totalGastos}
        />

        <div className="bg-white rounded-xl border border-gray-200 px-6 py-4 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Resultado</span>
          <div className="text-right">
            <div className={`text-lg font-semibold ${resultado >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatARS(resultado)}</div>
            {resultadoUsd != null && <div className="text-xs text-gray-500">{formatUSD(resultadoUsd)}</div>}
          </div>
        </div>
      </main>

      {paymentLine && (
        <PaymentModal
          line={paymentLine}
          loading={statusMutation.isPending}
          onClose={() => setPaymentLine(null)}
          onSubmit={(data) => statusMutation.mutate({ lineId: paymentLine.id, data: { status: 'pagado', ...data } })}
        />
      )}

      {invoiceLine && (
        <InvoiceModal
          line={invoiceLine}
          loading={invoiceMutation.isPending}
          onClose={() => setInvoiceLine(null)}
          onSubmit={(data) => invoiceMutation.mutate({ lineId: invoiceLine.id, data })}
        />
      )}

      {addLineKind && (
        <AddLineModal
          kind={addLineKind}
          loading={addLineMutation.isPending}
          onClose={() => setAddLineKind(null)}
          onSubmit={(categoryLabel) => addLineMutation.mutate({ event_id: event.id, kind: addLineKind, category_label: categoryLabel })}
        />
      )}
    </div>
  )
}

function LinesTable({
  title, kind, lines, exchangeRate, onUpdateLine, onOpenPayment, onOpenInvoice, onOpenAttachment, onAddLine, onDeleteLine, total,
}: {
  title: string
  kind: LineKind
  lines: EventLine[]
  exchangeRate: number | null
  onUpdateLine: (lineId: string, data: Record<string, unknown>) => void
  onOpenPayment: (line: EventLine) => void
  onOpenInvoice: (line: EventLine) => void
  onOpenAttachment: (path: string, bucket: 'facturas' | 'comprobantes') => void
  onAddLine: () => void
  onDeleteLine: (lineId: string) => void
  total: number
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
        <button onClick={onAddLine} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
          <Plus className="w-3.5 h-3.5" /> Agregar línea
        </button>
      </div>
      <table className="w-full text-sm">
        <thead className="text-gray-500 text-xs uppercase">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Concepto</th>
            {kind === 'gasto' && <th className="text-left px-4 py-2 font-medium">Proveedor</th>}
            <th className="text-right px-4 py-2 font-medium w-28">Neto</th>
            <th className="text-right px-4 py-2 font-medium w-28">Impuestos</th>
            <th className="text-right px-4 py-2 font-medium w-28">Total</th>
            <th className="text-right px-4 py-2 font-medium w-28">Dólares</th>
            <th className="text-center px-4 py-2 font-medium w-24">Factura</th>
            <th className="text-center px-4 py-2 font-medium w-28">Estado</th>
            <th className="px-2 py-2 w-8"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {lines.map(line => (
            <LineRow
              key={line.id}
              line={line}
              kind={kind}
              exchangeRate={exchangeRate}
              onUpdateLine={onUpdateLine}
              onOpenPayment={onOpenPayment}
              onOpenInvoice={onOpenInvoice}
              onOpenAttachment={onOpenAttachment}
              onDeleteLine={onDeleteLine}
            />
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-200 font-medium text-gray-800">
            <td className="px-4 py-2" colSpan={kind === 'gasto' ? 3 : 2}>Subtotal</td>
            <td></td>
            <td className="px-4 py-2 text-right">{formatARS(total)}</td>
            <td className="px-4 py-2 text-right text-gray-500 text-xs">{exchangeRate ? formatUSD(total / exchangeRate) : '—'}</td>
            <td colSpan={3}></td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function LineRow({
  line, kind, exchangeRate, onUpdateLine, onOpenPayment, onOpenInvoice, onOpenAttachment, onDeleteLine,
}: {
  line: EventLine
  kind: LineKind
  exchangeRate: number | null
  onUpdateLine: (lineId: string, data: Record<string, unknown>) => void
  onOpenPayment: (line: EventLine) => void
  onOpenInvoice: (line: EventLine) => void
  onOpenAttachment: (path: string, bucket: 'facturas' | 'comprobantes') => void
  onDeleteLine: (lineId: string) => void
}) {
  const usd = exchangeRate ? line.total / exchangeRate : null

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-2 text-gray-800">{line.category_label}</td>
      {kind === 'gasto' && (
        <td className="px-4 py-2 w-40">
          <ProviderSelect value={line.provider_id} onChange={(providerId) => onUpdateLine(line.id, { provider_id: providerId })} />
        </td>
      )}
      <td className="px-2 py-2">
        <input
          type="number"
          step="0.01"
          defaultValue={line.neto}
          onBlur={(e) => onUpdateLine(line.id, { neto: Number(e.target.value) })}
          className="w-full px-2 py-1 text-right text-sm border border-transparent hover:border-gray-200 focus:border-blue-400 rounded focus:outline-none"
        />
      </td>
      <td className="px-2 py-2">
        <input
          type="number"
          step="0.01"
          defaultValue={line.impuestos}
          onBlur={(e) => onUpdateLine(line.id, { impuestos: Number(e.target.value) })}
          className="w-full px-2 py-1 text-right text-sm border border-transparent hover:border-gray-200 focus:border-blue-400 rounded focus:outline-none"
        />
      </td>
      <td className="px-4 py-2 text-right font-medium text-gray-800">{formatARS(line.total)}</td>
      <td className="px-4 py-2 text-right text-gray-500 text-xs">{usd != null ? formatUSD(usd) : '—'}</td>
      <td className="px-4 py-2 text-center">
        {line.has_invoice ? (
          <button
            onClick={() => line.invoice_pdf_url && onOpenAttachment(line.invoice_pdf_url, 'facturas')}
            className="inline-flex items-center gap-1 text-xs text-green-700 hover:underline"
          >
            <FileText className="w-3.5 h-3.5" /> Sí
          </button>
        ) : (
          <button onClick={() => onOpenInvoice(line)} className="text-xs text-blue-600 hover:underline">Cargar</button>
        )}
      </td>
      <td className="px-4 py-2 text-center">
        <button
          onClick={() => onOpenPayment(line)}
          className={`inline-flex items-center gap-1 text-xs font-medium ${line.status === 'pagado' ? 'text-green-700' : 'text-gray-500'}`}
        >
          {line.status === 'pagado' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
          {line.status === 'pagado' ? 'Pagado' : 'Pendiente'}
        </button>
        {line.status === 'pagado' && (line.receipt_url || line.retention_url) && (
          <div className="flex justify-center gap-2 mt-1">
            {line.receipt_url && (
              <button onClick={() => onOpenAttachment(line.receipt_url!, 'comprobantes')} title="Ver comprobante" className="text-gray-400 hover:text-blue-600">
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </td>
      <td className="px-2 py-2 text-center">
        <button onClick={() => onDeleteLine(line.id)} className="text-gray-300 hover:text-red-600" title="Eliminar línea">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  )
}
