import { createClient } from '@supabase/supabase-js'

// Use apenas em Server Actions e API Routes — nunca exponha ao cliente
export const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
