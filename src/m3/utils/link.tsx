import {
  type AnchorHTMLAttributes,
  type ComponentType,
  createContext,
  type ReactNode,
  type Ref,
  useContext,
} from 'react'

export type LinkComponentProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string
  ref?: Ref<HTMLAnchorElement>
}

/** A component that renders a link; plug in a router link (e.g. React Router's `Link`). */
export type LinkComponent = ComponentType<LinkComponentProps> | 'a'

const LinkContext = createContext<LinkComponent>('a')

/** Makes every `href`-based M3 component (buttons, lists, navigation) render the given link. */
export function LinkProvider({
  component,
  children,
}: {
  component: LinkComponent
  children: ReactNode
}) {
  return <LinkContext.Provider value={component}>{children}</LinkContext.Provider>
}

export function useLinkComponent(): LinkComponent {
  return useContext(LinkContext)
}
