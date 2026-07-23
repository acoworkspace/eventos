'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { Client } from '@/types'
import { SearchableSelect } from './SearchableSelect'

export function ClientSelect({
  value, onChange, className,
}: {
  value: string | null
  onChange: (clientId: string) => void
  className?: string
}) {
  const queryClient = useQueryClient()

  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => (await api.get<Client[]>('/api/clients')).data,
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => api.post<Client>('/api/clients', { name }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      onChange(res.data.id)
    },
  })

  return (
    <SearchableSelect
      items={(clients ?? []).map(c => ({ id: c.id, label: c.name }))}
      value={value}
      onChange={onChange}
      onCreate={(name) => createMutation.mutate(name)}
      creating={createMutation.isPending}
      placeholder="Buscar cliente…"
      className={className}
    />
  )
}
