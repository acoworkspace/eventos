'use client'

import { useState } from 'react'

export function CurrencyInput({
  value, onCommit, className,
}: {
  value: number
  onCommit: (value: number) => void
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  function formatDisplay(n: number) {
    return `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={editing ? draft : formatDisplay(value)}
      onFocus={(e) => {
        setEditing(true)
        setDraft(value === 0 ? '' : String(value))
        requestAnimationFrame(() => e.target.select())
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false)
        onCommit(Number(draft.replace(',', '.')) || 0)
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
      className={className}
    />
  )
}
