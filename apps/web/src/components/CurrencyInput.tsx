'use client'

import { useRef, useState } from 'react'

export function CurrencyInput({
  value, onCommit, className,
}: {
  value: number
  onCommit: (value: number) => void
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  // Al entrar con un clic, el mouseup ponía el cursor donde se hizo clic y deshacía la selección:
  // lo tipeado se mezclaba con el número anterior. Se vuelve a seleccionar todo en ese mouseup.
  const reselectOnMouseUp = useRef(false)

  function formatDisplay(n: number) {
    return `$ ${Math.round(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={editing ? draft : formatDisplay(value)}
      onFocus={(e) => {
        setEditing(true)
        setDraft(value === 0 ? '' : String(value))
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
        onCommit(Math.round(Number(draft.replace(',', '.')) || 0))
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
      className={className}
    />
  )
}
