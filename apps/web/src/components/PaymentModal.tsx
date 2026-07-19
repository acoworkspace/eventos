'use client'

import { useState } from 'react'
import { EventLine } from '@/types'
import { AttachmentUploader, Attachment } from './AttachmentUploader'
import { Loader2 } from 'lucide-react'

const PAYMENT_METHODS = ['Efectivo', 'Transferencia', 'Cheque', 'Otro']

export function PaymentModal({
  line, onClose, onSubmit, loading,
}: {
  line: EventLine
  onClose: () => void
  onSubmit: (payload: { payment_date: string; payment_method: string; receipt_url: string | null; retention_url: string | null }) => void
  loading: boolean
}) {
  const [paymentDate, setPaymentDate] = useState(line.payment_date ?? new Date().toISOString().split('T')[0])
  const [paymentMethod, setPaymentMethod] = useState(line.payment_method ?? PAYMENT_METHODS[0])
  const [receipt, setReceipt] = useState<Attachment | null>(line.receipt_url ? { path: line.receipt_url, filename: 'Comprobante de pago' } : null)
  const [retention, setRetention] = useState<Attachment | null>(line.retention_url ? { path: line.retention_url, filename: 'Retención' } : null)

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Marcar como pagado</h3>
        <p className="text-sm text-gray-500 mb-4">{line.category_label}</p>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit({
              payment_date: paymentDate,
              payment_method: paymentMethod,
              receipt_url: receipt?.path ?? null,
              retention_url: retention?.path ?? null,
            })
          }}
          className="space-y-3"
        >
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de pago</label>
            <input required type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Forma de pago</label>
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <AttachmentUploader label="Comprobante de pago" bucket="comprobantes" value={receipt} onChange={setReceipt} />
          <AttachmentUploader label="Retención (opcional)" bucket="comprobantes" value={retention} onChange={setRetention} />

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
            <button type="submit" disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirmar pago
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
