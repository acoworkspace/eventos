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
    ivaPercent: parsed.iva_rate != null ? Math.round(parsed.iva_rate * 10000) / 100 : 0,
    currency: parsed.currency,
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
  const [exchangeRate, setExchangeRate] = useState<number | null>(null)
  const [draft, setDraft] = useState<InvoiceDraft | null>(null)
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
      setError('No se pudo leer la factura. Revisá que sea un PDF válido.')
    } finally {
      setParsing(false)
    }
  }

  async function handleConfirm() {
    if (!file || !draft) return
    const formData = new FormData()
    formData.append('pdf', file)
    formData.append('bucket', 'facturas')
    const uploadRes = await api.post('/api/invoices/upload', formData)

    onSubmit({
      invoice_pdf_url: uploadRes.data.path,
      invoice_number: draft.invoice_number || null,
      invoice_issue_date: draft.issue_date || null,
      invoice_client_name: draft.client_name || null,
      invoice_client_cuit: draft.client_cuit || null,
      invoice_currency: draft.currency,
      invoice_exchange_rate: exchangeRate,
      neto: draft.neto,
      impuestos: draft.impuestos,
    })
  }

  function update<K extends keyof InvoiceDraft>(key: K, value: InvoiceDraft[K]) {
    setDraft(d => d ? { ...d, [key]: value } : d)
  }

  const total = draft ? draft.neto + draft.impuestos : 0

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Cargar factura</h3>
        <p className="text-sm text-gray-500 mb-4">{line.category_label}</p>

        {!file && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full flex flex-col items-center justify-center gap-2 px-4 py-8 text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <UploadCloud className="w-6 h-6" />
            Seleccionar PDF de la factura o presupuesto
          </button>
        )}

        {parsing && (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Leyendo documento…
          </div>
        )}

        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mt-2">{error}</p>}

        {draft && !parsing && (
          <div className="space-y-2 mt-2">
            <div className="text-xs text-gray-500 mb-1">Datos detectados — corregí lo que haga falta antes de confirmar:</div>

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
            <FieldRow label="Neto">
              <CurrencyInput value={draft.neto} onCommit={(v) => update('neto', v)} className="w-28 px-2 py-1 text-xs text-right border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </FieldRow>
            <FieldRow label="IVA %">
              <input
                type="number"
                step="0.01"
                value={draft.ivaPercent}
                onChange={(e) => update('ivaPercent', Number(e.target.value))}
                className="w-20 px-2 py-1 text-xs text-right border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </FieldRow>
            <FieldRow label="Impuestos">
              <CurrencyInput value={draft.impuestos} onCommit={(v) => update('impuestos', v)} className="w-28 px-2 py-1 text-xs text-right border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </FieldRow>
            <FieldRow label="Total">
              <span className="text-xs font-semibold text-gray-800">{`$ ${total.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span>
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
