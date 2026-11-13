'use client'

import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Building2,
  Users,
  BookOpen,
  GraduationCap,
  Link2,
  Clock,
  ShieldAlert,
  Settings2,
  Wand2,
  CalendarDays,
  School,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const NAV_ITEMS = [
  { label: 'Dashboard',      href: '/dashboard',             icon: LayoutDashboard },
  { label: 'Unidades',       href: '/dashboard/units',       icon: Building2 },
  { label: 'Turmas',         href: '/dashboard/classes',     icon: Users },
  { label: 'Disciplinas',    href: '/dashboard/subjects',    icon: BookOpen },
  { label: 'Professores',    href: '/dashboard/teachers',    icon: GraduationCap },
  { label: 'Atribuições',    href: '/dashboard/assignments', icon: Link2 },
  { label: 'Grades Horárias',href: '/dashboard/grids',       icon: Clock },
  { label: 'Restrições',     href: '/dashboard/constraints', icon: ShieldAlert },
  { label: 'Regras Globais', href: '/dashboard/constraints/rules', icon: Settings2 },
  { label: 'Gerar Horário',  href: '/dashboard/generate',    icon: Wand2 },
  { label: 'Horários',       href: '/dashboard/schedules',   icon: CalendarDays },
]

const COLLAPSED_KEY = 'sidebar-collapsed'
const collapsedListeners = new Set<() => void>()

function subscribeCollapsed(listener: () => void) {
  collapsedListeners.add(listener)
  return () => {
    collapsedListeners.delete(listener)
  }
}

function getCollapsedSnapshot() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

interface SidebarProps {
  userName: string
  userEmail: string
}

export function Sidebar({ userName, userEmail }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const collapsed = useSyncExternalStore(
    subscribeCollapsed,
    getCollapsedSnapshot,
    () => false,
  )

  function toggleCollapsed() {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? '0' : '1')
    } catch {}
    collapsedListeners.forEach((l) => l())
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside
      className={[
        'bg-navy flex flex-col sticky top-0 h-screen shrink-0 transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-64',
      ].join(' ')}
    >
      {/* Logo + toggle */}
      <div
        className={[
          'flex items-center border-b border-white/10 py-6',
          collapsed ? 'flex-col gap-3 px-2 justify-center' : 'gap-2.5 px-5',
        ].join(' ')}
      >
        <School className="text-ocre shrink-0" size={24} />
        {!collapsed && (
          <span className="text-white text-lg font-bold tracking-tight flex-1">
            EscolarTime
          </span>
        )}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
          aria-label={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
          className="text-white/70 hover:text-white transition-colors cursor-pointer shrink-0"
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
            const isActive =
              href === '/dashboard'
                ? pathname === '/dashboard'
                : href === '/dashboard/constraints'
                ? pathname === '/dashboard/constraints' ||
                  (pathname.startsWith('/dashboard/constraints/') &&
                    !pathname.startsWith('/dashboard/constraints/rules'))
                : pathname.startsWith(href)

            return (
              <li key={href}>
                <Link
                  href={href}
                  title={collapsed ? label : undefined}
                  className={[
                    'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'text-ocre border-l-4 border-ocre bg-white/5 pl-2'
                      : 'text-white/80 hover:bg-white/10 hover:text-white border-l-4 border-transparent pl-2',
                  ].join(' ')}
                >
                  <Icon size={18} className="shrink-0" />
                  {!collapsed && <span className="truncate">{label}</span>}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Footer / User */}
      <div className={['border-t border-white/10 py-4', collapsed ? 'px-2' : 'px-4'].join(' ')}>
        {!collapsed && (
          <div className="mb-3">
            <p className="text-white text-sm font-medium truncate">{userName}</p>
            <p className="text-white/50 text-xs truncate">{userEmail}</p>
          </div>
        )}
        <button
          onClick={handleSignOut}
          title={collapsed ? `Sair (${userName})` : undefined}
          className={[
            'flex items-center gap-2 text-white/70 hover:text-white text-sm transition-colors w-full cursor-pointer',
            collapsed ? 'justify-center' : '',
          ].join(' ')}
        >
          <LogOut size={16} />
          {!collapsed && 'Sair'}
        </button>
      </div>
    </aside>
  )
}
