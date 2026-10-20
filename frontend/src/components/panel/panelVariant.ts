import { createContext, useContext } from 'react'

/** Which panel a page renders in: the Super Admin reference uses a breadcrumb header instead of a hero. */
export type PanelVariant = 'owner' | 'admin'

const PanelVariantContext = createContext<PanelVariant>('owner')

export const PanelVariantProvider = PanelVariantContext.Provider

export function usePanelVariant() {
  return useContext(PanelVariantContext)
}
