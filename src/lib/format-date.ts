// Datas sempre no fuso da escola: o servidor (Coolify) roda em UTC, e a página
// é renderizada no servidor e no navegador — o fuso fixo evita divergência.
const dateTime = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const dayKey = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const longDay = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
})

const time = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
})

/** 16/11/2026, 14:05 */
export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso))
}

/** 14:05 */
export function formatTime(iso: string): string {
  return time.format(new Date(iso))
}

/** AAAA-MM-DD no fuso da escola (para agrupar por dia). */
export function schoolDayKey(iso: string): string {
  return dayKey.format(new Date(iso))
}

/** segunda-feira, 16 de novembro de 2026 */
export function formatLongDay(iso: string): string {
  return longDay.format(new Date(iso))
}
