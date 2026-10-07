'use client'

import { useState } from 'react'
import { CurrencyInput } from './CurrencyInput'
import { PercentInput } from './PercentInput'
import { formatARS } from '@/lib/format'

// Impuestos de una fila: se cargan en $ o en % de la base (el botón cambia el modo)
// y debajo se muestra el otro valor. Siempre se guarda el monto.
export function TaxInput({
  amount, base, onCommit, disabled, inputClassName,
}: {
  amount: number
  base: number
  onCommit: (amount: number) => void
  disabled?: boolean
  inputClassName?: string
}) {
  const [mode, setMode] = useState<'$' | '%'>('$')
  const pct = base > 0 ? (amount / base) * 100 : null

  return (
    <div className="flex items-start gap-1">
      <div className="flex-1 min-w-0">
        {mode === '$' ? (
          <CurrencyInput value={amount} onCommit={onCommit} className={inputClassName} />
        ) : (
          <PercentInput
            value={pct}
            disabled={disabled || base <= 0}
            onCommit={(p) => onCommit(Math.round(base * p / 100))}
            className={inputClassName}
          />
        )}
        <div className="text-[10px] text-gray-400 text-right pr-2 leading-tight">
          {mode === '$' ? (pct != null ? `${Number(pct.toFixed(2))}%` : '') : formatARS(amount)}
        </div>
      </div>
      {!disabled && (
        <button
          type="button"
          onClick={() => setMode(m => m === '$' ? '%' : '$')}
          title={mode === '$' ? 'Cargar como % de la base' : 'Cargar como monto'}
          className="mt-1 shrink-0 w-5 h-5 text-[10px] font-semibold text-gray-500 border border-gray-200 rounded hover:border-blue-400 hover:text-blue-600"
        >
          {mode === '$' ? '%' : '$'}
        </button>
      )}
    </div>
  )
}
