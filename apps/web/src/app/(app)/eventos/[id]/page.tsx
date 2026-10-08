'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { EventDetail, EventLine, LineKind } from '@/types'
import { formatARS, formatUSD, formatDate, toUsd } from '@/lib/format'
import { ProviderSelect } from '@/components/ProviderSelect'
import { ClientSelect } from '@/components/ClientSelect'
import { LocationPicker } from '@/components/LocationPicker'
import { CurrencyInput } from '@/components/CurrencyInput'
import { TaxInput } from '@/components/TaxInput'
import { PaymentModal } from '@/components/PaymentModal'
import { InvoiceModal } from '@/components/InvoiceModal'
import { AddLineModal } from '@/components/AddLineModal'
import { PdfPreviewModal } from '@/components/PdfPreviewModal'
import { ArrowLeft, FileText, Pencil, CheckCircle2, Circle, Undo2, ExternalLink, Plus, Trash2 } from 'lucide-react'

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [paymentLine, setPaymentLine] = useState<EventLine | null>(null)
  const [invoiceLine, setInvoiceLine] = useState<EventLine | null>(null)
  const [addLineKind, setAddLineKind] = useState<LineKind | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

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
    onMutate: async ({ lineId, data }) => {
      await queryClient.cancelQueries({ queryKey: ['event', id] })
      const previous = queryClient.getQueryData<EventDetail>(['event', id])
      queryClient.setQueryData<EventDetail>(['event', id], (old) => {
        if (!old) return old
        return {
          ...old,
          event_lines: old.event_lines.map(l => {
            if (l.id !== lineId) return l
            const updated = { ...l, ...data } as EventLine
            const neto = 'neto' in data ? Number(data.neto) : l.neto
            const impuestos = 'impuestos' in data ? Number(data.impuestos) : l.impuestos
            return { ...updated, total: neto + impuestos }
          }),
        }
      })
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['event', id], context.previous)
    },
    onSettled: invalidate,
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

  const updateEventMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.put(`/api/events/${id}`, { ...event, ...data }),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: ['event', id] })
      const previous = queryClient.getQueryData<EventDetail>(['event', id])
      queryClient.setQueryData<EventDetail>(['event', id], (old) => old ? { ...old, ...data } : old)
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['event', id], context.previous)
    },
    onSettled: invalidate,
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

  const deleteEventMutation = useMutation({
    mutationFn: () => api.delete(`/api/events/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] })
      router.push('/eventos')
    },
  })

  function handleDeleteEvent() {
    if (confirm('¿Eliminar este evento? Esta acción no se puede deshacer.')) {
      deleteEventMutation.mutate()
    }
  }

  async function openAttachment(path: string, bucket: 'facturas' | 'comprobantes') {
    const res = await api.get('/api/invoices/sign', { params: { bucket, path } })
    setPreviewUrl(res.data.url)
  }

  function undoPayment(lineId: string) {
    statusMutation.mutate({ lineId, data: { status: 'pendiente' } })
  }

  if (isLoading || !event) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">Cargando…</div>
  }

  const ingresos = event.event_lines.filter(l => l.kind === 'ingreso')
  const gastos = event.event_lines.filter(l => l.kind === 'gasto')
  // "Precio Servicio" es el monto cotizado total, ya compuesto por Seña + Saldo —
  // no se suma aparte para no duplicar el ingreso.
  const ingresosParaSumar = ingresos.filter(l => l.category_label !== 'Precio Servicio')
  const netoIngresos = ingresosParaSumar.reduce((s, l) => s + Number(l.neto), 0)
  const impuestosIngresos = ingresosParaSumar.reduce((s, l) => s + Number(l.impuestos), 0)
  const totalIngresos = ingresosParaSumar.reduce((s, l) => s + Number(l.total), 0)
  const netoGastos = gastos.reduce((s, l) => s + Number(l.neto), 0)
  const impuestosGastos = gastos.reduce((s, l) => s + Number(l.impuestos), 0)
  const totalGastos = gastos.reduce((s, l) => s + Number(l.total), 0)
  const resultado = totalIngresos - totalGastos
  const resultadoUsd = toUsd(resultado, event.exchange_rate)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => router.push('/eventos')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 py-1">
            <ArrowLeft className="w-4 h-4" /> Eventos
          </button>
          <button onClick={handleDeleteEvent} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-red-600 py-1">
            <Trash2 className="w-4 h-4" /> <span className="hidden sm:inline">Eliminar evento</span><span className="sm:hidden">Eliminar</span>
          </button>
        </div>
        {/* Mobile: cliente, fecha + tipo de cambio, lugar. Desktop: cliente/fecha arriba, lugar/tipo de cambio abajo. */}
        <div className="grid grid-cols-2 sm:grid-cols-[1fr_auto] gap-x-3 sm:gap-x-6 gap-y-3">
          <div className="col-span-2 sm:col-span-1 order-1 min-w-0">
            <label className="block text-xs text-gray-500 mb-1">Cliente</label>
            <ClientSelect
              value={event.client_id}
              onChange={(client_id) => updateEventMutation.mutate({ client_id })}
              className="w-full text-lg font-semibold text-gray-900 border-none bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-1 -mx-1"
            />
          </div>
          <div className="order-2 sm:text-right">
            <label className="block text-xs text-gray-500 mb-1">Fecha del evento</label>
            <input
              type="date"
              defaultValue={event.event_date}
              onBlur={(e) => e.target.value && updateEventMutation.mutate({ event_date: e.target.value })}
              className="w-full sm:w-auto px-2 py-1.5 sm:py-1 text-sm sm:text-right border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="col-span-2 sm:col-span-1 order-4 sm:order-3 min-w-0">
            <label className="block text-xs text-gray-500 mb-1">Lugar</label>
            <LocationPicker
              value={event.location}
              onChange={(location) => updateEventMutation.mutate({ location })}
            />
          </div>
          <div className="order-3 sm:order-4 sm:text-right">
            <label className="block text-xs text-gray-500 mb-1">Tipo de cambio</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              defaultValue={event.exchange_rate ?? ''}
              onBlur={(e) => updateEventMutation.mutate({ exchange_rate: e.target.value ? Number(e.target.value) : null })}
              placeholder="Sin definir"
              className="w-full sm:w-28 px-2 py-1.5 sm:py-1 text-sm text-right border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-8 space-y-5 sm:space-y-8">
        <LinesTable
          title="Ingresos"
          kind="ingreso"
          lines={ingresos}
          exchangeRate={event.exchange_rate}
          onUpdateLine={(lineId, data) => updateLineMutation.mutate({ lineId, data })}
          onOpenPayment={setPaymentLine}
          onUndoPayment={undoPayment}
          onOpenInvoice={setInvoiceLine}
          onOpenAttachment={openAttachment}
          onAddLine={() => setAddLineKind('ingreso')}
          onDeleteLine={(lineId) => deleteLineMutation.mutate(lineId)}
          neto={netoIngresos}
          impuestos={impuestosIngresos}
          total={totalIngresos}
        />

        <LinesTable
          title="Gastos"
          kind="gasto"
          lines={gastos}
          exchangeRate={event.exchange_rate}
          onUpdateLine={(lineId, data) => updateLineMutation.mutate({ lineId, data })}
          onOpenPayment={setPaymentLine}
          onUndoPayment={undoPayment}
          onOpenInvoice={setInvoiceLine}
          onOpenAttachment={openAttachment}
          onAddLine={() => setAddLineKind('gasto')}
          onDeleteLine={(lineId) => deleteLineMutation.mutate(lineId)}
          neto={netoGastos}
          impuestos={impuestosGastos}
          total={totalGastos}
        />

        <div className="bg-white rounded-xl border border-gray-200 px-4 sm:px-6 py-4 flex items-center justify-between">
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

      {previewUrl && <PdfPreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />}
    </div>
  )
}

function LinesTable({
  title, kind, lines, exchangeRate, onUpdateLine, onOpenPayment, onUndoPayment, onOpenInvoice, onOpenAttachment, onAddLine, onDeleteLine, neto, impuestos, total,
}: {
  title: string
  kind: LineKind
  lines: EventLine[]
  exchangeRate: number | null
  onUpdateLine: (lineId: string, data: Record<string, unknown>) => void
  onOpenPayment: (line: EventLine) => void
  onUndoPayment: (lineId: string) => void
  onOpenInvoice: (line: EventLine) => void
  onOpenAttachment: (path: string, bucket: 'facturas' | 'comprobantes') => void
  onAddLine: () => void
  onDeleteLine: (lineId: string) => void
  neto: number
  impuestos: number
  total: number
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
        <button onClick={onAddLine} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium py-1">
          <Plus className="w-3.5 h-3.5" /> Agregar línea
        </button>
      </div>
      {/* Mobile: una tarjeta por línea */}
      <div className="md:hidden divide-y divide-gray-100">
        {lines.map(line => (
          <LineCard
            key={line.id}
            line={line}
            kind={kind}
            exchangeRate={exchangeRate}
            onUpdateLine={onUpdateLine}
            onOpenPayment={onOpenPayment}
            onUndoPayment={onUndoPayment}
            onOpenInvoice={onOpenInvoice}
            onOpenAttachment={onOpenAttachment}
            onDeleteLine={onDeleteLine}
          />
        ))}
        <div className="px-4 py-3 bg-gray-50 text-sm">
          <div className="flex justify-between text-gray-500"><span>Neto</span><span>{formatARS(neto)}</span></div>
          <div className="flex justify-between text-gray-500"><span>Impuestos</span><span>{formatARS(impuestos)}</span></div>
          <div className="flex justify-between font-semibold text-gray-800 mt-1">
            <span>Subtotal</span>
            <span className="text-right">
              {formatARS(total)}
              {exchangeRate ? <span className="block text-xs font-normal text-gray-500">{formatUSD(total / exchangeRate)}</span> : null}
            </span>
          </div>
        </div>
      </div>

      <div className="hidden md:block overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-gray-500 text-xs uppercase">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Concepto</th>
            <th className="text-left px-4 py-2 font-medium">Proveedor</th>
            <th className="text-right px-4 py-2 font-medium w-28">Neto</th>
            <th className="text-right px-4 py-2 font-medium w-28">Impuestos</th>
            <th className="text-right px-4 py-2 font-medium w-28">Total</th>
            <th className="text-right px-4 py-2 font-medium w-28">Dólares</th>
            <th className="text-center px-4 py-2 font-medium w-24">Factura</th>
            <th className="text-center px-4 py-2 font-medium w-28">Estado</th>
            <th className="text-left px-4 py-2 font-medium">{kind === 'ingreso' ? 'Fecha de cobro' : 'Fecha de pago'}</th>
            <th className="text-left px-4 py-2 font-medium">{kind === 'ingreso' ? 'Forma de cobro' : 'Forma de pago'}</th>
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
              onUndoPayment={onUndoPayment}
              onOpenInvoice={onOpenInvoice}
              onOpenAttachment={onOpenAttachment}
              onDeleteLine={onDeleteLine}
            />
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-200 font-medium text-gray-800">
            <td className="px-4 py-2" colSpan={2}>Subtotal</td>
            <td className="px-4 py-2 text-right whitespace-nowrap">{formatARS(neto)}</td>
            <td className="px-4 py-2 text-right whitespace-nowrap">
              {formatARS(impuestos)}
              {neto > 0 && impuestos > 0 && <div className="text-[10px] font-normal text-gray-400">{Number(((impuestos / neto) * 100).toFixed(2))}%</div>}
            </td>
            <td className="px-4 py-2 text-right whitespace-nowrap">{formatARS(total)}</td>
            <td className="px-4 py-2 text-right whitespace-nowrap text-gray-500 text-xs">{exchangeRate ? formatUSD(total / exchangeRate) : '—'}</td>
            <td colSpan={5}></td>
          </tr>
        </tfoot>
      </table>
      </div>
    </div>
  )
}

function LineRow({
  line, kind, exchangeRate, onUpdateLine, onOpenPayment, onUndoPayment, onOpenInvoice, onOpenAttachment, onDeleteLine,
}: {
  line: EventLine
  kind: LineKind
  exchangeRate: number | null
  onUpdateLine: (lineId: string, data: Record<string, unknown>) => void
  onOpenPayment: (line: EventLine) => void
  onUndoPayment: (lineId: string) => void
  onOpenInvoice: (line: EventLine) => void
  onOpenAttachment: (path: string, bucket: 'facturas' | 'comprobantes') => void
  onDeleteLine: (lineId: string) => void
}) {
  const [confirmingUndo, setConfirmingUndo] = useState(false)
  const usd = lineUsd(line, exchangeRate)

  const isPrecioServicio = line.category_label === 'Precio Servicio'
  const neto = Number(line.neto)
  const impuestos = Number(line.impuestos)

  // Cambiar el neto mantiene el % de impuestos de la fila, salvo que los montos vengan de una factura
  function commitNeto(v: number) {
    const keepRate = !line.has_invoice && neto > 0 && impuestos > 0
    onUpdateLine(line.id, keepRate ? { neto: v, impuestos: Math.round(v * impuestos / neto) } : { neto: v })
  }
  const invoiceButtonLabel = isPrecioServicio ? 'Cargar (Presupuesto)' : 'Cargar'

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-2 text-gray-800">{line.category_label}</td>
      <td className="px-4 py-2 w-40">
        {kind === 'gasto' && (
          <ProviderSelect value={line.provider_id} onChange={(providerId) => onUpdateLine(line.id, { provider_id: providerId })} />
        )}
      </td>
      <td className="px-2 py-2">
        <CurrencyInput
          value={line.neto}
          onCommit={commitNeto}
          className="w-full min-w-[110px] px-2 py-1 text-right text-sm border border-transparent hover:border-gray-200 focus:border-blue-400 rounded focus:outline-none"
        />
      </td>
      <td className="px-2 py-2">
        <TaxInput
          amount={impuestos}
          base={neto}
          onCommit={(v) => onUpdateLine(line.id, { impuestos: v })}
          inputClassName="w-full min-w-[110px] px-2 py-1 text-right text-sm border border-transparent hover:border-gray-200 focus:border-blue-400 rounded focus:outline-none disabled:text-gray-300"
        />
      </td>
      <td className="px-4 py-2 text-right whitespace-nowrap font-medium text-gray-800">{formatARS(line.total)}</td>
      <td className="px-4 py-2 text-right whitespace-nowrap text-gray-500 text-xs">{usd != null ? formatUSD(usd) : '—'}</td>
      <td className="px-4 py-2 text-center">
        <div className="flex items-center justify-center gap-2">
          {line.has_invoice && (
            <button
              onClick={() => line.invoice_pdf_url && onOpenAttachment(line.invoice_pdf_url, 'facturas')}
              className="inline-flex items-center gap-1 text-xs text-green-700 hover:underline"
              title="Ver documento"
            >
              <FileText className="w-3.5 h-3.5" /> Sí
            </button>
          )}
          <button
            onClick={() => onOpenInvoice(line)}
            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
            title={line.has_invoice ? 'Editar / reemplazar' : invoiceButtonLabel}
          >
            {line.has_invoice ? <Pencil className="w-3 h-3" /> : invoiceButtonLabel}
          </button>
        </div>
      </td>
      <td className="px-4 py-2 text-center">
        {isPrecioServicio ? (
          <span className="text-xs text-gray-300">—</span>
        ) : (
        <button
          onClick={() => onOpenPayment(line)}
          className={`inline-flex items-center gap-1 text-xs font-medium ${line.status === 'pagado' ? 'text-green-700' : 'text-gray-500'}`}
        >
          {line.status === 'pagado' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
          {line.status === 'pagado' ? (kind === 'ingreso' ? 'Cobrado' : 'Pagado') : 'Pendiente'}
        </button>
        )}
        {!isPrecioServicio && line.status === 'pagado' && (
          <div className="flex justify-center items-center gap-2 mt-1">
            {line.receipt_url && (
              <button onClick={() => onOpenAttachment(line.receipt_url!, 'comprobantes')} title="Ver comprobante" className="text-gray-400 hover:text-blue-600">
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
            {line.retention_url && (
              <button onClick={() => onOpenAttachment(line.retention_url!, 'comprobantes')} title="Ver retención" className="text-gray-400 hover:text-blue-600">
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
            {confirmingUndo ? (
              <span className="flex items-center gap-1 text-xs">
                <button onClick={() => { onUndoPayment(line.id); setConfirmingUndo(false) }} className="text-red-600 hover:underline">Sí</button>
                <button onClick={() => setConfirmingUndo(false)} className="text-gray-400 hover:underline">No</button>
              </span>
            ) : (
              <button onClick={() => setConfirmingUndo(true)} title="Deshacer pago" className="text-gray-400 hover:text-red-600">
                <Undo2 className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </td>
      <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{!isPrecioServicio && line.status === 'pagado' ? formatDate(line.payment_date) : '—'}</td>
      <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{!isPrecioServicio && line.status === 'pagado' ? (line.payment_method || '—') : '—'}</td>
      <td className="px-2 py-2 text-center">
        <button onClick={() => onDeleteLine(line.id)} className="text-gray-300 hover:text-red-600" title="Eliminar línea">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  )
}

// Si la línea viene de una factura en USD, el monto en dólares es el original de esa
// factura (ya convertido a pesos con su propio tipo de cambio) — no se recalcula con el
// tipo de cambio general del evento.
function lineUsd(line: EventLine, exchangeRate: number | null) {
  return line.invoice_currency === 'USD' && line.invoice_exchange_rate
    ? line.total / line.invoice_exchange_rate
    : (exchangeRate ? line.total / exchangeRate : null)
}

function LineCard({
  line, kind, exchangeRate, onUpdateLine, onOpenPayment, onUndoPayment, onOpenInvoice, onOpenAttachment, onDeleteLine,
}: {
  line: EventLine
  kind: LineKind
  exchangeRate: number | null
  onUpdateLine: (lineId: string, data: Record<string, unknown>) => void
  onOpenPayment: (line: EventLine) => void
  onUndoPayment: (lineId: string) => void
  onOpenInvoice: (line: EventLine) => void
  onOpenAttachment: (path: string, bucket: 'facturas' | 'comprobantes') => void
  onDeleteLine: (lineId: string) => void
}) {
  const [confirmingUndo, setConfirmingUndo] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const usd = lineUsd(line, exchangeRate)
  const isPrecioServicio = line.category_label === 'Precio Servicio'
  const paid = !isPrecioServicio && line.status === 'pagado'
  const amountClass = 'w-full px-2.5 py-2 text-right text-sm border border-gray-200 rounded-lg focus:border-blue-400 focus:outline-none'

  return (
    <div className="px-4 py-3 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-gray-900">{line.category_label}</p>
          <p className="text-sm text-gray-800">
            {formatARS(line.total)}
            {usd != null && <span className="text-xs text-gray-500"> · {formatUSD(usd)}</span>}
          </p>
        </div>
        {confirmingDelete ? (
          <span className="flex items-center gap-3 text-sm shrink-0 py-1">
            <button onClick={() => onDeleteLine(line.id)} className="text-red-600 font-medium">Eliminar</button>
            <button onClick={() => setConfirmingDelete(false)} className="text-gray-400">No</button>
          </span>
        ) : (
          <button onClick={() => setConfirmingDelete(true)} className="p-2 -mr-2 -mt-1 text-gray-300 active:text-red-600" title="Eliminar línea">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {kind === 'gasto' && (
        <div>
          <label className="block text-[11px] text-gray-500 mb-0.5">Proveedor</label>
          <ProviderSelect
            value={line.provider_id}
            onChange={(providerId) => onUpdateLine(line.id, { provider_id: providerId })}
            className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] text-gray-500 mb-0.5">Neto</label>
          <CurrencyInput value={line.neto} onCommit={(v) => onUpdateLine(line.id, { neto: v })} className={amountClass} />
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-0.5">Impuestos</label>
          <CurrencyInput value={line.impuestos} onCommit={(v) => onUpdateLine(line.id, { impuestos: v })} className={amountClass} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {line.has_invoice ? (
          <>
            <button
              onClick={() => line.invoice_pdf_url && onOpenAttachment(line.invoice_pdf_url, 'facturas')}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-green-50 text-green-700 border border-green-100"
            >
              <FileText className="w-3.5 h-3.5" /> Factura
            </button>
            <button onClick={() => onOpenInvoice(line)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border border-gray-200 text-gray-600">
              <Pencil className="w-3 h-3" /> Editar
            </button>
          </>
        ) : (
          <button onClick={() => onOpenInvoice(line)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border border-blue-200 text-blue-600">
            <Plus className="w-3 h-3" /> {isPrecioServicio ? 'Cargar presupuesto' : 'Cargar factura'}
          </button>
        )}

        {!isPrecioServicio && (
          <button
            onClick={() => onOpenPayment(line)}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border font-medium ${paid ? 'bg-green-50 text-green-700 border-green-100' : 'border-gray-200 text-gray-500'}`}
          >
            {paid ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
            {paid ? (kind === 'ingreso' ? 'Cobrado' : 'Pagado') : 'Pendiente'}
          </button>
        )}
      </div>

      {paid && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
          <span>{formatDate(line.payment_date)} · {line.payment_method || '—'}</span>
          {line.receipt_url && (
            <button onClick={() => onOpenAttachment(line.receipt_url!, 'comprobantes')} className="inline-flex items-center gap-1 text-blue-600 py-1">
              <ExternalLink className="w-3 h-3" /> Comprobante
            </button>
          )}
          {line.retention_url && (
            <button onClick={() => onOpenAttachment(line.retention_url!, 'comprobantes')} className="inline-flex items-center gap-1 text-blue-600 py-1">
              <ExternalLink className="w-3 h-3" /> Retención
            </button>
          )}
          {confirmingUndo ? (
            <span className="inline-flex items-center gap-3">
              <span>¿Deshacer?</span>
              <button onClick={() => { onUndoPayment(line.id); setConfirmingUndo(false) }} className="text-red-600 font-medium py-1">Sí</button>
              <button onClick={() => setConfirmingUndo(false)} className="text-gray-400 py-1">No</button>
            </span>
          ) : (
            <button onClick={() => setConfirmingUndo(true)} className="inline-flex items-center gap-1 text-gray-400 py-1">
              <Undo2 className="w-3 h-3" /> Deshacer
            </button>
          )}
        </div>
      )}
    </div>
  )
}
