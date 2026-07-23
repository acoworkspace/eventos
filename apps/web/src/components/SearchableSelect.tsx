'use client'

import { useEffect, useRef, useState } from 'react'

export interface SearchableSelectItem {
  id: string
  label: string
}

export function SearchableSelect({
  items, value, onChange, onClear, onCreate, creating, placeholder = 'Buscar…', className,
}: {
  items: SearchableSelectItem[]
  value: string | null
  onChange: (id: string) => void
  onClear?: () => void
  onCreate?: (name: string) => void
  creating?: boolean
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = items.find(i => i.id === value)

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
    ? items.filter(i => i.label.toLowerCase().includes(query.trim().toLowerCase()))
    : items

  const exactMatch = items.some(i => i.label.toLowerCase() === query.trim().toLowerCase())

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={open ? query : (selected?.label ?? '')}
        onFocus={() => setOpen(true)}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className={className ?? 'w-full px-2 py-1 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500'}
        style={onClear && selected && !open ? { paddingRight: '1.5rem' } : undefined}
      />
      {onClear && selected && !open && (
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onClear() }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-600"
          title="Quitar"
        >
          ×
        </button>
      )}
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-400">Sin resultados</div>
          )}
          {filtered.slice(0, 50).map(item => (
            <button
              key={item.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange(item.id); setOpen(false); setQuery('') }}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 ${item.id === value ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}
            >
              {item.label}
            </button>
          ))}
          {onCreate && query.trim() && !exactMatch && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onCreate(query.trim()); setOpen(false); setQuery('') }}
              disabled={creating}
              className="w-full text-left px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 border-t border-gray-100 disabled:opacity-50"
            >
              + Crear &quot;{query.trim()}&quot;
            </button>
          )}
        </div>
      )}
    </div>
  )
}
