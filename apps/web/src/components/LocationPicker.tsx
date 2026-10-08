'use client'

import { useState } from 'react'

export const LOCATIONS = ['Bar', 'Primer Piso', 'Oficina', '9no Piso', 'SUM', 'Terraza']

function parseLocation(location: string | null) {
  if (!location) return { base: '', officeNumber: '' }
  const match = location.match(/^Oficina\s*(.*)$/i)
  if (match) return { base: 'Oficina', officeNumber: match[1].trim() }
  return { base: location, officeNumber: '' }
}

export function LocationPicker({
  value, onChange, className,
}: {
  value: string | null
  onChange: (location: string) => void
  className?: string
}) {
  const parsed = parseLocation(value)
  const [base, setBase] = useState(parsed.base)
  const [officeNumber, setOfficeNumber] = useState(parsed.officeNumber)

  function emit(nextBase: string, nextOfficeNumber: string) {
    if (nextBase === 'Oficina') {
      onChange(nextOfficeNumber ? `Oficina ${nextOfficeNumber}` : 'Oficina')
    } else {
      onChange(nextBase)
    }
  }

  return (
    <div className="flex gap-2 min-w-0">
      <select
        value={base}
        onChange={(e) => { setBase(e.target.value); emit(e.target.value, officeNumber) }}
        className={className ?? 'min-w-0 flex-1 sm:flex-none px-2 py-1.5 sm:py-1 text-sm border border-gray-200 rounded bg-white'}
      >
        <option value="" disabled>Elegir lugar</option>
        {LOCATIONS.map(loc => <option key={loc} value={loc}>{loc}</option>)}
      </select>
      {base === 'Oficina' && (
        <input
          value={officeNumber}
          onChange={(e) => { setOfficeNumber(e.target.value); emit('Oficina', e.target.value) }}
          placeholder="Número"
          className="w-20 shrink-0 px-2 py-1.5 sm:py-1 text-sm border border-gray-200 rounded"
        />
      )}
    </div>
  )
}
