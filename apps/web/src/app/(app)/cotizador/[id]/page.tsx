'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { QuoteBlock, QuoteDetail, QuoteLine } from '@/types'
import { formatARS, formatDate } from '@/lib/format'
import { ProviderSelect } from '@/components/ProviderSelect'
import { ClientSelect } from '@/components/ClientSelect'
import { LocationPicker } from '@/components/LocationPicker'
import { CurrencyInput } from '@/components/CurrencyInput'
import { PercentInput } from '@/components/PercentInput'
import { TaxInput } from '@/components/TaxInput'
import { AddLineModal } from '@/components/AddLineModal'
import {
  ArrowLeft, Plus, Trash2, Printer, CheckCircle2, Loader2, ChevronUp, ChevronDown,
} from 'lucide-react'

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function longDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} de ${MONTHS[m - 1]} de ${y}`
}

// "$6.300.000", como en el presupuesto modelo (sin espacio después del signo)
function money(n: number) {
  return `$${Math.round(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}

// "21%", "10.5%": la tasa se guarda con decimales cuando el IVA se carga como monto
function pctLabel(rate: number) {
  return `${Number(rate.toFixed(2))}%`
}

function marginPct(cost: number, price: number) {
  return cost > 0 ? ((price - cost) / cost) * 100 : null
}

// Misma regla que la API: una fila entra en la opción N si está en un bloque de esa opción,
// en un bloque común o en ningún bloque.
function lineInOption(line: QuoteLine, blocks: QuoteBlock[], option: number | null) {
  const block = blocks.find(b => b.id === line.block_id)
  return !block || block.option_no == null || block.option_no === option
}

function optionNumbers(blocks: QuoteBlock[]) {
  return [...new Set(blocks.map(b => b.option_no).filter((n): n is number => n != null))].sort((a, b) => a - b)
}

function totalsFor(lines: QuoteLine[], blocks: QuoteBlock[], option: number | null) {
  const ls = lines.filter(l => lineInOption(l, blocks, option))
  const costo = ls.reduce((s, l) => s + Number(l.cost), 0)
  const precio = ls.reduce((s, l) => s + Number(l.client_price), 0)
  return { costo, precio, ganancia: precio - costo, filas: ls }
}

function blockPrice(block: QuoteBlock, lines: QuoteLine[]) {
  return lines.filter(l => l.block_id === block.id).reduce((s, l) => s + Number(l.client_price), 0)
}

function blockName(block: QuoteBlock) {
  return block.short_name?.trim() || block.title?.trim() || 'Bloque sin título'
}

function blockLabel(block: QuoteBlock) {
  return `${block.option_no != null ? `Opción ${block.option_no} · ` : ''}${block.title?.trim() || 'Bloque sin título'}`
}

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [addingLine, setAddingLine] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [viewOption, setViewOption] = useState<number | null>(null)

  const { data: quote, isLoading } = useQuery({
    queryKey: ['quote', id],
    queryFn: async () => (await api.get<QuoteDetail>(`/api/quotes/${id}`)).data,
  })

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['quote', id] })
  }

  // Actualización optimista genérica sobre el detalle de la cotización
  function optimistic<T>(apply: (old: QuoteDetail, vars: T) => QuoteDetail) {
    return {
      onMutate: async (vars: T) => {
        await queryClient.cancelQueries({ queryKey: ['quote', id] })
        const previous = queryClient.getQueryData<QuoteDetail>(['quote', id])
        queryClient.setQueryData<QuoteDetail>(['quote', id], (old) => old && apply(old, vars))
        return { previous }
      },
      onError: (_err: unknown, _vars: T, context?: { previous?: QuoteDetail }) => {
        if (context?.previous) queryClient.setQueryData(['quote', id], context.previous)
      },
      onSettled: invalidate,
    }
  }

  const updateQuoteMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.put(`/api/quotes/${id}`, data),
    ...optimistic<Record<string, unknown>>((old, data) => ({ ...old, ...data })),
  })

  const updateLineMutation = useMutation({
    mutationFn: ({ lineId, data }: { lineId: string; data: Partial<QuoteLine> }) => api.put(`/api/quote-lines/${lineId}`, data),
    ...optimistic<{ lineId: string; data: Partial<QuoteLine> }>((old, { lineId, data }) => ({
      ...old, quote_lines: old.quote_lines.map(l => l.id === lineId ? { ...l, ...data } : l),
    })),
  })

  const updateBlockMutation = useMutation({
    mutationFn: ({ blockId, data }: { blockId: string; data: Partial<QuoteBlock> }) => api.put(`/api/quote-blocks/${blockId}`, data),
    ...optimistic<{ blockId: string; data: Partial<QuoteBlock> }>((old, { blockId, data }) => ({
      ...old, quote_blocks: old.quote_blocks.map(b => b.id === blockId ? { ...b, ...data } : b),
    })),
  })

  const addLineMutation = useMutation({
    mutationFn: (category_label: string) => api.post('/api/quote-lines', { quote_id: id, category_label }),
    onSuccess: () => { invalidate(); setAddingLine(false) },
  })

  const deleteLineMutation = useMutation({
    mutationFn: (lineId: string) => api.delete(`/api/quote-lines/${lineId}`),
    onSuccess: invalidate,
  })

  const addBlockMutation = useMutation({
    mutationFn: () => api.post('/api/quote-blocks', { quote_id: id }),
    onSuccess: invalidate,
  })

  const deleteBlockMutation = useMutation({
    mutationFn: (blockId: string) => api.delete(`/api/quote-blocks/${blockId}`),
    onSuccess: invalidate,
  })

  const deleteQuoteMutation = useMutation({
    mutationFn: () => api.delete(`/api/quotes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] })
      router.push('/cotizador')
    },
  })

  const confirmMutation = useMutation({
    mutationFn: async (option_no: number | null) => (await api.post<{ event_id: string }>(`/api/quotes/${id}/confirm`, { option_no })).data,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] })
      queryClient.invalidateQueries({ queryKey: ['events'] })
      invalidate()
      router.push(`/eventos/${data.event_id}`)
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'No se pudo confirmar la cotización'),
  })

  if (isLoading || !quote) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">Cargando…</div>
  }

  const locked = quote.status === 'confirmada'
  const lines = quote.quote_lines
  const blocks = quote.quote_blocks
  const options = optionNumbers(blocks)
  const shownOption = locked ? quote.chosen_option : (viewOption != null && options.includes(viewOption) ? viewOption : options[0] ?? null)
  const view = totalsFor(lines, blocks, shownOption)
  const ivaRate = Number(quote.iva_rate)

  // Cambiar el costo mantiene el margen que ya tenía la fila; si no había costo, el precio queda igual.
  function commitCost(line: QuoteLine, cost: number) {
    const pct = marginPct(Number(line.cost), Number(line.client_price))
    const client_price = pct != null ? Math.round(cost * (1 + pct / 100)) : Number(line.client_price)
    updateLineMutation.mutate({ lineId: line.id, data: { cost, client_price } })
  }

  function moveBlock(index: number, delta: number) {
    const a = blocks[index], b = blocks[index + delta]
    if (!a || !b) return
    const orderA = a.sort_order === b.sort_order ? a.sort_order + delta : b.sort_order
    updateBlockMutation.mutate({ blockId: a.id, data: { sort_order: orderA } })
    updateBlockMutation.mutate({ blockId: b.id, data: { sort_order: a.sort_order } })
  }

  function handlePrint() {
    const previousTitle = document.title
    document.title = `Presupuesto - ${quote!.client?.name ?? 'Cliente'} - ${formatDate(quote!.event_date)}`
    window.print()
    document.title = previousTitle
  }

  function openConfirm() {
    if (!quote!.client_id || !quote!.event_date) {
      alert('Para confirmar hace falta cliente y fecha del evento.')
      return
    }
    setConfirming(true)
  }

  const inputBase = 'px-2 py-1 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500'

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      {/* margin 0 hace que el navegador no imprima su encabezado y pie (fecha, URL, nº de página);
          los márgenes de la hoja los ponen los espaciadores de la tabla del documento. */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          html, body { background: #fff !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .avoid-break { break-inside: avoid; }
          .keep-with-next { break-after: avoid; }
        }
      `}</style>

      <div className="print:hidden">
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => router.push('/cotizador')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
              <ArrowLeft className="w-4 h-4" /> Cotizador
            </button>
            <div className="flex items-center gap-4">
              <button
                onClick={() => confirm('¿Eliminar esta cotización?') && deleteQuoteMutation.mutate()}
                className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-red-600"
              >
                <Trash2 className="w-4 h-4" /> Eliminar
              </button>
              <button onClick={handlePrint} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">
                <Printer className="w-4 h-4" /> Exportar PDF
              </button>
              {locked ? (
                <button
                  onClick={() => quote.event_id && router.push(`/eventos/${quote.event_id}`)}
                  disabled={!quote.event_id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 disabled:opacity-60"
                >
                  <CheckCircle2 className="w-4 h-4" /> {quote.event_id ? 'Confirmada · Ver evento' : 'Confirmada (evento eliminado)'}
                </button>
              ) : (
                <button
                  onClick={openConfirm}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  <CheckCircle2 className="w-4 h-4" /> Confirmar y crear evento
                </button>
              )}
            </div>
          </div>

          <fieldset disabled={locked} className="space-y-3">
            <div className="flex items-start justify-between gap-6">
              <div className="flex-1 min-w-0">
                <label className="block text-xs text-gray-500 mb-1">Cliente</label>
                <ClientSelect
                  value={quote.client_id}
                  onChange={(client_id) => updateQuoteMutation.mutate({ client_id })}
                  className="w-full text-lg font-semibold text-gray-900 border-none bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-1 -mx-1"
                />
              </div>
              <div className="text-right shrink-0">
                <label className="block text-xs text-gray-500 mb-1">Fecha del evento</label>
                <input
                  type="date"
                  defaultValue={quote.event_date ?? ''}
                  onBlur={(e) => updateQuoteMutation.mutate({ event_date: e.target.value || null })}
                  className={`${inputBase} text-right`}
                />
              </div>
            </div>
            <div className="flex items-start justify-between gap-6 flex-wrap">
              <div className="flex items-start gap-6">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Espacio</label>
                  <LocationPicker value={quote.location} onChange={(location) => updateQuoteMutation.mutate({ location })} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Cantidad de pax</label>
                  <input
                    type="number" min="0"
                    defaultValue={quote.pax ?? ''}
                    onBlur={(e) => updateQuoteMutation.mutate({ pax: e.target.value ? Number(e.target.value) : null })}
                    className={`${inputBase} w-24`}
                  />
                </div>
              </div>
              <div className="flex items-start gap-6 text-right">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Fecha del presupuesto</label>
                  <input
                    type="date"
                    defaultValue={quote.issue_date}
                    onBlur={(e) => e.target.value && updateQuoteMutation.mutate({ issue_date: e.target.value })}
                    className={`${inputBase} text-right`}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Tipo de cambio</label>
                  <input
                    type="number" step="0.01"
                    defaultValue={quote.exchange_rate ?? ''}
                    onBlur={(e) => updateQuoteMutation.mutate({ exchange_rate: e.target.value ? Number(e.target.value) : null })}
                    placeholder="Sin definir"
                    className={`${inputBase} w-28 text-right`}
                  />
                </div>
              </div>
            </div>
          </fieldset>
        </header>

        <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
          {locked && (
            <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-xl px-4 py-3">
              Esta cotización se confirmó el {formatDate(quote.confirmed_at?.slice(0, 10))}
              {quote.chosen_option != null && <> con la <b>Opción {quote.chosen_option}</b></>} y ya no se puede editar. Los cambios se hacen en el evento.
            </div>
          )}

          <IngresosCard
            options={options}
            shownOption={shownOption}
            onSelectOption={setViewOption}
            canSelect={!locked}
            costo={view.costo}
            precio={view.precio}
            ivaRate={ivaRate}
            onChangeIvaRate={(iva_rate) => updateQuoteMutation.mutate({ iva_rate })}
          />

          <fieldset disabled={locked} className="space-y-8">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                <div>
                  <h2 className="text-sm font-semibold text-gray-700">Costos</h2>
                  <p className="text-[11px] text-gray-400">Cada fila suma al bloque que elijas. Sin bloque no se muestra al cliente, pero su precio suma en todas las opciones.</p>
                </div>
                {!locked && (
                  <button onClick={() => setAddingLine(true)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                    <Plus className="w-3.5 h-3.5" /> Agregar línea
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Concepto</th>
                      <th className="text-left px-4 py-2 font-medium">Proveedor</th>
                      <th className="text-left px-4 py-2 font-medium">Bloque</th>
                      <th className="text-right px-4 py-2 font-medium w-32">Mi costo</th>
                      <th className="text-right px-4 py-2 font-medium w-24">Ganancia %</th>
                      <th className="text-right px-4 py-2 font-medium w-32">Ganancia $</th>
                      <th className="text-right px-4 py-2 font-medium w-32">Precio cliente</th>
                      <th className="px-2 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {lines.map(line => (
                      <QuoteLineRow
                        key={line.id}
                        line={line}
                        blocks={blocks}
                        locked={locked}
                        onUpdate={(data) => updateLineMutation.mutate({ lineId: line.id, data })}
                        onCommitCost={(cost) => commitCost(line, cost)}
                        onDelete={() => deleteLineMutation.mutate(line.id)}
                      />
                    ))}
                  </tbody>
                  {options.length === 0 && (
                    <tfoot>
                      <tr className="border-t border-gray-200 font-medium text-gray-800">
                        <td className="px-4 py-2" colSpan={3}>Subtotal</td>
                        <td className="px-4 py-2 text-right whitespace-nowrap">{formatARS(view.costo)}</td>
                        <td className="px-4 py-2 text-right whitespace-nowrap text-gray-500 text-xs">
                          {view.costo > 0 ? `${((view.ganancia / view.costo) * 100).toFixed(1)}%` : '—'}
                        </td>
                        <td className={`px-4 py-2 text-right whitespace-nowrap ${view.ganancia >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatARS(view.ganancia)}</td>
                        <td className="px-4 py-2 text-right whitespace-nowrap">{formatARS(view.precio)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-end justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-700">Presupuesto para el cliente</h2>
                  <p className="text-[11px] text-gray-400">
                    Cada bloque sale en el PDF como Título, Ítems y Precio, en este orden. Poné bloques en Opción 1, 2… para ofrecer alternativas; los comunes se suman a todas.
                  </p>
                </div>
                {!locked && (
                  <button onClick={() => addBlockMutation.mutate()} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium shrink-0">
                    <Plus className="w-3.5 h-3.5" /> Agregar bloque
                  </button>
                )}
              </div>
              {blocks.length === 0 && (
                <div className="bg-white rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-400">
                  Todavía no hay bloques. Agregá uno por cada parte del servicio (ej: Opción 1 – Finger food, Barra de tragos, Personal y servicio).
                </div>
              )}
              {blocks.map((block, i) => (
                <BlockCard
                  key={block.id}
                  block={block}
                  lines={lines.filter(l => l.block_id === block.id)}
                  maxOption={Math.max(0, ...options)}
                  locked={locked}
                  isFirst={i === 0}
                  isLast={i === blocks.length - 1}
                  onUpdate={(data) => updateBlockMutation.mutate({ blockId: block.id, data })}
                  onMove={(delta) => moveBlock(i, delta)}
                  onDelete={() => confirm('¿Eliminar este bloque? Sus filas de costo quedan sin bloque.') && deleteBlockMutation.mutate(block.id)}
                />
              ))}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-2">Contacto al pie del presupuesto</h2>
              <div className="flex gap-4 flex-wrap">
                <input
                  defaultValue={quote.contact_email ?? ''}
                  onBlur={(e) => updateQuoteMutation.mutate({ contact_email: e.target.value || null })}
                  placeholder="Email"
                  className={`${inputBase} w-64`}
                />
                <input
                  defaultValue={quote.contact_phone ?? ''}
                  onBlur={(e) => updateQuoteMutation.mutate({ contact_phone: e.target.value || null })}
                  placeholder="Teléfono"
                  className={`${inputBase} w-44`}
                />
              </div>
            </div>
          </fieldset>
        </main>
      </div>

      <QuoteDocument quote={quote} />

      {addingLine && (
        <AddLineModal
          kind="gasto"
          loading={addLineMutation.isPending}
          onClose={() => setAddingLine(false)}
          onSubmit={(label) => addLineMutation.mutate(label)}
        />
      )}

      {confirming && (
        <ConfirmModal
          quote={quote}
          options={options}
          loading={confirmMutation.isPending}
          onClose={() => setConfirming(false)}
          onConfirm={(option) => confirmMutation.mutate(option)}
        />
      )}
    </div>
  )
}

function ingresoRows(neto: number, ivaRate: number) {
  const iva = Math.round(neto * ivaRate / 100)
  const senaNeto = Math.round(neto / 2)
  const senaIva = Math.round(iva / 2)
  return [
    { label: 'Precio Servicio', neto, iva, editable: true },
    { label: 'Seña (50%)', neto: senaNeto, iva: senaIva, editable: false },
    { label: 'Saldo (50%)', neto: neto - senaNeto, iva: iva - senaIva, editable: false },
  ]
}

function IngresosCard({ options, shownOption, onSelectOption, canSelect, costo, precio, ivaRate, onChangeIvaRate }: {
  options: number[]
  shownOption: number | null
  onSelectOption: (option: number) => void
  canSelect: boolean
  costo: number
  precio: number
  ivaRate: number
  onChangeIvaRate: (rate: number) => void
}) {
  const ganancia = precio - costo
  const iva = Math.round(precio * ivaRate / 100)
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Ingresos</h2>
          <p className="text-[11px] text-gray-400">Salen del precio cliente. Se cargan así en el evento al confirmar.</p>
        </div>
        {options.length > 0 && (
          <div className="flex gap-1">
            {options.map(o => (
              <button
                key={o}
                onClick={() => onSelectOption(o)}
                disabled={!canSelect && o !== shownOption}
                className={`px-2.5 py-1 text-xs rounded-md font-medium ${o === shownOption ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100 disabled:opacity-40'}`}
              >
                Opción {o}
              </button>
            ))}
          </div>
        )}
      </div>
      <table className="w-full text-sm">
        <thead className="text-gray-500 text-xs uppercase">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Concepto</th>
            <th className="text-right px-4 py-2 font-medium w-32">Neto</th>
            <th className="text-right px-4 py-2 font-medium w-40">IVA</th>
            <th className="text-right px-4 py-2 font-medium w-32">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {ingresoRows(precio, ivaRate).map(r => (
            <tr key={r.label}>
              <td className="px-4 py-2 text-gray-800">{r.label}</td>
              <td className="px-4 py-2 text-right whitespace-nowrap">{formatARS(r.neto)}</td>
              <td className="px-4 py-2 text-right whitespace-nowrap">
                {r.editable && canSelect ? (
                  // El IVA se carga en la fila del total; seña y saldo salen a la mitad
                  <TaxInput
                    amount={iva}
                    base={precio}
                    onCommit={(amount) => { if (precio > 0) onChangeIvaRate(Math.max(0, Number(((amount / precio) * 100).toFixed(6)))) }}
                    inputClassName="w-full px-2 py-1 text-right text-sm border border-gray-200 bg-white rounded focus:outline-none focus:border-blue-400"
                  />
                ) : (
                  <>
                    {formatARS(r.iva)}
                    {r.editable && <div className="text-[10px] text-gray-400">{pctLabel(ivaRate)}</div>}
                  </>
                )}
              </td>
              <td className="px-4 py-2 text-right whitespace-nowrap font-medium">{formatARS(r.neto + r.iva)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-end gap-8 px-4 py-3 border-t border-gray-200 text-sm">
        <span className="text-gray-500">Costo <b className="text-gray-800 font-medium">{formatARS(costo)}</b></span>
        <span className="text-gray-500">
          Ganancia <b className={`font-semibold ${ganancia >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatARS(ganancia)}</b>
          {costo > 0 && <span className="text-xs text-gray-400 ml-1">({((ganancia / costo) * 100).toFixed(1)}%)</span>}
        </span>
      </div>
    </div>
  )
}

function QuoteLineRow({ line, blocks, locked, onUpdate, onCommitCost, onDelete }: {
  line: QuoteLine
  blocks: QuoteBlock[]
  locked: boolean
  onUpdate: (data: Partial<QuoteLine>) => void
  onCommitCost: (cost: number) => void
  onDelete: () => void
}) {
  const cost = Number(line.cost)
  const price = Number(line.client_price)
  const gain = price - cost
  const pct = marginPct(cost, price)
  const moneyInput = 'w-full min-w-[110px] px-2 py-1 text-right text-sm border border-gray-200 bg-white hover:border-gray-300 focus:border-blue-400 rounded focus:outline-none disabled:bg-transparent disabled:border-transparent'

  return (
    <tr className={`hover:bg-gray-50 ${line.block_id ? '' : 'text-gray-500'}`}>
      <td className="px-4 py-2">{line.category_label}</td>
      <td className="px-4 py-2 w-40">
        <ProviderSelect value={line.provider_id} onChange={(provider_id) => onUpdate({ provider_id })} />
      </td>
      <td className="px-4 py-2 w-48">
        <select
          value={line.block_id ?? ''}
          onChange={(e) => onUpdate({ block_id: e.target.value || null })}
          className="w-full px-2 py-1 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-transparent"
        >
          <option value="">— Sin bloque (no se muestra)</option>
          {blocks.map(b => <option key={b.id} value={b.id}>{blockLabel(b)}</option>)}
        </select>
      </td>
      <td className="px-2 py-2">
        <CurrencyInput value={cost} onCommit={onCommitCost} className={moneyInput} />
      </td>
      <td className="px-2 py-2">
        <PercentInput
          value={pct}
          disabled={cost <= 0}
          onCommit={(p) => onUpdate({ client_price: Math.round(cost * (1 + p / 100)) })}
          className={moneyInput}
        />
      </td>
      <td className="px-2 py-2">
        <CurrencyInput value={gain} onCommit={(g) => onUpdate({ client_price: cost + g })} className={`${moneyInput} ${gain < 0 ? 'text-red-600' : ''}`} />
      </td>
      <td className="px-2 py-2">
        <CurrencyInput value={price} onCommit={(p) => onUpdate({ client_price: p })} className={`${moneyInput} font-medium`} />
      </td>
      <td className="px-2 py-2 text-center">
        {!locked && (
          <button onClick={onDelete} className="text-gray-300 hover:text-red-600" title="Eliminar línea">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </td>
    </tr>
  )
}

function BlockCard({ block, lines, maxOption, locked, isFirst, isLast, onUpdate, onMove, onDelete }: {
  block: QuoteBlock
  lines: QuoteLine[]
  maxOption: number
  locked: boolean
  isFirst: boolean
  isLast: boolean
  onUpdate: (data: Partial<QuoteBlock>) => void
  onMove: (delta: number) => void
  onDelete: () => void
}) {
  const price = lines.reduce((s, l) => s + Number(l.client_price), 0)
  const optionChoices = Array.from({ length: maxOption + 1 }, (_, i) => i + 1)
  const field = 'w-full px-2 py-1.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <select
          value={block.option_no ?? ''}
          onChange={(e) => onUpdate({ option_no: e.target.value ? Number(e.target.value) : null })}
          className={`px-2 py-1 text-xs font-medium border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 ${block.option_no != null ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600'}`}
        >
          <option value="">Común a todas las opciones</option>
          {optionChoices.map(n => <option key={n} value={n}>Opción {n}{n > maxOption ? ' (nueva)' : ''}</option>)}
        </select>
        {!locked && (
          <div className="flex items-center gap-2 text-gray-400">
            <button onClick={() => onMove(-1)} disabled={isFirst} title="Subir" className="hover:text-gray-700 disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
            <button onClick={() => onMove(1)} disabled={isLast} title="Bajar" className="hover:text-gray-700 disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
            <button onClick={onDelete} title="Eliminar bloque" className="hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        )}
      </div>

      <div>
        <label className="block text-[11px] font-medium text-gray-500 mb-1">Título</label>
        <input
          defaultValue={block.title ?? ''}
          onBlur={(e) => onUpdate({ title: e.target.value || null })}
          placeholder="Ej: SERVICIO GASTRONÓMICO FINGER FOOD"
          className={`${field} text-sm font-semibold uppercase placeholder:normal-case placeholder:font-normal`}
        />
      </div>

      <div>
        <label className="block text-[11px] font-medium text-gray-500 mb-1">Ítems <span className="font-normal text-gray-400">— una línea por ítem; las que empiezan con * salen como viñeta</span></label>
        <textarea
          defaultValue={block.items ?? ''}
          onBlur={(e) => onUpdate({ items: e.target.value || null })}
          rows={5}
          placeholder={'Selección de bocados salados:\n* Mini sándwich veggie.\n* Pinchos caprese.'}
          className={`${field} text-sm`}
        />
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap pt-1 border-t border-gray-100">
        <div className="flex items-center gap-4 flex-wrap pt-2">
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={block.show_price} onChange={(e) => onUpdate({ show_price: e.target.checked })} className="rounded" />
            Mostrar precio
          </label>
          <input
            defaultValue={block.short_name ?? ''}
            onBlur={(e) => onUpdate({ short_name: e.target.value || null })}
            placeholder="Nombre en el resumen (ej: Finger Food)"
            className="w-64 px-2 py-1 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
          />
        </div>
        <div className="text-right pt-2">
          <div className="text-sm font-semibold text-gray-800">{formatARS(price)} <span className="text-xs font-normal text-gray-400">+ IVA</span></div>
          <div className="text-[11px] text-gray-400">
            {lines.length ? lines.map(l => l.category_label).join(', ') : 'Sin filas de costo: asignalas desde la tabla de Costos'}
          </div>
        </div>
      </div>
    </div>
  )
}

function ConfirmModal({ quote, options, loading, onClose, onConfirm }: {
  quote: QuoteDetail
  options: number[]
  loading: boolean
  onClose: () => void
  onConfirm: (option: number | null) => void
}) {
  const [option, setOption] = useState<number | null>(options[0] ?? null)
  const t = totalsFor(quote.quote_lines, quote.quote_blocks, option)
  const ivaRate = Number(quote.iva_rate)

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6 space-y-4">
        <h3 className="text-base font-semibold text-gray-900">Confirmar y crear evento</h3>

        {options.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">¿Qué opción eligió el cliente?</label>
            <div className="space-y-1">
              {options.map(o => {
                const ot = totalsFor(quote.quote_lines, quote.quote_blocks, o)
                const names = quote.quote_blocks.filter(b => b.option_no === o).map(blockName).join(' + ')
                return (
                  <label key={o} className={`flex items-center justify-between gap-3 px-3 py-2 border rounded-lg cursor-pointer text-sm ${option === o ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}`}>
                    <span className="flex items-center gap-2">
                      <input type="radio" checked={option === o} onChange={() => setOption(o)} />
                      <span><b>Opción {o}</b>{names && <span className="text-gray-500"> · {names}</span>}</span>
                    </span>
                    <span className="whitespace-nowrap">{formatARS(ot.precio)}</span>
                  </label>
                )
              })}
            </div>
          </div>
        )}

        <div className="text-sm text-gray-700 space-y-1 bg-gray-50 rounded-lg px-3 py-2">
          <div>Evento del <b>{formatDate(quote.event_date)}</b> · {quote.client?.name}</div>
          <div>Ingresos: <b>{formatARS(t.precio)}</b> + IVA {pctLabel(ivaRate)} (seña y saldo 50% cada uno)</div>
          <div>Costos: <b>{formatARS(t.costo)}</b> en {t.filas.filter(l => Number(l.cost) > 0).length} filas</div>
        </div>
        <p className="text-xs text-gray-500">Después de confirmar, la cotización queda cerrada.</p>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button
            onClick={() => onConfirm(option)}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

// Ítems: las líneas que empiezan con * (o - / •) van como viñeta; el resto, como texto (ej: "Otras bebidas").
function BlockItems({ text }: { text: string }) {
  const rows = text.split('\n').map(s => s.trim()).filter(Boolean)
  return (
    <div className="space-y-2.5">
      {rows.map((row, i) => {
        const bullet = row.match(/^[*\-•]\s*(.*)$/)
        return bullet ? (
          <div key={i} className="flex gap-2 pl-1 avoid-break"><span>•</span><span>{bullet[1]}</span></div>
        ) : (
          <p key={i} className="pt-1 avoid-break">{row}</p>
        )
      })}
    </div>
  )
}

// Documento que se imprime como PDF, con el formato de los presupuestos de ACO Coffee.
function QuoteDocument({ quote }: { quote: QuoteDetail }) {
  const lines = quote.quote_lines
  const blocks = quote.quote_blocks
  const options = optionNumbers(blocks)
  const pagePad = { height: '18mm' }

  return (
    <table className="hidden print:table w-full text-[12pt] text-black leading-relaxed" style={{ fontFamily: 'Calibri, Carlito, Arial, sans-serif' }}>
      {/* Espaciadores que se repiten en cada hoja: hacen de margen superior e inferior */}
      <thead><tr><td><div style={pagePad} /></td></tr></thead>
      <tfoot><tr><td><div style={pagePad} /></td></tr></tfoot>
      <tbody><tr><td style={{ padding: '0 22mm' }}>
        <div className="flex justify-center mb-10">
          <img src="/aco-logo.webp" alt="ACO Workspace" className="h-14 w-auto" />
        </div>

        <p className="text-right text-[10.5pt] mb-12" style={{ fontFamily: 'Arial, sans-serif' }}>Buenos Aires, {longDate(quote.issue_date)}</p>

        <div className="text-[10.5pt] space-y-0.5 mb-12">
          <p><b>CLIENTE</b>: {quote.client?.name ?? '—'}</p>
          <p><b>FECHA</b>: {formatDate(quote.event_date)}</p>
          {quote.location && <p className="pt-2"><b>ESPACIO</b>: {quote.location.toUpperCase()}</p>}
          {quote.pax != null && <p className="pt-2"><b>Cantidad de pax</b>: {quote.pax} pax</p>}
        </div>

        {blocks.map((block, i) => {
          const price = blockPrice(block, lines)
          const showPrice = block.show_price && price > 0
          const priceLabel = block.option_no != null ? `OPCIÓN ${block.option_no}` : blockName(block).toUpperCase()
          return (
            <section key={block.id} className="mb-9">
              {(block.title?.trim() || block.option_no != null) && (
                <h2 className="text-[12.5pt] uppercase mb-5 avoid-break keep-with-next">
                  {block.option_no != null && <span>OPCIÓN {block.option_no}{block.title?.trim() ? ' – ' : ''}</span>}
                  <b>{block.title?.trim()}</b>
                </h2>
              )}
              {block.items?.trim() && <BlockItems text={block.items} />}
              {showPrice && (
                <p className="mt-8 avoid-break">VALOR {priceLabel}: <b>{money(price)} + IVA</b></p>
              )}
              {showPrice && block.option_no != null && i < blocks.length - 1 && <div className="w-12 border-t border-black mt-10" />}
            </section>
          )
        })}

        <div className="avoid-break mt-10 mb-12">
          {options.length > 0 ? (
            <>
              <p className="font-bold pl-12 mb-4">El presupuesto tiene un valor de :</p>
              <div className="space-y-2">
                {options.map(o => {
                  const t = totalsFor(lines, blocks, o)
                  const names = [
                    ...blocks.filter(b => b.option_no === o),
                    ...blocks.filter(b => b.option_no == null && b.show_price && blockPrice(b, lines) > 0),
                  ].map(blockName)
                  return (
                    <p key={o} className="flex gap-6">
                      <span>Opción {o}{names.length ? ` – ${names.join(' + ')}` : ''}</span>
                      <b className="whitespace-nowrap">{money(t.precio)} + IVA</b>
                    </p>
                  )
                })}
              </div>
            </>
          ) : (
            <SingleTotal neto={totalsFor(lines, blocks, null).precio} ivaRate={Number(quote.iva_rate)} />
          )}
        </div>

        <div className="text-[10.5pt] space-y-3 avoid-break">
          <p className="font-bold underline text-center">El presupuesto tiene una validez de 72 horas.</p>
          <p>El servicio queda confirmado abonando el 50% del monto total en concepto de seña, y el saldo restante debe abonarse hasta 48 horas antes del evento.</p>
          <p>Estamos a disposición ante cualquier duda, consulta o modificación que desees realizar.</p>
          <p>En ACO Coffee ayudamos a que tu evento no solo sea un evento más, sino una experiencia única.</p>
          <p>Gracias por contactarnos.</p>
          {quote.contact_email && <p>{quote.contact_email.toUpperCase()}</p>}
          {quote.contact_phone && <p>📞 {quote.contact_phone}</p>}
        </div>
      </td></tr></tbody>
    </table>
  )
}

function SingleTotal({ neto, ivaRate }: { neto: number; ivaRate: number }) {
  const iva = Math.round(neto * ivaRate / 100)
  return (
    <div className="pl-12">
      <p className="font-bold text-[14pt]">El presupuesto tiene un valor de {money(neto)} +IVA</p>
      <p className="text-[10pt] text-gray-600 mt-1">Neto {money(neto)} · IVA {pctLabel(ivaRate)} {money(iva)} · Total {money(neto + iva)}</p>
    </div>
  )
}
