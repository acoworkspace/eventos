'use client'

import { ExternalLink, X } from 'lucide-react'

export function PdfPreviewModal({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center sm:p-4 z-50" onClick={onClose}>
      <div className="bg-white sm:rounded-xl shadow-lg w-full max-w-3xl h-dvh sm:h-[90vh] flex flex-col pt-[env(safe-area-inset-top)] sm:pt-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200">
          {/* En mobile el visor embebido suele mostrar sólo la primera página: abrirlo aparte es lo más cómodo. */}
          <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm sm:text-xs text-blue-600 sm:text-gray-500 hover:text-blue-600 py-1">
            <ExternalLink className="w-3.5 h-3.5" /> Abrir en pestaña nueva
          </a>
          <button onClick={onClose} className="p-2 -mr-2 text-gray-400 hover:text-gray-700" aria-label="Cerrar">
            <X className="w-5 h-5 sm:w-4 sm:h-4" />
          </button>
        </div>
        <iframe src={url} className="flex-1 w-full sm:rounded-b-xl" title="Vista previa del PDF" />
      </div>
    </div>
  )
}
