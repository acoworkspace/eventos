'use client'

import { Fragment, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { EventSummary } from '@/types'
import { formatARS } from '@/lib/format'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
} from 'recharts'
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'

const MONTH_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#4f46e5', '#ea580c']

interface Cell { neto: number; impuestos: number; total: number }
const EMPTY_CELL: Cell = { neto: 0, impuestos: 0, total: 0 }

function CellTds({ cell, className, borderClassName, py = 'py-2' }: {
  cell: Cell | undefined
  className: string
  borderClassName: string
  py?: string
}) {
  const c = cell ?? EMPTY_CELL
  return (
    <>
      <td className={`px-3 ${py} text-right whitespace-nowrap ${borderClassName} ${className}`}>{c.neto ? formatARS(c.neto) : '—'}</td>
      <td className={`px-3 ${py} text-right whitespace-nowrap ${className}`}>{c.impuestos ? formatARS(c.impuestos) : '—'}</td>
      <td className={`px-3 ${py} text-right whitespace-nowrap ${className}`}>{c.total ? formatARS(c.total) : '—'}</td>
    </>
  )
}

function monthsOfYear(year: number) {
  return Array.from({ length: 12 }, (_, i) => ({
    key: `${year}-${String(i + 1).padStart(2, '0')}`,
    label: MONTH_SHORT[i],
  }))
}

