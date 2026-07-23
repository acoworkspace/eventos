'use client'

import { useRef, useState } from 'react'
import api from '@/lib/api'
import { EventLine, ParsedInvoice } from '@/types'
import { CurrencyInput } from './CurrencyInput'
import { Loader2, UploadCloud } from 'lucide-react'

interface InvoiceDraft {
  invoice_number: string
  issue_date: string
  client_name: string
  client_cuit: string
  neto: number
  impuestos: number
  ivaPercent: number
  conFactura: boolean
  currency: 'ARS' | 'USD'
}

function draftFromParsed(parsed: ParsedInvoice): InvoiceDraft {
  return {
    invoice_number: parsed.invoice_number ?? '',
    issue_date: parsed.issue_date ?? '',
    client_name: parsed.client_name ?? '',
    client_cuit: parsed.client_cuit ?? '',
    neto: parsed.base_amount ?? 0,
    impuestos: parsed.iva_amount ?? 0,
    ivaPercent: parsed.iva_rate != null ? Math.round(parsed.iva_rate * 10000) / 100 : 21,
    conFactura: (parsed.iva_amount ?? 0) > 0,
    currency: parsed.currency,
  }
}

function draftFromLine(line: EventLine): InvoiceDraft {
  const ivaPercent = line.neto > 0 ? Math.round((line.impuestos / line.neto) * 10000) / 100 : 21
  return {
    invoice_number: line.invoice_number ?? '',
    issue_date: line.invoice_issue_date ?? '',
    client_name: line.invoice_client_name ?? '',
    client_cuit: line.invoice_client_cuit ?? '',
    neto: line.neto,
    impuestos: line.impuestos,
    ivaPercent,
    conFactura: line.impuestos > 0,
    currency: (line.invoice_currency as 'ARS' | 'USD') ?? 'ARS',
  }
}

