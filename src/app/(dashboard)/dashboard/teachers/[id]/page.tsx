import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  AlarmCheck,
  AlarmClock,
  AlignJustify,
  ArrowLeftRight,
  Ban,
  BookOpen,
  Building2,
  CalendarCheck,
  CalendarX,
  Clock,
  GripVertical,
  Hash,
  Layers,
  Pencil,
  Plus,
  Settings,
  ShieldAlert,
  UserCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

// ─── Constraint meta ──────────────────────────────────────────────────────────

const CONSTRAINT_META: Record<string, { label: string; icon: React.ElementType; iconColor: string }> = {
  UNAVAILABLE_SLOT:       { label: 'Indisponível em Slot',    icon: Ban,            iconColor: 'text-red-500' },
  UNAVAILABLE_PERIOD:     { label: 'Indisponível no Período', icon: Clock,          iconColor: 'text-red-400' },
  MUST_START_AFTER:       { label: 'Começa a Partir de',      icon: AlarmClock,     iconColor: 'text-amber-500' },
  MUST_END_BEFORE:        { label: 'Termina Até',             icon: AlarmCheck,     iconColor: 'text-amber-500' },
  MAX_CONSECUTIVE:        { label: 'Máx. Consecutivas',       icon: Layers,         iconColor: 'text-navy' },
  MIN_GAP_BETWEEN_UNITS:  { label: 'Gap entre Unidades',      icon: ArrowLeftRight, iconColor: 'text-navy' },
  PREFER_SINGLE_UNIT_DAY: { label: 'Uma Unidade por Dia',     icon: Building2,      iconColor: 'text-teal' },
  MAX_LESSONS_PER_DAY:    { label: 'Máx. Aulas por Dia',      icon: Hash,           iconColor: 'text-navy' },
  NO_IDLE_GAPS:           { label: 'Sem Janelas Livres',      icon: AlignJustify,   iconColor: 'text-slate' },
  PREFER_CONSECUTIVE:     { label: 'Preferir Consecutivas',   icon: GripVertical,   iconColor: 'text-teal' },
  FIXED_DAY:              { label: 'Dia Fixo',                icon: CalendarCheck,  iconColor: 'text-emerald-600' },
  AVOID_DAY:              { label: 'Evitar Dia',              icon: CalendarX,      iconColor: 'text-red-400' },
  CUSTOM:                 { label: 'Regra Customizada',       icon: Settings,       iconColor: 'text-slate' },
}

const DAY_LABELS: Record<number, string> = {
  1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb',
}

export default async function TeacherProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: teacher }, { data: constraints }] = await Promise.all([
    supabase
      .from('teachers')
      .select('id, name, active')
      .eq('id', id)
      .eq('tenant_id', TENANT_ID)
      .single(),
    supabase
      .from('teacher_constraints')
      .select('id, type, priority, days_of_week, description, active, value, time_from, time_to, slot_order, min_gap_slots')
      .eq('teacher_id', id)
      .eq('tenant_id', TENANT_ID)
      .eq('active', true)
      .order('created_at', { ascending: false }),
  ])

  if (!teacher) notFound()

  return (
    <div className="max-w-2xl space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate">
        <Link href="/dashboard/teachers" className="hover:text-navy transition-colors">
          Professores
        </Link>
        <span>/</span>
        <span className="text-navy font-medium">{teacher.name}</span>
      </div>

      {/* Card de dados */}
      <Card className="border border-border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-navy/10 rounded-full p-3">
                <UserCircle className="w-8 h-8 text-navy" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-navy">{teacher.name}</h1>
                <Badge
                  className={
                    teacher.active
                      ? 'bg-emerald-100 text-emerald-700 border-emerald-200 mt-1'
                      : 'bg-gray-100 text-gray-500 border-gray-200 mt-1'
                  }
                >
                  {teacher.active ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>
            </div>
            <Link
              href={`/dashboard/teachers/${teacher.id}/edit`}
              className={cn(
                buttonVariants({ variant: 'outline', size: 'sm' }),
                'shrink-0 cursor-pointer'
              )}
            >
              <Pencil className="h-4 w-4" />
              Editar Dados
            </Link>
          </div>
        </CardHeader>
      </Card>

      {/* Restrições */}
      <Card className="border border-border shadow-sm">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-ocre/10 rounded-lg p-2.5">
                <ShieldAlert className="w-5 h-5 text-ocre" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-navy">Restrições</h2>
                <p className="text-slate text-sm mt-0.5">
                  {(constraints ?? []).length === 0
                    ? 'Nenhuma restrição ativa.'
                    : `${(constraints ?? []).length} restrição${(constraints ?? []).length !== 1 ? 'ões' : ''} ativa${(constraints ?? []).length !== 1 ? 's' : ''}`}
                </p>
              </div>
            </div>
            <Link
              href={`/dashboard/constraints/new?teacherId=${teacher.id}`}
              className={cn(
                buttonVariants({ variant: 'outline', size: 'sm' }),
                'shrink-0 cursor-pointer gap-1.5'
              )}
            >
              <Plus className="h-4 w-4" />
              Adicionar
            </Link>
          </div>

          {/* Lista de restrições ativas */}
          {(constraints ?? []).length > 0 && (
            <div className="space-y-2">
              {(constraints ?? []).map((c) => {
                const meta = CONSTRAINT_META[c.type] ?? CONSTRAINT_META.CUSTOM
                const Icon = meta.icon
                const isMandatory = c.priority === 'MANDATORY'
                const days = (c.days_of_week ?? []) as number[]

                return (
                  <div
                    key={c.id}
                    className="flex items-start gap-3 p-3 rounded-lg border border-border bg-gray-50/50"
                  >
                    <div className="shrink-0 p-1.5 rounded-md bg-white border border-border mt-0.5">
                      <Icon className={cn('h-3.5 w-3.5', meta.iconColor)} />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-navy">{meta.label}</span>
                        <Badge
                          className={
                            isMandatory
                              ? 'bg-red-100 text-red-700 border-red-200 text-xs py-0'
                              : 'bg-amber-100 text-amber-700 border-amber-200 text-xs py-0'
                          }
                        >
                          {isMandatory ? 'Obrigatória' : 'Preferencial'}
                        </Badge>
                      </div>
                      {c.description && (
                        <p className="text-xs text-slate leading-relaxed">{c.description}</p>
                      )}
                      {days.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {days.sort().map((day) => (
                            <span
                              key={day}
                              className="text-xs px-1.5 py-0.5 rounded bg-navy/10 text-navy font-medium"
                            >
                              {DAY_LABELS[day] ?? day}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              <div className="pt-1">
                <Link
                  href="/dashboard/constraints"
                  className="text-xs text-navy hover:underline font-medium"
                >
                  Gerenciar todas as restrições →
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Atribuições */}
      <Card className="border border-border shadow-sm">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="bg-teal/10 rounded-lg p-2.5">
              <BookOpen className="w-5 h-5 text-teal" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-navy">Disciplinas e Turmas</h2>
              <p className="text-slate text-sm mt-0.5">Nenhuma atribuição ainda.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
