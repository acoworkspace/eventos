'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { EventSummary } from '@/types'
import { formatARS, formatDate } from '@/lib/format'
import { MultiSelectFilter } from '@/components/MultiSelectFilter'
import { ChevronDown, Printer, RotateCcw } from 'lucide-react'

const NO_CLIENT = '__sin_cliente__'
const NO_LOCATION = '__sin_lugar__'

/** Base de cálculo: el total incluye impuestos, el neto los excluye. */
type Base = 'total' | 'neto'
type SortKey = 'fecha' | 'cliente' | 'lugar' | 'ingresos' | 'costos' | 'resultado' | 'margen'
type SortDir = 'asc' | 'desc'

const SORT_OPTIONS: [SortKey, string][] = [
  ['fecha', 'Fecha'], ['cliente', 'Cliente'], ['lugar', 'Lugar'], ['ingresos', 'Ingresos'],
  ['costos', 'Costos'], ['resultado', 'Resultado'], ['margen', 'Margen'],
]

interface DetailLine {
  kind: 'ingreso' | 'gasto'
  label: string
  monto: number
}

interface ReportRow {
  id: string
  clientName: string
  eventDate: string
  location: string
  ingresos: number
  costos: number
  resultado: number
  /** null cuando no hay ingresos: el margen no está definido. */
  margen: number | null
  detalle: DetailLine[]
}

function margenOf(ingresos: number, resultado: number) {
  return ingresos === 0 ? null : (resultado / ingresos) * 100
}

function formatMargen(margen: number | null) {
  return margen === null ? '—' : `${margen.toFixed(1)}%`
}