export default function CashFlowPage() {
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const { data: events, isLoading } = useQuery({
    queryKey: ['events'],
    queryFn: async () => (await api.get<EventSummary[]>('/api/events')).data,
  })

  const yearEvents = useMemo(
    () => (events ?? []).filter(ev => ev.event_date.startsWith(String(year))),
    [events, year]
  )

  const months = useMemo(() => monthsOfYear(year), [year])

  // Monthly trend: ingresos vs gastos, keyed by event_date's month — never by payment date
  const trend = useMemo(() => {
    return months.map(m => {
      const inMonth = yearEvents.filter(ev => ev.event_date.startsWith(m.key))
      const ingresos = inMonth.reduce((s, ev) => s + ev.ingresos, 0)
      const gastos = inMonth.reduce((s, ev) => s + ev.gastos, 0)
      return { month: m.label, Ingresos: ingresos, Gastos: gastos }
    })
  }, [months, yearEvents])

  // Category breakdown (gastos) for the whole year
  const categoryBreakdown = useMemo(() => {
    const byCategory = new Map<string, number>()
    for (const ev of yearEvents) {
      for (const line of ev.lines.filter(l => l.kind === 'gasto')) {
        byCategory.set(line.category_label, (byCategory.get(line.category_label) ?? 0) + Number(line.total))
      }
    }
    return Array.from(byCategory.entries())
      .map(([name, value]) => ({ name, value }))
      .filter(c => c.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [yearEvents])

  // Top clients by ingresos for the whole year
  const topClients = useMemo(() => {
    const byClient = new Map<string, number>()
    for (const ev of yearEvents) {
      const name = ev.client?.name ?? 'Sin cliente'
      byClient.set(name, (byClient.get(name) ?? 0) + ev.ingresos)
    }
    return Array.from(byClient.entries())
      .map(([name, value]) => ({ name, value }))
      .filter(c => c.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [yearEvents])

  // Month x category table (both ingreso and gasto categories) — cada celda separa
  // neto, impuestos y total, no solo el total.
  const categoryRows = useMemo(() => {
    const rows = new Map<string, { kind: string; totals: Record<string, Cell> }>()
    for (const ev of yearEvents) {
      const monthKey = ev.event_date.slice(0, 7)
      for (const line of ev.lines) {
        const row = rows.get(line.category_label) ?? { kind: line.kind, totals: {} }
        const cell = row.totals[monthKey] ?? { neto: 0, impuestos: 0, total: 0 }
        cell.neto += Number(line.neto)
        cell.impuestos += Number(line.impuestos)
        cell.total += Number(line.total)
        row.totals[monthKey] = cell
        rows.set(line.category_label, row)
      }
    }
    return Array.from(rows.entries())
      .map(([label, r]) => ({ label, ...r }))
      .sort((a, b) => (a.kind === b.kind ? a.label.localeCompare(b.label) : a.kind === 'ingreso' ? -1 : 1))
  }, [yearEvents])

  // Desglose por cliente de las categorías de ingreso (Precio Servicio, Seña, Saldo),
  // para poder desplegar cada fila y ver qué clientes componen ese total.
  const clientBreakdownByCategory = useMemo(() => {
    const byCategory = new Map<string, Map<string, Record<string, Cell>>>()
    for (const ev of yearEvents) {
      const monthKey = ev.event_date.slice(0, 7)
      const clientName = ev.client?.name ?? 'Sin cliente'
      for (const line of ev.lines.filter(l => l.kind === 'ingreso')) {
        if (!byCategory.has(line.category_label)) byCategory.set(line.category_label, new Map())
        const byClient = byCategory.get(line.category_label)!
        if (!byClient.has(clientName)) byClient.set(clientName, {})
        const totals = byClient.get(clientName)!
        const cell = totals[monthKey] ?? { neto: 0, impuestos: 0, total: 0 }
        cell.neto += Number(line.neto)
        cell.impuestos += Number(line.impuestos)
        cell.total += Number(line.total)
        totals[monthKey] = cell
      }
    }
    const result = new Map<string, { client: string; totals: Record<string, Cell> }[]>()
    for (const [category, byClient] of byCategory) {
      result.set(
        category,
        Array.from(byClient.entries())
          .map(([client, totals]) => ({ client, totals }))
          .sort((a, b) => {
            const totalA = Object.values(a.totals).reduce((s, v) => s + v.total, 0)
            const totalB = Object.values(b.totals).reduce((s, v) => s + v.total, 0)
            return totalB - totalA
          })
      )
    }
    return result
  }, [yearEvents])

  // Totalizador de abajo: Ingresos - Egresos por mes. "Precio Servicio" no se suma
  // como ingreso porque ya está compuesto por Seña + Saldo — sumarlo duplicaría el ingreso.
  const netByMonth = useMemo(() => {
    const perMonth = new Map(months.map(m => [m.key, { ingresos: 0, gastos: 0 }]))
    for (const row of categoryRows) {
      if (row.label === 'Precio Servicio') continue
      for (const [monthKey, cell] of Object.entries(row.totals)) {
        const bucket = perMonth.get(monthKey)
        if (!bucket) continue
        if (row.kind === 'ingreso') bucket.ingresos += cell.total
        else bucket.gastos += cell.total
      }
    }
    return perMonth
  }, [categoryRows, months])

  const netGrandTotal = useMemo(
    () => Array.from(netByMonth.values()).reduce((s, v) => s + (v.ingresos - v.gastos), 0),
    [netByMonth]
  )

  function toggleExpanded(category: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">Cash Flow</h1>
          <div className="flex items-center gap-2">
            <button onClick={() => setYear(y => y - 1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-gray-800 w-14 text-center">{year}</span>
            <button onClick={() => setYear(y => y + 1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {isLoading && <p className="text-sm text-gray-400">Cargando…</p>}

        {!isLoading && (
          <>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Tendencia mensual — Ingresos vs Costos</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: any) => formatARS(Number(v))} />
                    <Legend />
                    <Bar dataKey="Ingresos" fill="#16a34a" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Gastos" fill="#dc2626" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">Costos por categoría ({year})</h2>
                {categoryBreakdown.length === 0 ? (
                  <p className="text-sm text-gray-400">Sin datos.</p>
                ) : (
                  <div className="flex items-center gap-4">
                    <div className="h-48 w-48 shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={categoryBreakdown} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80}>
                            {categoryBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v: any) => formatARS(Number(v))} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <ul className="text-xs space-y-1 flex-1 min-w-0">
                      {categoryBreakdown.slice(0, 8).map((c, i) => (
                        <li key={c.name} className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 truncate">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                            <span className="truncate text-gray-600">{c.name}</span>
                          </span>
                          <span className="text-gray-800 font-medium whitespace-nowrap">{formatARS(c.value)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">Principales clientes ({year})</h2>
                {topClients.length === 0 ? (
                  <p className="text-sm text-gray-400">Sin datos.</p>
                ) : (
                  <div className="flex items-center gap-4">
                    <div className="h-48 w-48 shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={topClients} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80}>
                            {topClients.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v: any) => formatARS(Number(v))} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <ul className="text-xs space-y-1 flex-1 min-w-0">
                      {topClients.map((c, i) => (
                        <li key={c.name} className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 truncate">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                            <span className="truncate text-gray-600">{c.name}</span>
                          </span>
                          <span className="text-gray-800 font-medium whitespace-nowrap">{formatARS(c.value)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 uppercase sticky top-0">
                  <tr>
                    <th rowSpan={2} className="text-left px-3 py-2 font-medium sticky left-0 bg-gray-50 align-bottom">Categoría</th>
                    {months.map(m => <th key={m.key} colSpan={3} className="text-center px-3 py-1 font-medium whitespace-nowrap border-l border-gray-200">{m.label}</th>)}
                    <th colSpan={3} className="text-center px-3 py-1 font-medium whitespace-nowrap border-l border-gray-200">Total</th>
                  </tr>
                  <tr>
                    {months.map(m => (
                      <Fragment key={m.key}>
                        <th className="text-right px-3 py-1 font-normal whitespace-nowrap border-l border-gray-200">Neto</th>
                        <th className="text-right px-3 py-1 font-normal whitespace-nowrap">Imp.</th>
                        <th className="text-right px-3 py-1 font-normal whitespace-nowrap">Total</th>
                      </Fragment>
                    ))}
                    <th className="text-right px-3 py-1 font-normal whitespace-nowrap border-l border-gray-200">Neto</th>
                    <th className="text-right px-3 py-1 font-normal whitespace-nowrap">Imp.</th>
                    <th className="text-right px-3 py-1 font-normal whitespace-nowrap">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {categoryRows.map(row => {
                    const rowTotal = Object.values(row.totals).reduce(
                      (s, v) => ({ neto: s.neto + v.neto, impuestos: s.impuestos + v.impuestos, total: s.total + v.total }),
                      { ...EMPTY_CELL }
                    )
                    const clientRows = clientBreakdownByCategory.get(row.label) ?? []
                    const canExpand = row.kind === 'ingreso' && clientRows.length > 0
                    const isOpen = expanded.has(row.label)
                    return (
                      <Fragment key={row.label}>
                        <tr className="hover:bg-gray-50">
                          <td className={`px-3 py-2 sticky left-0 bg-white font-medium whitespace-nowrap ${row.kind === 'ingreso' ? 'text-green-700' : 'text-gray-800'}`}>
                            {canExpand ? (
                              <button onClick={() => toggleExpanded(row.label)} className="flex items-center gap-1 hover:underline">
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                                {row.label}
                              </button>
                            ) : row.label}
                          </td>
                          {months.map(m => (
                            <CellTds key={m.key} cell={row.totals[m.key]} className="text-gray-600" borderClassName="border-l border-gray-200" />
                          ))}
                          <CellTds cell={rowTotal} className="font-semibold text-gray-900" borderClassName="border-l border-gray-200" />
                        </tr>
                        {canExpand && isOpen && clientRows.map(({ client, totals }) => {
                          const clientTotal = Object.values(totals).reduce(
                            (s, v) => ({ neto: s.neto + v.neto, impuestos: s.impuestos + v.impuestos, total: s.total + v.total }),
                            { ...EMPTY_CELL }
                          )
                          return (
                            <tr key={`${row.label}-${client}`} className="bg-gray-50/60">
                              <td className="px-3 py-1.5 pl-9 sticky left-0 bg-gray-50/60 text-gray-500 whitespace-nowrap">{client}</td>
                              {months.map(m => (
                                <CellTds key={m.key} cell={totals[m.key]} className="text-gray-400" borderClassName="border-l border-gray-200" py="py-1.5" />
                              ))}
                              <CellTds cell={clientTotal} className="text-gray-500" borderClassName="border-l border-gray-200" py="py-1.5" />
                            </tr>
                          )
                        })}
                      </Fragment>
                    )
                  })}
                  {categoryRows.length === 0 && (
                    <tr><td colSpan={months.length * 3 + 4} className="px-3 py-8 text-center text-gray-400">No hay eventos en {year}.</td></tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-gray-900">
                    <td className="px-3 py-2 sticky left-0 bg-gray-50 whitespace-nowrap">Neto (Ingresos - Egresos)</td>
                    {months.map(m => {
                      const bucket = netByMonth.get(m.key)
                      const net = bucket ? bucket.ingresos - bucket.gastos : 0
                      return (
                        <td key={m.key} colSpan={3} className={`px-3 py-2 text-right whitespace-nowrap border-l border-gray-200 ${net >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {net ? formatARS(net) : '—'}
                        </td>
                      )
                    })}
                    <td colSpan={3} className={`px-3 py-2 text-right whitespace-nowrap border-l border-gray-200 ${netGrandTotal >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {formatARS(netGrandTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
