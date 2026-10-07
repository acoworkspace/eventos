'use client'

import { useRef, useState } from 'react'

// Campo de porcentaje: muestra "21%" y al editar acepta "21", "21%" o "10,5".
export function PercentInput({
  value, onCommit, disabled, className,
}: {
  value: number | null
  onCommit: (value: number) => void
  disabled?: boolean
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  // Mismo arreglo que CurrencyInput: el mouseup del clic no debe deshacer la selección
  const reselectOnMouseUp = useRef(false)
  const display = value == null ? '—' : `${Number(value.toFixed(1))}%`

  return (
    <input
      type="text"
      inputMode="decimal"
      disabled={disabled}
      title={disabled ? 'Cargá primero el monto base' : undefined}
      value={editing ? draft : display}
      onFocus={(e) => {
        setEditing(true)
        setDraft(value == null ? '' : String(Number(value.toFixed(2))))
        reselectOnMouseUp.current = true
        requestAnimationFrame(() => e.target.select())
      }}
      onMouseUp={(e) => {
        if (!reselectOnMouseUp.current) return
        reselectOnMouseUp.current = false
        e.preventDefault()
        e.currentTarget.select()
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false)
        const n = Number(draft.replace('%', '').replace(',', '.').trim())
        if (draft.trim() !== '' && Number.isFinite(n)) onCommit(n)
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
      className={className}
    />
  )
}
