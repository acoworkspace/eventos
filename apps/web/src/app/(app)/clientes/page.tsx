'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { Client } from '@/types'
import { Plus, Loader2, Search } from 'lucide-react'
import { Modal, ModalActions } from '@/components/Modal'

export default function ClientesPage() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Client | 'new' | null>(null)
  const [search, setSearch] = useState('')

  const { data: clients, isLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => (await api.get<Client[]>('/api/clients')).data,
  })

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return clients ?? []
    return (clients ?? []).filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.cuit?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q)
    )
  }, [clients, search])

  const saveMutation = useMutation({
    mutationFn: (payload: { id?: string; name: string; cuit: string; email: string; phone: string; notes: string }) =>
      payload.id
        ? api.put(`/api/clients/${payload.id}`, payload)
        : api.post('/api/clients', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      setEditing(null)
    },
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-5 sm:py-8">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h1 className="hidden md:block text-lg font-semibold text-gray-900">Clientes</h1>
          <button
            onClick={() => setEditing('new')}
            className="w-full md:w-auto justify-center inline-flex items-center gap-1.5 px-4 py-2.5 md:py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> Nuevo cliente
          </button>
        </div>

        <div className="relative mb-4 md:max-w-xs">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, CUIT o email…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Mobile: tarjetas */}
        <div className="md:hidden bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {isLoading && <p className="px-4 py-8 text-center text-sm text-gray-400">Cargando...</p>}
          {!isLoading && filteredClients.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-gray-400">{search ? 'Sin resultados.' : 'Todavía no hay clientes cargados.'}</p>
          )}
          {filteredClients.map(c => (
            <button key={c.id} onClick={() => setEditing(c)} className="w-full text-left px-4 py-3 active:bg-gray-50">
              <p className="font-medium text-gray-900">{c.name}</p>
              {(c.cuit || c.email || c.phone) && (
                <p className="text-xs text-gray-500 mt-0.5 break-words">
                  {[c.cuit, c.email, c.phone].filter(Boolean).join(' · ')}
                </p>
              )}
            </button>
          ))}
        </div>

        <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Nombre</th>
                <th className="text-left px-4 py-3 font-medium">CUIT</th>
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium">Teléfono</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>
              )}
              {!isLoading && filteredClients.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  {search ? 'Sin resultados.' : 'Todavía no hay clientes cargados.'}
                </td></tr>
              )}
              {filteredClients.map(c => (
                <tr key={c.id} onClick={() => setEditing(c)} className="hover:bg-gray-50 cursor-pointer">
                  <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                  <td className="px-4 py-3 text-gray-600">{c.cuit || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{c.email || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{c.phone || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {editing && (
        <ClientModal
          client={editing === 'new' ? null : editing}
          loading={saveMutation.isPending}
          onClose={() => setEditing(null)}
          onSubmit={(payload) => saveMutation.mutate({ id: editing === 'new' ? undefined : editing.id, ...payload })}
        />
      )}
    </div>
  )
}

function ClientModal({
  client, onClose, onSubmit, loading,
}: {
  client: Client | null
  onClose: () => void
  onSubmit: (payload: { name: string; cuit: string; email: string; phone: string; notes: string }) => void
  loading: boolean
}) {
  const [name, setName] = useState(client?.name ?? '')
  const [cuit, setCuit] = useState(client?.cuit ?? '')
  const [email, setEmail] = useState(client?.email ?? '')
  const [phone, setPhone] = useState(client?.phone ?? '')
  const [notes, setNotes] = useState(client?.notes ?? '')

  return (
    <Modal>
        <h3 className="text-base font-semibold text-gray-900 mb-4">{client ? 'Editar cliente' : 'Nuevo cliente'}</h3>
        <form
          onSubmit={(e) => { e.preventDefault(); onSubmit({ name, cuit, email, phone, notes }) }}
          className="space-y-3"
        >
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
            <input required autoFocus value={name} onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">CUIT</label>
            <input value={cuit} onChange={e => setCuit(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input type="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono</label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <ModalActions>
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
            <button type="submit" disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Guardar
            </button>
          </ModalActions>
        </form>
    </Modal>
  )
}
