import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Pencil, ShieldAlert, BookOpen, UserCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export default async function TeacherProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: teacher } = await supabase
    .from('teachers')
    .select('id, name, active')
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)
    .single()

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
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-ocre/10 rounded-lg p-2.5">
                <ShieldAlert className="w-5 h-5 text-ocre" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-navy">Restrições deste Professor</h2>
                <p className="text-slate text-sm mt-0.5">
                  Módulo de restrições em construção.
                </p>
              </div>
            </div>
            <Link
              href={`/dashboard/teachers/${teacher.id}/constraints`}
              aria-disabled
              className={cn(
                buttonVariants({ variant: 'outline', size: 'sm' }),
                'shrink-0 pointer-events-none opacity-50'
              )}
            >
              <ShieldAlert className="h-4 w-4" />
              Gerenciar Restrições
            </Link>
          </div>
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
              <p className="text-slate text-sm mt-0.5">
                Nenhuma atribuição ainda.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
