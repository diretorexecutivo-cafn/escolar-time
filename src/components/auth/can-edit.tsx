'use client'

import { createContext, useContext } from 'react'

// Se o usuário logado pode criar, editar e excluir (ADMIN/COORDINATOR). Visualizador
// só consulta: as telas escondem os controles de edição. A proteção de verdade
// fica no servidor (server actions, rotas de API e RLS); isto é só a interface.
const CanEditContext = createContext(false)

export function CanEditProvider({
  canEdit,
  children,
}: {
  canEdit: boolean
  children: React.ReactNode
}) {
  return <CanEditContext.Provider value={canEdit}>{children}</CanEditContext.Provider>
}

export function useCanEdit(): boolean {
  return useContext(CanEditContext)
}
