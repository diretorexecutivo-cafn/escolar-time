'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ChevronDown,
  ChevronRight,
  UserPlus,
  RefreshCw,
  Trash2,
  Plus,
  Loader2,
  X,
  BookOpen,
} from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  assignTeacher,
  removeAssignment,
  addSubjectToClass,
  removeSubjectFromClass,
} from '@/app/(dashboard)/dashboard/assignments/actions'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

const SHIFT_LABELS: Record<string, string> = {
  MORNING: 'Matutino',
  AFTERNOON: 'Vespertino',
  EVENING: 'Noturno',
}

// Supabase can return a relation as object, array, or null depending on whether
// a unique constraint exists on the FK. toArray handles all three cases uniformly.
function toArray<T>(val: T | T[] | null | undefined): T[] {
  if (!val) return []
  if (Array.isArray(val)) return val
  return [val]
}

type RawTeacher = { id: string; name: string }
type RawSubject = { id: string; name: string; code: string; color: string }
type RawTeachingAssignment = {
  id: string
  teacher_id: string
  teachers: RawTeacher | null
}
type RawClassSubject = {
  id: string
  weekly_lessons: number
  allow_double_lesson: boolean
  subjects: RawSubject | null
  teaching_assignments: RawTeachingAssignment[]
}
type RawClassGroup = {
  id: string
  name: string
  shift: string
  year: number
  class_subjects: RawClassSubject[]
}

type Unit = { id: string; name: string }

// Normalize the raw Supabase payload into a consistent shape.
// Every relation field is passed through toArray so the rest of the component
// never has to deal with object-vs-array ambiguity.
function normalizeGroups(raw: unknown[] | null): RawClassGroup[] {
  return toArray(raw as unknown).map((g: unknown) => {
    const group = g as Record<string, unknown>
    return {
      id: group.id as string,
      name: group.name as string,
      shift: group.shift as string,
      year: group.year as number,
      class_subjects: toArray(group.class_subjects as unknown).map((cs: unknown) => {
        const s = cs as Record<string, unknown>
        // subjects is a to-one FK — still wrap with toArray then take [0]
        const subjectsArr = toArray(s.subjects as unknown)
        return {
          id: s.id as string,
          weekly_lessons: s.weekly_lessons as number,
          allow_double_lesson: s.allow_double_lesson as boolean,
          subjects: (subjectsArr[0] as RawSubject) ?? null,
          teaching_assignments: toArray(s.teaching_assignments as unknown).map((ta: unknown) => {
            const a = ta as Record<string, unknown>
            const teachersArr = toArray(a.teachers as unknown)
            return {
              id: a.id as string,
              teacher_id: a.teacher_id as string,
              teachers: (teachersArr[0] as RawTeacher) ?? null,
            }
          }),
        }
      }),
    }
  })
}

const SELECT_CLS = cn(
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm',
  'transition-colors outline-none focus-visible:border-ring disabled:opacity-50'
)

function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-navy">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate hover:text-navy transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