function signColor(v: number) {
  return v >= 0 ? 'text-green-700' : 'text-red-700'
}

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function ReportesPage() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [clientIds, setClientIds] = useState<Set<string>>(new Set())
  const [locations, setLocations] = useState<Set<string>>(new Set())
  const [base, setBase] = useState<Base>('total')
  const [sortKey, setSortKey] = useState<SortKey>('fecha')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [printedAt, setPrintedAt] = useState('')

  // La fecha de emisión se calcula recién en el cliente para no desincronizar el
  // render del servidor con el del navegador.
  useEffect(() => setPrintedAt(isoDay(new Date())), [])

  const { data: events, isLoading } = useQuery({
    queryKey: ['events'],
    queryFn: async () => (await api.get<EventSummary[]>('/api/events')).data,
  })

  const allEvents = events ?? []

  const clientOptions = useMemo(() => {
    const byId = new Map<string, string>()
    for (const ev of allEvents) {
      if (ev.client) byId.set(ev.client.id, ev.client.name)
      else byId.set(NO_CLIENT, 'Sin cliente')
    }
    return Array.from(byId.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [allEvents])

  // Los lugares se toman de los eventos cargados, no del catálogo fijo, para que
  // aparezcan también las oficinas con número ("Oficina 305").
  const locationOptions = useMemo(() => {
    const values = new Set<string>()
    for (const ev of allEvents) values.add(ev.location || NO_LOCATION)
    return Array.from(values)
      .map(v => ({ id: v, label: v === NO_LOCATION ? 'Sin lugar' : v }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [allEvents])

  const rows = useMemo<ReportRow[]>(() => {
    const filtered = allEvents.filter(ev => {
      if (from && ev.event_date < from) return false
      if (to && ev.event_date > to) return false
      if (clientIds.size && !clientIds.has(ev.client?.id ?? NO_CLIENT)) return false
      if (locations.size && !locations.has(ev.location || NO_LOCATION)) return false
      return true
    })

    return filtered.map(ev => {
      const amount = (l: { neto: number; total: number }) => Number(base === 'neto' ? l.neto : l.total)

      // "Precio Servicio" es el monto cotizado y ya está compuesto por Seña + Saldo:
      // sumarlo como ingreso duplicaría la facturación del evento.
      const incomeLines = ev.lines.filter(l => l.kind === 'ingreso' && l.category_label !== 'Precio Servicio')
      const costLines = ev.lines.filter(l => l.kind === 'gasto')

      const ingresos = incomeLines.reduce((s, l) => s + amount(l), 0)
      const costos = costLines.reduce((s, l) => s + amount(l), 0)
      const resultado = ingresos - costos

      const byCategory = new Map<string, DetailLine>()
      for (const l of [...incomeLines, ...costLines]) {
        const key = `${l.kind}|${l.category_label}`
        const entry = byCategory.get(key) ?? { kind: l.kind, label: l.category_label, monto: 0 }
        entry.monto += amount(l)
        byCategory.set(key, entry)
      }

      return {
        id: ev.id,
        clientName: ev.client?.name ?? 'Sin cliente',
        eventDate: ev.event_date,
        location: ev.location || '—',
        ingresos,
        costos,
        resultado,
        margen: margenOf(ingresos, resultado),
        detalle: Array.from(byCategory.values())
          .filter(d => d.monto !== 0)
          .sort((a, b) => (a.kind === b.kind ? b.monto - a.monto : a.kind === 'ingreso' ? -1 : 1)),
      }
    })
  }, [allEvents, from, to, clientIds, locations, base])

  const sortedRows = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case 'cliente': return a.clientName.localeCompare(b.clientName) * dir
        case 'lugar': return a.location.localeCompare(b.location) * dir
        case 'ingresos': return (a.ingresos - b.ingresos) * dir
        case 'costos': return (a.costos - b.costos) * dir
        case 'resultado': return (a.resultado - b.resultado) * dir
        // Los eventos sin ingresos no tienen margen: van al final en ambos sentidos.
        case 'margen': {
          if (a.margen === null && b.margen === null) return 0
          if (a.margen === null) return 1
          if (b.margen === null) return -1
          return (a.margen - b.margen) * dir
        }
        default: return a.eventDate.localeCompare(b.eventDate) * dir
      }
    })
  }, [rows, sortKey, sortDir])

  const totals = useMemo(() => {
    const ingresos = rows.reduce((s, r) => s + r.ingresos, 0)
    const costos = rows.reduce((s, r) => s + r.costos, 0)
    const resultado = ingresos - costos
    return {
      cantidad: rows.length,
      ingresos,
      costos,
      resultado,
      margen: margenOf(ingresos, resultado),
      promedio: rows.length ? resultado / rows.length : 0,
    }
  }, [rows])

  const hasFilters = Boolean(from || to || clientIds.size || locations.size)

  function applyPreset(preset: 'mes' | 'anio' | 'doce' | 'todo') {
    const now = new Date()
    if (preset === 'todo') { setFrom(''); setTo(''); return }
    if (preset === 'mes') {
      setFrom(isoDay(new Date(now.getFullYear(), now.getMonth(), 1)))
      setTo(isoDay(new Date(now.getFullYear(), now.getMonth() + 1, 0)))
      return
    }
    if (preset === 'anio') {
      setFrom(`${now.getFullYear()}-01-01`)
      setTo(`${now.getFullYear()}-12-31`)
      return
    }
    setFrom(isoDay(new Date(now.getFullYear(), now.getMonth() - 11, 1)))
    setTo(isoDay(now))
  }

  function clearFilters() {
    setFrom(''); setTo(''); setClientIds(new Set()); setLocations(new Set())
  }

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      // Los textos se leen mejor de A a Z; los importes y la fecha, de mayor a menor.
      setSortDir(key === 'cliente' || key === 'lugar' ? 'asc' : 'desc')
    }
  }

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const periodLabel = from && to
    ? `${formatDate(from)} al ${formatDate(to)}`
    : from ? `desde ${formatDate(from)}`
    : to ? `hasta ${formatDate(to)}`
    : 'Todo el histórico'

  const clientLabel = clientIds.size === 0
    ? 'Todos'
    : clientOptions.filter(o => clientIds.has(o.id)).map(o => o.label).join(', ')

  const locationLabel = locations.size === 0
    ? 'Todos'
    : locationOptions.filter(o => locations.has(o.id)).map(o => o.label).join(', ')

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      {/* Hoja A4 apaisada: la tabla del reporte necesita el ancho. */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 12mm; }
          html, body { background: #fff !important; }
          /* Los fondos y los puntos de color son parte del reporte, no decoración */
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          thead { display: table-header-group; }
          /* table-row-group (y no el footer-group por defecto) para que el total
             aparezca una sola vez al final y no se repita como si fuera subtotal */
          tfoot { display: table-row-group; }
          tr, .avoid-break { break-inside: avoid; }
          .print-shell { max-width: none !important; padding: 0 !important; }
        }
      `}</style>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-8 space-y-4 sm:space-y-5 print-shell">
        <div className="flex items-center justify-between gap-3 print:hidden">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Reportes</h1>
            <p className="text-xs text-gray-500 mt-0.5">Rentabilidad por evento y consolidada</p>
          </div>
          <button
            onClick={() => window.print()}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            <Printer className="w-4 h-4" /> <span className="hidden sm:inline">Exportar PDF</span><span className="sm:hidden">PDF</span>
          </button>
        </div>

        {/* Membrete: sólo se ve en el PDF. */}
        <div className="hidden print:block mb-4">
          <div className="flex items-start justify-between border-b border-gray-300 pb-3">
            <div>
              <img src="/aco-logo.webp" alt="ACO Workspace" className="h-8 w-auto mb-2" />
              <h1 className="text-base font-semibold text-gray-900">Reporte de rentabilidad de eventos</h1>
            </div>
            <div className="text-[10px] text-gray-600 text-right leading-relaxed max-w-[55%] break-words">
              <div><span className="font-medium">Período:</span> {periodLabel}</div>
              <div><span className="font-medium">Clientes:</span> {clientLabel}</div>
              <div><span className="font-medium">Lugares:</span> {locationLabel}</div>
              <div><span className="font-medium">Base:</span> {base === 'total' ? 'Total (con impuestos)' : 'Neto (sin impuestos)'}</div>
              {printedAt && <div className="mt-1 text-gray-400">Emitido el {formatDate(printedAt)}</div>}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 print:hidden">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Desde</label>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Hasta</label>
              <input type="date" value={to} onChange={e => setTo(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-2 md:col-span-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Clientes</label>
              <MultiSelectFilter options={clientOptions} selected={clientIds} onChange={setClientIds} label="Clientes" />
            </div>
            <div className="col-span-2 md:col-span-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Lugares</label>
              <MultiSelectFilter options={locationOptions} selected={locations} onChange={setLocations} label="Lugares" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-100">
            <span className="text-xs text-gray-400 mr-1">Período</span>
            {([['mes', 'Este mes'], ['anio', 'Este año'], ['doce', 'Últimos 12 meses'], ['todo', 'Todo']] as const).map(([key, label]) => (
              <button key={key} onClick={() => applyPreset(key)}
                className="px-2.5 py-1 text-xs rounded-full border bg-white text-gray-600 border-gray-200 hover:bg-gray-50">
                {label}
              </button>
            ))}

            <span className="basis-full sm:hidden" />
            <span className="text-xs text-gray-400 sm:ml-3 mr-1">Base</span>
            {([['total', 'Total'], ['neto', 'Neto']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setBase(key)}
                className={`px-2.5 py-1 text-xs rounded-full border ${base === key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                {label}
              </button>
            ))}

            {hasFilters && (
              <button onClick={clearFilters}
                className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 text-xs text-gray-500 hover:text-gray-800">
                <RotateCcw className="w-3 h-3" /> Limpiar filtros
              </button>
            )}
          </div>
        </div>

        {isLoading && <p className="text-sm text-gray-400">Cargando…</p>}

        {!isLoading && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3 avoid-break">
              <Kpi className="col-span-2 lg:col-span-1" label="Eventos" value={String(totals.cantidad)} hint={totals.cantidad ? `${formatARS(totals.promedio)} de resultado promedio` : undefined} />
              <Kpi label="Ingresos" value={formatARS(totals.ingresos)} valueClass="text-green-700" />
              <Kpi label="Costos" value={formatARS(totals.costos)} valueClass="text-red-700" />
              <Kpi label="Resultado" value={formatARS(totals.resultado)} valueClass={signColor(totals.resultado)} />
              <Kpi label="Margen" value={formatMargen(totals.margen)} valueClass={totals.margen !== null ? signColor(totals.margen) : 'text-gray-400'} />
            </div>

            {/* Mobile: tarjetas con orden por selector. El PDF siempre usa la tabla. */}
            <div className="md:hidden print:hidden space-y-2">
              <div className="flex items-center justify-end gap-2 text-xs text-gray-500">
                <span>Ordenar por</span>
                <select
                  value={sortKey}
                  onChange={e => toggleSort(e.target.value as SortKey)}
                  className="px-2 py-1.5 border border-gray-200 rounded-lg bg-white text-gray-700"
                >
                  {SORT_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
                <button
                  onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
                  className="px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white text-gray-700"
                  aria-label="Invertir orden"
                >
                  {sortDir === 'asc' ? '▲' : '▼'}
                </button>
              </div>
              {sortedRows.length === 0 && (
                <p className="py-8 text-center text-sm text-gray-400">No hay eventos que cumplan con los filtros.</p>
              )}
              {sortedRows.map(r => {
                const isOpen = expanded.has(r.id)
                return (
                  <div key={r.id} className="bg-white rounded-xl border border-gray-200">
                    <button
                      onClick={() => r.detalle.length > 0 && toggleExpanded(r.id)}
                      className="w-full text-left px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 truncate">{r.clientName}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{formatDate(r.eventDate)} · {r.location}</p>
                        </div>
                        {r.detalle.length > 0 && (
                          <ChevronDown className={`w-4 h-4 shrink-0 mt-0.5 text-gray-400 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-2 text-xs">
                        <span className="text-gray-500">Ingresos</span><span className="text-right text-gray-800">{formatARS(r.ingresos)}</span>
                        <span className="text-gray-500">Costos</span><span className="text-right text-gray-800">{formatARS(r.costos)}</span>
                        <span className="text-gray-500">Resultado</span>
                        <span className={`text-right font-semibold ${signColor(r.resultado)}`}>
                          {formatARS(r.resultado)}
                          <span className={`ml-1.5 font-normal ${r.margen !== null ? signColor(r.margen) : 'text-gray-400'}`}>({formatMargen(r.margen)})</span>
                        </span>
                      </div>
                    </button>
                    {isOpen && (
                      <ul className="border-t border-gray-100 bg-gray-50/60 px-4 py-2 space-y-1 text-xs rounded-b-xl">
                        {r.detalle.map(d => (
                          <li key={`${d.kind}-${d.label}`} className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2 min-w-0 text-gray-500">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${d.kind === 'ingreso' ? 'bg-green-500' : 'bg-red-400'}`} />
                              <span className="truncate">{d.label}</span>
                            </span>
                            <span className={d.kind === 'ingreso' ? 'text-gray-700' : 'text-gray-500'}>
                              {d.kind === 'gasto' ? '−' : ''}{formatARS(d.monto)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="hidden md:block print:block bg-white rounded-xl border border-gray-200 overflow-x-auto print:border-0 print:rounded-none">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <SortableTh label="Cliente" sortKey="cliente" active={sortKey} dir={sortDir} onSort={toggleSort} align="left" />
                    <SortableTh label="Fecha" sortKey="fecha" active={sortKey} dir={sortDir} onSort={toggleSort} align="left" />
                    <SortableTh label="Lugar" sortKey="lugar" active={sortKey} dir={sortDir} onSort={toggleSort} align="left" />
                    <SortableTh label="Ingresos" sortKey="ingresos" active={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                    <SortableTh label="Costos" sortKey="costos" active={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                    <SortableTh label="Resultado" sortKey="resultado" active={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                    <SortableTh label="Margen" sortKey="margen" active={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortedRows.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                      No hay eventos que cumplan con los filtros.
                    </td></tr>
                  )}
                  {sortedRows.map(r => {
                    const isOpen = expanded.has(r.id)
                    return (
                      <Fragment key={r.id}>
                        <tr className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-medium text-gray-900">
                            {r.detalle.length > 0 ? (
                              <button onClick={() => toggleExpanded(r.id)} className="flex items-center gap-1.5 text-left hover:underline">
                                <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-gray-400 transition-transform print:hidden ${isOpen ? '' : '-rotate-90'}`} />
                                {r.clientName}
                              </button>
                            ) : r.clientName}
                          </td>
                          <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{formatDate(r.eventDate)}</td>
                          <td className="px-4 py-2.5 text-gray-600">{r.location}</td>
                          <td className="px-4 py-2.5 text-right whitespace-nowrap text-gray-800">{formatARS(r.ingresos)}</td>
                          <td className="px-4 py-2.5 text-right whitespace-nowrap text-gray-800">{formatARS(r.costos)}</td>
                          <td className={`px-4 py-2.5 text-right whitespace-nowrap font-medium ${signColor(r.resultado)}`}>{formatARS(r.resultado)}</td>
                          <td className={`px-4 py-2.5 text-right whitespace-nowrap ${r.margen !== null ? signColor(r.margen) : 'text-gray-400'}`}>{formatMargen(r.margen)}</td>
                        </tr>
                        {isOpen && r.detalle.map(d => (
                          <tr key={`${r.id}-${d.kind}-${d.label}`} className="bg-gray-50/60 text-xs">
                            <td className="px-4 py-1.5 pl-11 text-gray-500" colSpan={3}>
                              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-2 align-middle ${d.kind === 'ingreso' ? 'bg-green-500' : 'bg-red-400'}`} />
                              {d.label}
                            </td>
                            <td className="px-4 py-1.5 text-right whitespace-nowrap text-gray-400">{d.kind === 'ingreso' ? formatARS(d.monto) : '—'}</td>
                            <td className="px-4 py-1.5 text-right whitespace-nowrap text-gray-400">{d.kind === 'gasto' ? formatARS(d.monto) : '—'}</td>
                            <td colSpan={2}></td>
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })}
                </tbody>
                {sortedRows.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-gray-900">
                      <td className="px-4 py-2.5" colSpan={3}>Total ({totals.cantidad} {totals.cantidad === 1 ? 'evento' : 'eventos'})</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">{formatARS(totals.ingresos)}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">{formatARS(totals.costos)}</td>
                      <td className={`px-4 py-2.5 text-right whitespace-nowrap ${signColor(totals.resultado)}`}>{formatARS(totals.resultado)}</td>
                      <td className={`px-4 py-2.5 text-right whitespace-nowrap ${totals.margen !== null ? signColor(totals.margen) : 'text-gray-400'}`}>{formatMargen(totals.margen)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <p className="text-[11px] text-gray-400 print:text-gray-500">
              Los ingresos excluyen la línea «Precio Servicio», que es el monto cotizado y ya está
              compuesto por Seña + Saldo. Base {base === 'total' ? 'total, con impuestos' : 'neta, sin impuestos'}.
            </p>
          </>
        )}
      </main>
    </div>
  )
}

function Kpi({ label, value, hint, valueClass, className }: {
  className?: string
  label: string
  value: string
  hint?: string
  valueClass?: string
}) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 px-3 sm:px-4 py-3 ${className ?? ''}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-base sm:text-lg font-semibold mt-0.5 ${valueClass ?? 'text-gray-900'}`}>{value}</p>
      {hint && <p className="text-[10px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  )
}

function SortableTh({ label, sortKey, active, dir, onSort, align }: {
  label: string
  sortKey: SortKey
  active: SortKey
  dir: SortDir
  onSort: (key: SortKey) => void
  align: 'left' | 'right'
}) {
  const isActive = active === sortKey
  return (
    <th className={`px-4 py-3 font-medium ${align === 'left' ? 'text-left' : 'text-right'}`}>
      <button
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 uppercase hover:text-gray-800 print:pointer-events-none ${isActive ? 'text-gray-800' : ''}`}
      >
        {label}
        <span className={`text-[9px] print:hidden ${isActive ? 'opacity-100' : 'opacity-0'}`}>{dir === 'asc' ? '▲' : '▼'}</span>
      </button>
    </th>
  )
}
