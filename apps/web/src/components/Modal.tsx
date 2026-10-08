'use client'

import { useEffect } from 'react'

/**
 * Contenedor de modal: en mobile se abre como hoja desde abajo (con scroll propio
 * para que el teclado no tape los botones); desde sm se centra como diálogo.
 */
export function Modal({
  children, onClose, maxWidth = 'sm:max-w-md',
}: {
  children: React.ReactNode
  onClose?: () => void
  maxWidth?: string
}) {
  // Evita que la página de fondo scrollee mientras el modal está abierto.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-end sm:items-center justify-center sm:p-4 z-50"
      onClick={onClose}
    >
      <div
        className={`bg-white shadow-lg w-full ${maxWidth} max-h-[92dvh] overflow-y-auto rounded-t-2xl sm:rounded-xl p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

/** Fila de acciones del modal: en mobile los botones ocupan todo el ancho, el principal arriba. */
export function ModalActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 [&>button]:justify-center [&>button]:py-2.5 sm:[&>button]:py-2">
      {children}
    </div>
  )
}
