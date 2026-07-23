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
        requestAnimationFrame(() => e.target.select())
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
