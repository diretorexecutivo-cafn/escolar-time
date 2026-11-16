import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | undefined

function getAdminClient() {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }

  return client
}

// Use apenas em Server Actions e API Routes — nunca exponha ao cliente.
// A criação é adiada até o primeiro uso para que rotas da API possam ser
// avaliadas durante o build sem exigir a service-role key naquele estágio.
export const adminSupabase = new Proxy({} as SupabaseClient, {
  get(_target, property, receiver) {
    const activeClient = getAdminClient()
    const value = Reflect.get(activeClient, property, receiver)

    return typeof value === 'function' ? value.bind(activeClient) : value
  },
})

/**
 * Cliente service-role que identifica quem está agindo. O trigger de auditoria
 * (migration 008) não enxerga auth.uid() em gravações feitas com a service-role
 * key; o cabeçalho x-actor-id diz ao histórico qual usuário fez a alteração.
 */
export function adminSupabaseAs(actorId: string): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'x-actor-id': actorId } },
    }
  )
}
