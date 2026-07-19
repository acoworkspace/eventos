'use client'

import { useState } from 'react'
import { LineKind } from '@/types'
import { Loader2 } from 'lucide-react'

export function AddLineModal({
  kind, onClose, onSubmit, loading,
}: {
  kind: LineKind
  onClose: () => void
  onSubmit: (categoryLabel: string) => void
  loading: boolean
}) {
  const [categoryLabel, setCategoryLabel] = useState('')

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">
          Agregar línea de {kind === 'ingreso' ? 'ingreso' : 'gasto'}
        </h3>
        <form onSubmit={(e) => { e.preventDefault(); if (categoryLabel.trim()) onSubmit(categoryLabel.trim()) }} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre de la línea</label>
            <input
              autoFocus
              required
              value={categoryLabel}
              onChange={e => setCategoryLabel(e.target.value)}
              placeholder={kind === 'ingreso' ? 'Ej: Extra bar' : 'Ej: Flete'}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
            <button type="submit" disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Agregar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