export function InvoiceModal({
  line, onClose, onSubmit, loading,
}: {
  line: EventLine
  onClose: () => void
  onSubmit: (payload: {
    invoice_pdf_url: string
    invoice_number: string | null
    invoice_issue_date: string | null
    invoice_client_name: string | null
    invoice_client_cuit: string | null
    invoice_currency: string | null
    invoice_exchange_rate: number | null
    neto: number | null
    impuestos: number | null
  }) => void
  loading: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [exchangeRate, setExchangeRate] = useState<number | null>(line.invoice_exchange_rate)
  const [draft, setDraft] = useState<InvoiceDraft | null>(line.has_invoice ? draftFromLine(line) : null)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState('')

  async function handleFileSelected(f: File) {
    setFile(f)
    setParsing(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('pdf', f)
      const res = await api.post<ParsedInvoice>('/api/invoices/extract', formData)
      setDraft(draftFromParsed(res.data))
      setExchangeRate(res.data.exchange_rate)
    } catch {
      setError('No se pudo leer el documento. Revisá que sea un PDF válido.')
    } finally {
      setParsing(false)
    }
  }

  function update<K extends keyof InvoiceDraft>(key: K, value: InvoiceDraft[K]) {
    setDraft(d => d ? { ...d, [key]: value } : d)
  }

  // El total es la fuente de verdad cuando viene de un presupuesto/factura con un solo monto:
  // si "con factura", ese monto ya incluye el IVA y hay que descomponerlo; si no, neto = total.
  function commitTotal(newTotal: number) {
    setDraft(d => {
      if (!d) return d
      if (d.conFactura) {
        const neto = newTotal / (1 + d.ivaPercent / 100)
        return { ...d, neto, impuestos: newTotal - neto }
      }
      return { ...d, neto: newTotal, impuestos: 0 }
    })
  }

  function toggleConFactura(checked: boolean) {
    setDraft(d => {
      if (!d) return d
      const currentTotal = d.neto + d.impuestos
      if (checked) {
        const neto = currentTotal / (1 + d.ivaPercent / 100)
        return { ...d, conFactura: true, neto, impuestos: currentTotal - neto }
      }
      return { ...d, conFactura: false, neto: currentTotal, impuestos: 0 }
    })
  }

  function updateIvaPercent(percent: number) {
    setDraft(d => {
      if (!d) return d
      if (!d.conFactura) return { ...d, ivaPercent: percent }
      const currentTotal = d.neto + d.impuestos
      const neto = currentTotal / (1 + percent / 100)
      return { ...d, ivaPercent: percent, neto, impuestos: currentTotal - neto }
    })
  }

  async function handleConfirm() {
    if (!draft) return

    let pdfUrl = line.invoice_pdf_url
    if (file) {
      const formData = new FormData()
      formData.append('pdf', file)
      formData.append('bucket', 'facturas')
      const uploadRes = await api.post('/api/invoices/upload', formData)
      pdfUrl = uploadRes.data.path
    }
    if (!pdfUrl) return

    // Si la factura vino en USD, las columnas en pesos se completan convirtiendo con el
    // tipo de cambio propio de la factura (no el del evento).
    const rate = draft.currency === 'USD' ? (exchangeRate ?? 1) : 1
    const neto = draft.currency === 'USD' ? draft.neto * rate : draft.neto
    const impuestos = draft.currency === 'USD' ? draft.impuestos * rate : draft.impuestos

    onSubmit({
      invoice_pdf_url: pdfUrl,
      invoice_number: draft.invoice_number || null,
      invoice_issue_date: draft.issue_date || null,
      invoice_client_name: draft.client_name || null,
      invoice_client_cuit: draft.client_cuit || null,
      invoice_currency: draft.currency,
      invoice_exchange_rate: draft.currency === 'USD' ? exchangeRate : null,
      neto,
      impuestos,
    })
  }

  const total = draft ? draft.neto + draft.impuestos : 0

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Factura / presupuesto</h3>
        <p className="text-sm text-gray-500 mb-4">{line.category_label}</p>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg hover:bg-gray-50 mb-3"
        >
          <UploadCloud className="w-4 h-4" />
          {file ? file.name : draft ? 'Reemplazar PDF' : 'Seleccionar PDF de la factura o presupuesto'}
        </button>

        {parsing && (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Leyendo documento…
          </div>
        )}

        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mt-2">{error}</p>}

        {draft && !parsing && (
          <div className="space-y-2 mt-2">
            <div className="text-xs text-gray-500 mb-1">Datos — corregí lo que haga falta antes de confirmar:</div>

            <FieldRow label="Número">
              <TextInput value={draft.invoice_number} onChange={(v) => update('invoice_number', v)} />
            </FieldRow>
            <FieldRow label="Fecha">
              <input
                type="date"
                value={draft.issue_date}
                onChange={(e) => update('issue_date', e.target.value)}
                className="w-32 px-2 py-1 text-xs text-right border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </FieldRow>
            <FieldRow label="Cliente / Proveedor">
              <TextInput value={draft.client_name} onChange={(v) => update('client_name', v)} />
            </FieldRow>
            <FieldRow label="CUIT">
              <TextInput value={draft.client_cuit} onChange={(v) => update('client_cuit', v)} />
            </FieldRow>
            <FieldRow label="Moneda">
              <select
                value={draft.currency}
                onChange={(e) => update('currency', e.target.value as 'ARS' | 'USD')}
                className="px-2 py-1 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
            </FieldRow>
            {draft.currency === 'USD' && (
              <FieldRow label="Tipo de cambio">
                <input
                  type="number"
                  step="0.01"
                  value={exchangeRate ?? ''}
                  onChange={(e) => setExchangeRate(e.target.value ? Number(e.target.value) : null)}
                  placeholder="Tipo de cambio"
                  className="w-24 px-2 py-1 text-xs text-right border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </FieldRow>
            )}

            <label className="flex items-center gap-2 text-xs text-gray-600 pt-1">
              <input type="checkbox" checked={draft.conFactura} onChange={(e) => toggleConFactura(e.target.checked)} />
              Con factura (el total incluye IVA)
            </label>

            <FieldRow label="Total">
              <CurrencyInput
                value={total}
                onCommit={commitTotal}
                className="w-28 px-2 py-1 text-xs text-right font-semibold border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </FieldRow>
            {draft.conFactura && (
              <FieldRow label="IVA %">
                <input
                  type="number"
                  step="0.01"
                  value={draft.ivaPercent}
                  onChange={(e) => updateIvaPercent(Number(e.target.value))}
                  className="w-20 px-2 py-1 text-xs text-right border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </FieldRow>
            )}
            <FieldRow label="Neto">
              <CurrencyInput value={draft.neto} onCommit={(v) => update('neto', v)} className="w-28 px-2 py-1 text-xs text-right border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </FieldRow>
            <FieldRow label="Impuestos">
              <CurrencyInput value={draft.impuestos} onCommit={(v) => update('impuestos', v)} className="w-28 px-2 py-1 text-xs text-right border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </FieldRow>
            {draft.currency === 'USD' && (
              <p className="text-[11px] text-gray-400 pt-1">
                Los montos en USD se guardan convertidos a pesos con el tipo de cambio de arriba. La columna en dólares va a mostrar el monto original sin recalcular.
              </p>
            )}
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelected(f) }}
        />

        <div className="flex justify-end gap-2 pt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button
            type="button"
            disabled={!draft || parsing || loading}
            onClick={handleConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Confirmar y aplicar
          </button>
        </div>
      </div>
    </div>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-gray-500 shrink-0">{label}</span>
      {children}
    </div>
  )
}

function TextInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-40 px-2 py-1 text-xs text-right border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
    />
  )
}
