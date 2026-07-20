'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { Client } from '@/types'

export function ClientSelect({
  value, onChange, className,
}: {
  value: string | null
  onChange: (clientId: string) => void
  className?: string
}) {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')

  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => (await api.get<Client[]>('/api/clients')).data,
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => api.post<Client>('/api/clients', { name }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
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
          placeholder="Nombre del cliente"
          className={className ?? 'px-2 py-1 text-sm border border-gray-200 rounded'}
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
        if (e.target.value) onChange(e.target.value)
      }}
      className={className ?? 'px-2 py-1 text-sm border border-gray-200 rounded bg-white'}
    >
      <option value="" disabled>Elegir cliente</option>
      {clients?.map(c => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
      <option value="__new__">+ Nuevo cliente…</option>
    </select>
  )
}
