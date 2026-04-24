'use client'

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
  Wand2,
  CalendarDays,
  School,
  LogOut,
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
  { label: 'Gerar Horário',  href: '/dashboard/generate',    icon: Wand2 },
  { label: 'Horários',       href: '/dashboard/schedules',   icon: CalendarDays },
]

interface SidebarProps {
  userName: string
  userEmail: string
}

export function Sidebar({ userName, userEmail }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="w-64 bg-navy flex flex-col sticky top-0 h-screen shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-6 border-b border-white/10">
        <School className="text-ocre shrink-0" size={24} />
        <span className="text-white text-lg font-bold tracking-tight">
          EscolarTime
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
            const isActive =
              href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname.startsWith(href)

            return (
              <li key={href}>
                <Link
                  href={href}
                  className={[
                    'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'text-ocre border-l-4 border-ocre bg-white/5 pl-2'
                      : 'text-white/80 hover:bg-white/10 hover:text-white border-l-4 border-transparent pl-2',
                  ].join(' ')}
                >
                  <Icon size={18} className="shrink-0" />
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Footer / User */}
      <div className="border-t border-white/10 px-4 py-4">
        <div className="mb-3">
          <p className="text-white text-sm font-medium truncate">{userName}</p>
          <p className="text-white/50 text-xs truncate">{userEmail}</p>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 text-white/70 hover:text-white text-sm transition-colors w-full cursor-pointer"
        >
          <LogOut size={16} />
          Sair
        </button>
      </div>
    </aside>
  )
}
