'use client'

import { ExternalLink, X } from 'lucide-react'

export function PdfPreviewModal({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-lg w-full max-w-3xl h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200">
          <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600">
            <ExternalLink className="w-3.5 h-3.5" /> Abrir en pestaña nueva
          </a>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-4 h-4" />
          </button>
        </div>
        <iframe src={url} className="flex-1 w-full rounded-b-xl" title="Vista previa del PDF" />
      </div>
    </div>
  )
}
