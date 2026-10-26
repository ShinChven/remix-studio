import { createContext, type ReactNode, useContext } from 'react'
import { createPortal } from 'react-dom'
import { useIsClient } from './hooks'

const PortalContainerContext = createContext<HTMLElement | null>(null)

/** Sends portals rendered below it into `container` (used by `ThemeScope`). */
export function PortalContainerProvider({
  container,
  children,
}: {
  container: HTMLElement | null
  children: ReactNode
}) {
  return (
    <PortalContainerContext.Provider value={container}>{children}</PortalContainerContext.Provider>
  )
}

/** Renders children into `document.body` (or the nearest portal container). SSR-safe. */
export function Portal({
  children,
  container,
}: {
  children: ReactNode
  container?: HTMLElement | null
}) {
  const isClient = useIsClient()
  const contextContainer = useContext(PortalContainerContext)
  if (!isClient) return null
  return createPortal(children, container ?? contextContainer ?? document.body)
}
