'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { Provider } from '@/types'

export function ProviderSelect({
  value, onChange,
}: {
  value: string | null
  onChange: (providerId: string | null) => void
}) {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')

  const { data: providers } = useQuery({
    queryKey: ['providers'],
    queryFn: async () => (await api.get<Provider[]>('/api/providers')).data,
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => api.post<Provider>('/api/providers', { name }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['providers'] })
      onChange(res.data.id)
      setAdding(false)
      setNewName('')
    },
  })

  if (adding) {
    return (
      <form
        onSubmit={(e) => { e.preventDefault(); if (newName.trim()) createMutation.mutate(newName.trim()) }}
        className="flex gap-1"
      >
        <input
          autoFocus
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="Nombre del proveedor"
          className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button type="button" onClick={() => setAdding(false)} className="text-xs text-gray-400 px-1">×</button>
      </form>
    )
  }

  return (
    <select
      value={value ?? ''}
      onChange={(e) => {
        if (e.target.value === '__new__') { setAdding(true); return }
        onChange(e.target.value || null)
      }}
      className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
    >
      <option value="">Sin proveedor</option>
      {providers?.map(p => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
      <option value="__new__">+ Nuevo proveedor…</option>
    </select>
  )
}
