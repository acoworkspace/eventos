'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { Provider } from '@/types'
import { SearchableSelect } from './SearchableSelect'

export function ProviderSelect({
  value, onChange, className,
}: {
  value: string | null
  onChange: (providerId: string | null) => void
  className?: string
}) {
  const queryClient = useQueryClient()

  const { data: providers } = useQuery({
    queryKey: ['providers'],
    queryFn: async () => (await api.get<Provider[]>('/api/providers')).data,
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => api.post<Provider>('/api/providers', { name }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['providers'] })
      onChange(res.data.id)
    },
  })

  return (
    <SearchableSelect
      items={(providers ?? []).map(p => ({ id: p.id, label: p.name }))}
      value={value}
      onChange={onChange}
      onClear={() => onChange(null)}
      onCreate={(name) => createMutation.mutate(name)}
      creating={createMutation.isPending}
      placeholder="Sin proveedor"
      className={className ?? 'w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500'}
    />
  )
}
