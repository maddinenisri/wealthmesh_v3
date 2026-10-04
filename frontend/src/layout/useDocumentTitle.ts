import { useEffect } from 'react'
import { useMatches } from 'react-router'
import { appName, type RouteHandle } from './navigation'

/** Sets the tab title from the deepest matched route that declares one. */
export function useDocumentTitle() {
  const matches = useMatches()
  const title = [...matches]
    .reverse()
    .map((match) => (match.handle as RouteHandle | undefined)?.title)
    .find(Boolean)

  useEffect(() => {
    document.title = title ? `${title} | ${appName}` : appName
  }, [title])
}
