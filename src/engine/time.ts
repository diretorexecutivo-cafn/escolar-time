// Choque de professor é medido por SOBREPOSIÇÃO DE HORÁRIO REAL, não pelo número da aula:
// cada turma tem a própria grade, então a "3ª aula" de uma pode começar 11:00 e a de outra
// 11:30 — o mesmo professor nas duas é bilocação. Módulo puro (sem dependências), usado pelo
// solver, pelo otimizador, pelo validador e pela tela "Por Horário".

import type { EngineInput } from './types'

/** Intervalo semiaberto [start, end) em minutos desde 00:00. */
export interface Interval {
  start: number
  end: number
}

/** "HH:MM" ou "HH:MM:SS" → minutos desde 00:00. */
export function toMinutes(time: string): number {
  const [h, m] = time.split(':')
  return parseInt(h ?? '0', 10) * 60 + parseInt(m ?? '0', 10)
}

/** Normaliza "HH:MM:SS" → "HH:MM" (o banco devolve com segundos). */
export function normalizeTime(time: string): string {
  return time.slice(0, 5)
}

/** Aulas que apenas encostam (uma termina 11:50, outra começa 11:50) não se sobrepõem. */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end
}

const slotTimeCache = new WeakMap<EngineInput, Map<string, Interval>>()

/** slotId → intervalo, para todas as grades do input (slotIds são únicos). */
export function slotTimeIndex(input: EngineInput): Map<string, Interval> {
  const cached = slotTimeCache.get(input)
  if (cached) return cached
  const m = new Map<string, Interval>()
  for (const cg of input.classGroups) {
    for (const slots of Object.values(cg.timeGrid?.slotsByDay ?? {})) {
      for (const s of slots) {
        m.set(s.id, { start: toMinutes(s.startTime), end: toMinutes(s.endTime) })
      }
    }
  }
  slotTimeCache.set(input, m)
  return m
}

export interface TimedItem<T> {
  teacherId: string
  day: number
  interval: Interval
  /** Itens com o mesmo owner são a mesma aula (ex.: aula agrupada) e nunca chocam entre si. */
  owner: string
  item: T
}

/**
 * Agrupa as aulas de cada professor/dia em blocos de horários que se sobrepõem e devolve
 * os blocos que envolvem mais de uma aula distinta (owners diferentes) — cada um é um choque.
 *
 * Em todo bloco devolvido existe de fato um par de aulas distintas que se sobrepõem: o
 * primeiro item de um novo owner só entra no bloco se sobrepuser um item anterior, e até
 * ali todos os anteriores eram do mesmo owner.
 */
export function findTeacherClashes<T>(items: TimedItem<T>[]): TimedItem<T>[][] {
  const byTeacherDay = new Map<string, TimedItem<T>[]>()
  for (const it of items) {
    const k = `${it.teacherId}|${it.day}`
    const arr = byTeacherDay.get(k)
    if (arr) arr.push(it)
    else byTeacherDay.set(k, [it])
  }

  const clashes: TimedItem<T>[][] = []
  for (const list of byTeacherDay.values()) {
    if (list.length < 2) continue
    list.sort((a, b) => a.interval.start - b.interval.start || a.interval.end - b.interval.end)
    let cluster: TimedItem<T>[] = [list[0]!]
    let maxEnd = list[0]!.interval.end
    const flush = () => {
      if (new Set(cluster.map((c) => c.owner)).size > 1) clashes.push(cluster)
    }
    for (let i = 1; i < list.length; i++) {
      const it = list[i]!
      if (it.interval.start < maxEnd) {
        cluster.push(it)
        maxEnd = Math.max(maxEnd, it.interval.end)
      } else {
        flush()
        cluster = [it]
        maxEnd = it.interval.end
      }
    }
    flush()
  }
  return clashes
}

/** true se houver qualquer choque — versão rápida para o otimizador. */
export function hasTeacherClash<T>(items: TimedItem<T>[]): boolean {
  return findTeacherClashes(items).length > 0
}

/**
 * Rotina conduzida pela professora regente: cada slot ROUTINE da grade de uma turma que
 * tem regente ocupa a regente naquele dia/horário — ela não pode dar aula em outra turma.
 */
export interface RoutineDuty {
  teacherId: string
  classGroupId: string
  className: string
  day: number
  slotId: string
  slotOrder: number
  label: string
  startTime: string
  endTime: string
  interval: Interval
}

const dutyCache = new WeakMap<EngineInput, Map<string, RoutineDuty[]>>()

/** Rotinas por "teacherId|day". */
export function routineDutiesByTeacherDay(input: EngineInput): Map<string, RoutineDuty[]> {
  const cached = dutyCache.get(input)
  if (cached) return cached
  const m = new Map<string, RoutineDuty[]>()
  for (const cg of input.classGroups) {
    const teacherId = cg.homeroomTeacherId
    if (!teacherId) continue
    for (const [dayStr, slots] of Object.entries(cg.timeGrid?.slotsByDay ?? {})) {
      const day = Number(dayStr)
      for (const s of slots) {
        if (s.type !== 'ROUTINE') continue
        const duty: RoutineDuty = {
          teacherId,
          classGroupId: cg.id,
          className: cg.name,
          day,
          slotId: s.id,
          slotOrder: s.order,
          label: s.label || 'Rotina',
          startTime: s.startTime,
          endTime: s.endTime,
          interval: { start: toMinutes(s.startTime), end: toMinutes(s.endTime) },
        }
        const k = `${teacherId}|${day}`
        const arr = m.get(k)
        if (arr) arr.push(duty)
        else m.set(k, [duty])
      }
    }
  }
  dutyCache.set(input, m)
  return m
}

/** Rotina da regente que se sobrepõe ao intervalo dado (ou undefined). */
export function routineDutyAt(
  input: EngineInput,
  teacherId: string,
  day: number,
  interval: Interval
): RoutineDuty | undefined {
  return routineDutiesByTeacherDay(input)
    .get(`${teacherId}|${day}`)
    ?.find((d) => overlaps(d.interval, interval))
}
