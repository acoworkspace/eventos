'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LayoutDashboard, FileBarChart, CalendarDays, Users, Truck, LogOut, Calculator, Menu, X } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/cashflow', label: 'Cash Flow', icon: LayoutDashboard },
  { href: '/reportes', label: 'Reportes', icon: FileBarChart },
  { href: '/cotizador', label: 'Cotizador', icon: Calculator },
  { href: '/eventos', label: 'Eventos', icon: CalendarDays },
  { href: '/clientes', label: 'Clientes', icon: Users },
  { href: '/proveedores', label: 'Proveedores', icon: Truck },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Al navegar desde el menú mobile, se cierra solo.
  useEffect(() => setMobileOpen(false), [pathname])

  useEffect(() => {
    if (!mobileOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [mobileOpen])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const current = NAV_ITEMS.find(({ href }) => pathname === href || pathname.startsWith(href + '/'))

  const nav = (
    <>
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-2.5 py-2.5 md:py-2 rounded-md text-sm transition-colors ${
                active ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-gray-100 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-2.5 py-2.5 md:py-2 rounded-md text-sm text-gray-400 hover:text-gray-700 hover:bg-gray-50"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Cerrar sesión
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop */}
      <aside className="hidden md:flex w-56 min-h-screen bg-white border-r border-gray-200 flex-col shrink-0 print:hidden">
        <div className="px-5 py-5 border-b border-gray-100">
          <img src="/aco-logo.webp" alt="ACO Workspace" className="h-7 w-auto" />
        </div>
        {nav}
      </aside>

      {/* Mobile: barra superior */}
      <header className="md:hidden sticky top-0 z-40 bg-white border-b border-gray-200 flex items-center gap-3 px-4 h-[calc(3.5rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] print:hidden">
        <button onClick={() => setMobileOpen(true)} className="p-2 -ml-2 text-gray-600" aria-label="Abrir menú">
          <Menu className="w-5 h-5" />
        </button>
        <img src="/aco-logo.webp" alt="ACO Workspace" className="h-6 w-auto" />
        {current && <span className="ml-auto text-sm font-medium text-gray-700">{current.label}</span>}
      </header>

      {/* Mobile: drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 print:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 max-w-[80vw] bg-white flex flex-col shadow-xl pt-[env(safe-area-inset-top)]">
            <div className="px-5 h-14 flex items-center justify-between border-b border-gray-100">
              <img src="/aco-logo.webp" alt="ACO Workspace" className="h-6 w-auto" />
              <button onClick={() => setMobileOpen(false)} className="p-2 -mr-2 text-gray-400" aria-label="Cerrar menú">
                <X className="w-5 h-5" />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}
    </>
  )
}
