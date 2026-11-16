import { NextResponse } from 'next/server'

import { getSessionProfile, READ_ONLY_ERROR, type SessionProfile } from './session'
import { canEdit } from './roles'

/**
 * Para rotas de API que gravam dados. Elas usam a service-role key, que ignora a
 * RLS — então o papel precisa ser conferido aqui: Visualizador recebe 403.
 */
export async function requireEditor(): Promise<
  { ok: true; user: SessionProfile } | { ok: false; response: NextResponse }
> {
  const user = await getSessionProfile()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) }
  }
  if (!canEdit(user.role)) {
    return { ok: false, response: NextResponse.json({ error: READ_ONLY_ERROR }, { status: 403 }) }
  }
  return { ok: true, user }
}
