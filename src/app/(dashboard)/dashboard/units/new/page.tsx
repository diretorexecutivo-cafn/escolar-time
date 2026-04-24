import { UnitForm } from '@/components/units/unit-form'

export default function NewUnitPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Nova Unidade Escolar</h1>
        <p className="text-slate text-sm mt-1">Preencha os dados da nova unidade.</p>
      </div>
      <UnitForm />
    </div>
  )
}
