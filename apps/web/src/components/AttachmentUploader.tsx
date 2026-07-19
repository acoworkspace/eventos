'use client'

import { useRef, useState } from 'react'
import api from '@/lib/api'
import { Loader2, Paperclip, X } from 'lucide-react'

export interface Attachment {
  path: string
  filename: string
}

export function AttachmentUploader({
  label, bucket, value, onChange,
}: {
  label: string
  bucket: 'facturas' | 'comprobantes'
  value: Attachment | null
  onChange: (attachment: Attachment | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleFileSelected(file: File) {
    setUploading(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('pdf', file)
      formData.append('bucket', bucket)
      const res = await api.post('/api/invoices/upload', formData)
      onChange({ path: res.data.path, filename: file.name })
    } catch {
      setError('No se pudo subir el archivo.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {!value && (
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-gray-600 border border-dashed border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
          {uploading ? 'Subiendo…' : 'Adjuntar PDF'}
        </button>
      )}
      {value && (
        <div className="flex items-center justify-between px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg">
          <span className="truncate text-gray-700">{value.filename}</span>
          <button type="button" onClick={() => onChange(null)} className="text-gray-400 hover:text-red-600" title="Deshacer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelected(f); e.target.value = '' }}
      />
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}