export function AssignmentsManager({ units }: { units: Unit[] }) {
  const [selectedUnitId, setSelectedUnitId] = useState('')
  const [classGroups, setClassGroups] = useState<RawClassGroup[]>([])
  const [allTeachers, setAllTeachers] = useState<RawTeacher[]>([])
  const [allSubjects, setAllSubjects] = useState<RawSubject[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // Assign teacher dialog
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignClassSubjectId, setAssignClassSubjectId] = useState('')
  const [assignCurrentTeacherId, setAssignCurrentTeacherId] = useState('')
  const [assignSelectedTeacherId, setAssignSelectedTeacherId] = useState('')
  const [assignPending, setAssignPending] = useState(false)

  // Add subject dialog
  const [addSubjectOpen, setAddSubjectOpen] = useState(false)
  const [addSubjectClassGroupId, setAddSubjectClassGroupId] = useState('')
  const [addSubjectSubjectId, setAddSubjectSubjectId] = useState('')
  const [addSubjectWeekly, setAddSubjectWeekly] = useState(2)
  const [addSubjectDouble, setAddSubjectDouble] = useState(false)
  const [addSubjectPending, setAddSubjectPending] = useState(false)

  // Inline remove tracking
  const [removingId, setRemovingId] = useState<string | null>(null)

  // silent=true skips the loading spinner — used for background reloads after actions
  // so the accordion content stays visible while fresh data replaces stale data
  const loadData = useCallback(async (unitId: string, silent = false) => {
    if (!silent) setLoading(true)
    const supabase = createClient()

    try {
      const [{ data: groups }, { data: teachers }, { data: subjects }] = await Promise.all([
        supabase
          .from('class_groups')
          .select(`
            id, name, shift, year,
            class_subjects (
              id, weekly_lessons, allow_double_lesson,
              subjects ( id, name, code, color ),
              teaching_assignments (
                id, teacher_id,
                teachers ( id, name )
              )
            )
          `)
          .eq('school_unit_id', unitId)
          .eq('tenant_id', TENANT_ID)
          .order('name'),
        supabase
          .from('teachers')
          .select('id, name')
          .eq('tenant_id', TENANT_ID)
          .eq('active', true)
          .order('name'),
        supabase
          .from('subjects')
          .select('id, name, code, color')
          .eq('tenant_id', TENANT_ID)
          .eq('active', true)
          .order('name'),
      ])

      setClassGroups(normalizeGroups(groups as unknown[] | null))
      setAllTeachers((teachers as unknown as RawTeacher[] | null) ?? [])
      setAllSubjects((subjects as unknown as RawSubject[] | null) ?? [])
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedUnitId) {
      loadData(selectedUnitId)
      setExpandedIds(new Set())
    }
  }, [selectedUnitId, loadData])

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openAssignDialog(classSubjectId: string, currentTeacherId: string) {
    setAssignClassSubjectId(classSubjectId)
    setAssignCurrentTeacherId(currentTeacherId)
    setAssignSelectedTeacherId(currentTeacherId)
    setAssignOpen(true)
  }

  function openAddSubjectDialog(classGroupId: string) {
    setAddSubjectClassGroupId(classGroupId)
    setAddSubjectSubjectId('')
    setAddSubjectWeekly(2)
    setAddSubjectDouble(false)
    setAddSubjectOpen(true)
  }

  async function handleAssignConfirm() {
    if (!assignSelectedTeacherId) return
    setAssignPending(true)
    const result = await assignTeacher(assignClassSubjectId, assignSelectedTeacherId)
    setAssignPending(false)
    if (!result.success) {
      toast.error(result.error ?? 'Erro ao atribuir professor.')
      return
    }
    await loadData(selectedUnitId, true)
    setAssignOpen(false)
    toast.success('Professor atribuído!')
  }

  async function handleRemoveAssignment(classSubjectId: string) {
    setRemovingId(classSubjectId)
    const result = await removeAssignment(classSubjectId)
    setRemovingId(null)
    if (!result.success) {
      toast.error(result.error ?? 'Erro ao remover atribuição.')
      return
    }
    await loadData(selectedUnitId, true)
    toast.success('Atribuição removida.')
  }

  async function handleRemoveSubject(classSubjectId: string) {
    setRemovingId(`subject-${classSubjectId}`)
    const result = await removeSubjectFromClass(classSubjectId)
    setRemovingId(null)
    if (!result.success) {
      toast.error(result.error ?? 'Erro ao remover disciplina.')
      return
    }
    await loadData(selectedUnitId, true)
    toast.success('Disciplina removida da turma.')
  }

  async function handleAddSubjectConfirm() {
    if (!addSubjectSubjectId) return
    setAddSubjectPending(true)
    const result = await addSubjectToClass(
      addSubjectClassGroupId,
      addSubjectSubjectId,
      addSubjectWeekly,
      addSubjectDouble
    )
    setAddSubjectPending(false)
    if (!result.success) {
      toast.error(result.error ?? 'Erro ao adicionar disciplina.')
      return
    }
    await loadData(selectedUnitId, true)
    setAddSubjectOpen(false)
    toast.success('Disciplina adicionada!')
  }

  // Progress counters
  const totalSubjects = classGroups.reduce((acc, g) => acc + (g.class_subjects?.length ?? 0), 0)
  const assignedSubjects = classGroups.reduce(
    (acc, g) =>
      acc +
      (g.class_subjects ?? []).filter((cs) => (cs.teaching_assignments?.length ?? 0) > 0).length,
    0
  )
  const allAssigned = totalSubjects > 0 && assignedSubjects === totalSubjects
  const progressPct = totalSubjects > 0 ? Math.round((assignedSubjects / totalSubjects) * 100) : 0

  // Subjects not yet added to the target class group (for add dialog)
  const existingSubjectIds = new Set(
    (classGroups.find((g) => g.id === addSubjectClassGroupId)?.class_subjects ?? [])
      .map((cs) => cs.subjects?.id ?? '')
      .filter(Boolean)
  )
  const availableSubjects = allSubjects.filter((s) => !existingSubjectIds.has(s.id))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-navy">Atribuições</h1>
        <p className="text-slate text-sm mt-1">
          Vincule professores às disciplinas de cada turma.
        </p>
      </div>

      {/* Unit selector */}
      <div className="max-w-sm space-y-1.5">
        <Label htmlFor="unit-select">Unidade Escolar</Label>
        <select
          id="unit-select"
          value={selectedUnitId}
          onChange={(e) => setSelectedUnitId(e.target.value)}
          className={SELECT_CLS}
        >
          <option value="">Selecione uma unidade…</option>
          {units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </select>
      </div>

      {/* Content area */}
      {!selectedUnitId ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate gap-3">
          <BookOpen className="h-10 w-10 opacity-30" />
          <p className="text-sm">
            Selecione uma unidade escolar para gerenciar as atribuições.
          </p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-navy" />
        </div>
      ) : (
        <>
          {/* Progress bar */}
          {totalSubjects > 0 && (
            <div className="space-y-2 p-4 rounded-lg border border-border bg-white shadow-sm">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate">Professores atribuídos</span>
                <span className={cn('font-semibold', allAssigned ? 'text-ocre' : 'text-navy')}>
                  {allAssigned
                    ? 'Todas as disciplinas têm professor'
                    : `${assignedSubjects} de ${totalSubjects} disciplinas`}
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    allAssigned ? 'bg-ocre' : 'bg-navy'
                  )}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {/* Class group accordion list */}
          {classGroups.length === 0 ? (
            <div className="text-center py-12 text-slate text-sm">
              Nenhuma turma cadastrada nesta unidade.
            </div>
          ) : (
            <div className="space-y-3">
              {classGroups.map((group) => {
                const isExpanded = expandedIds.has(group.id)
                const subjectCount = group.class_subjects?.length ?? 0
                const assignedCount = (group.class_subjects ?? []).filter(
                  (cs) => (cs.teaching_assignments?.length ?? 0) > 0
                ).length

                return (
                  <div
                    key={group.id}
                    className="rounded-lg border border-border bg-white shadow-sm overflow-hidden"
                  >
                    {/* Accordion header */}
                    <button
                      type="button"
                      onClick={() => toggleExpanded(group.id)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-navy shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate shrink-0" />
                        )}
                        <div>
                          <span className="font-semibold text-navy">{group.name}</span>
                          <span className="ml-2 text-sm text-slate">
                            {SHIFT_LABELS[group.shift] ?? group.shift} · {group.year}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-slate">
                          {assignedCount}/{subjectCount} atribuídas
                        </span>
                        {subjectCount > 0 && assignedCount === subjectCount && (
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-xs">
                            Completa
                          </Badge>
                        )}
                      </div>
                    </button>

                    {/* Accordion body */}
                    {isExpanded && (
                      <div className="border-t border-border">
                        {(group.class_subjects?.length ?? 0) === 0 ? (
                          <div className="px-4 py-6 text-center text-slate text-sm">
                            Nenhuma disciplina adicionada a esta turma.
                          </div>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-gray-50">
                                <TableHead className="font-semibold text-navy">Disciplina</TableHead>
                                <TableHead className="font-semibold text-navy">Aulas/sem.</TableHead>
                                <TableHead className="font-semibold text-navy">
                                  Professor atribuído
                                </TableHead>
                                <TableHead className="font-semibold text-navy text-right">
                                  Ações
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(group.class_subjects ?? []).map((cs) => {
                                // subjects is a to-one relation → object, not array
                                const subject = cs.subjects
                                // teaching_assignments is one-to-many; at most one per class_subject
                                const assignment = cs.teaching_assignments?.[0] ?? null
                                // teachers is a to-one relation → object, not array
                                const teacher = assignment?.teachers ?? null
                                const isRemovingSubject = removingId === `subject-${cs.id}`
                                const isRemovingAssignment = removingId === cs.id

                                return (
                                  <TableRow key={cs.id} className="hover:bg-gray-50/50">
                                    <TableCell>
                                      <div className="flex items-center gap-2">
                                        {subject?.color && (
                                          <span
                                            className="w-3 h-3 rounded-full shrink-0 border border-black/10"
                                            style={{ backgroundColor: subject.color }}
                                          />
                                        )}
                                        <span className="font-medium text-navy">
                                          {subject?.name ?? '—'}
                                        </span>
                                        {cs.allow_double_lesson && (
                                          <span className="text-xs text-slate bg-gray-100 px-1.5 py-0.5 rounded">
                                            dupla
                                          </span>
                                        )}
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-slate">
                                      {cs.weekly_lessons}×
                                    </TableCell>
                                    <TableCell>
                                      {teacher ? (
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-sm text-navy">{teacher.name}</span>
                                          <button
                                            type="button"
                                            onClick={() => handleRemoveAssignment(cs.id)}
                                            disabled={isRemovingAssignment}
                                            title="Remover atribuição"
                                            className="text-slate hover:text-red-500 transition-colors disabled:opacity-50"
                                          >
                                            {isRemovingAssignment ? (
                                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                              <X className="h-3.5 w-3.5" />
                                            )}
                                          </button>
                                        </div>
                                      ) : (
                                        <Badge className="bg-red-100 text-red-600 hover:bg-red-100 text-xs">
                                          Sem professor
                                        </Badge>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <div className="flex items-center justify-end gap-1">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            openAssignDialog(cs.id, teacher?.id ?? '')
                                          }
                                          title={teacher ? 'Trocar professor' : 'Atribuir professor'}
                                          className={cn(
                                            'flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors',
                                            teacher
                                              ? 'text-slate hover:text-navy hover:bg-gray-100'
                                              : 'text-navy bg-navy/10 hover:bg-navy/20'
                                          )}
                                        >
                                          {teacher ? (
                                            <RefreshCw className="h-3.5 w-3.5" />
                                          ) : (
                                            <UserPlus className="h-3.5 w-3.5" />
                                          )}
                                          <span>{teacher ? 'Trocar' : 'Atribuir'}</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveSubject(cs.id)}
                                          disabled={isRemovingSubject}
                                          title="Remover disciplina da turma"
                                          className="p-1 text-slate hover:text-red-500 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
                                        >
                                          {isRemovingSubject ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                          ) : (
                                            <Trash2 className="h-3.5 w-3.5" />
                                          )}
                                        </button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                )
                              })}
                            </TableBody>
                          </Table>
                        )}

                        {/* Add subject button */}
                        <div className="px-4 py-3 border-t border-border/60">
                          <button
                            type="button"
                            onClick={() => openAddSubjectDialog(group.id)}
                            className="flex items-center gap-1.5 text-sm text-navy hover:text-ocre transition-colors"
                          >
                            <Plus className="h-4 w-4" />
                            Adicionar Disciplina
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Assign / Trocar Professor Dialog */}
      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title={assignCurrentTeacherId ? 'Trocar Professor' : 'Atribuir Professor'}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="assign-teacher">Professor</Label>
            <select
              id="assign-teacher"
              value={assignSelectedTeacherId}
              onChange={(e) => setAssignSelectedTeacherId(e.target.value)}
              className={SELECT_CLS}
            >
              <option value="">Selecione um professor…</option>
              {allTeachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAssignOpen(false)}
              className="flex-1 cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!assignSelectedTeacherId || assignPending}
              onClick={handleAssignConfirm}
              className="flex-1 bg-navy hover:bg-navy-light text-white cursor-pointer"
            >
              {assignPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add Subject to Class Dialog */}
      <Modal
        open={addSubjectOpen}
        onClose={() => setAddSubjectOpen(false)}
        title="Adicionar Disciplina à Turma"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="add-subject">Disciplina</Label>
            <select
              id="add-subject"
              value={addSubjectSubjectId}
              onChange={(e) => setAddSubjectSubjectId(e.target.value)}
              className={SELECT_CLS}
              disabled={availableSubjects.length === 0}
            >
              <option value="">Selecione uma disciplina…</option>
              {availableSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
            {availableSubjects.length === 0 && (
              <p className="text-xs text-slate">
                Todas as disciplinas já foram adicionadas a esta turma.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="weekly-lessons">Aulas por semana</Label>
            <Input
              id="weekly-lessons"
              type="number"
              min={1}
              max={10}
              value={addSubjectWeekly}
              onChange={(e) => setAddSubjectWeekly(Number(e.target.value))}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="allow-double"
              type="checkbox"
              checked={addSubjectDouble}
              onChange={(e) => setAddSubjectDouble(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="allow-double" className="cursor-pointer font-normal">
              Permitir aulas duplas
            </Label>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddSubjectOpen(false)}
              className="flex-1 cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!addSubjectSubjectId || addSubjectPending}
              onClick={handleAddSubjectConfirm}
              className="flex-1 bg-navy hover:bg-navy-light text-white cursor-pointer"
            >
              {addSubjectPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Adicionar'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
