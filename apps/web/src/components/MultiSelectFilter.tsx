'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

export interface MultiSelectOption {
  id: string
  label: string
}

/**
 * Filtro de selección múltiple con búsqueda. Sin nada seleccionado equivale a
 * "todos" — así el reporte arranca sin filtrar y cada chip resta, no suma.
 */
export function MultiSelectFilter({
  options, selected, onChange, label, allLabel = 'Todos', className,
}: {
  options: MultiSelectOption[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
  label: string
  allLabel?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }

  const summary = selected.size === 0
    ? allLabel
    : selected.size === 1
      ? (options.find(o => o.id === [...selected][0])?.label ?? `1 ${label.toLowerCase()}`)
      : `${selected.size} seleccionados`

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-left hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <span className={`truncate ${selected.size === 0 ? 'text-gray-400' : 'text-gray-800'}`}>{summary}</span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-56 bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={`Buscar ${label.toLowerCase()}…`}
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="max-h-56 overflow-auto py-1">
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-400">Sin resultados</div>
            )}
            {filtered.map(o => {
              const on = selected.has(o.id)
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggle(o.id)}
                  className={`w-full flex items-center gap-2 text-left px-3 py-1.5 text-sm hover:bg-gray-50 ${on ? 'text-blue-700' : 'text-gray-700'}`}
                >
                  <span className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center ${on ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                    {on && <Check className="w-3 h-3 text-white" />}
                  </span>
                  <span className="truncate">{o.label}</span>
                </button>
              )
            })}
          </div>
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => onChange(new Set())}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 border-t border-gray-100"
            >
              Quitar filtro
            </button>
          )}
        </div>
      )}
    </div>
  )
}
