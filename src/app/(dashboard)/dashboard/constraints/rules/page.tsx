import { createClient } from '@/lib/supabase/server'
import { GlobalRulesConfig } from '@/components/rules/global-rules-config'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export default async function GlobalRulesPage() {
  const supabase = await createClient()

  const { data: rules } = await supabase
    .from('global_rules')
    .select('id, type, priority, weight, params, description, active')
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false })

  return <GlobalRulesConfig rules={rules ?? []} />
}
