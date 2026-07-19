'use client'

import { useRef, useState } from 'react'
import api from '@/lib/api'
import { EventLine, ParsedInvoice } from '@/types'
import { Loader2, UploadCloud } from 'lucide-react'

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
  }) => void
  loading: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<ParsedInvoice | null>(null)
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
      setParsed(res.data)
    } catch {
      setError('No se pudo leer la factura. Revisá que sea un PDF válido.')
    } finally {
      setParsing(false)
    }
  }

  async function handleConfirm() {
    if (!file || !parsed) return
    const formData = new FormData()
    formData.append('pdf', file)
    formData.append('bucket', 'facturas')
    const uploadRes = await api.post('/api/invoices/upload', formData)

    onSubmit({
      invoice_pdf_url: uploadRes.data.path,
      invoice_number: parsed.invoice_number,
      invoice_issue_date: parsed.issue_date,
      invoice_client_name: parsed.client_name,
      invoice_client_cuit: parsed.client_cuit,
      invoice_currency: parsed.currency,
      invoice_exchange_rate: parsed.exchange_rate,
    })
  }

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
            Seleccionar PDF de la factura
          </button>
        )}

        {parsing && (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Leyendo factura…
          </div>
        )}

        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mt-2">{error}</p>}

        {parsed && !parsing && (
          <div className="space-y-2 mt-2">
            <div className="text-xs text-gray-500 mb-1">Datos detectados — revisá antes de confirmar:</div>
            <Field label="Número" value={parsed.invoice_number} />
            <Field label="Fecha" value={parsed.issue_date} />
            <Field label="Cliente" value={parsed.client_name} />
            <Field label="CUIT" value={parsed.client_cuit} />
            <Field label="Neto" value={parsed.base_amount != null ? `$ ${parsed.base_amount}` : null} />
            <Field label="Impuestos" value={parsed.iva_amount != null ? `$ ${parsed.iva_amount}` : null} />
            <Field label="Total" value={parsed.total_amount != null ? `$ ${parsed.total_amount}` : null} />
            <Field label="Moneda" value={parsed.currency} />
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
            disabled={!parsed || parsing || loading}
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

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-800 font-medium">{value ?? '—'}</span>
    </div>
  )
}
