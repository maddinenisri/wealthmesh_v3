import { useCallback, useSyncExternalStore } from 'react'
import type { Member } from '../api/household'

const STORAGE_KEY = 'wealthmesh.enteringAs'
const CHANGED = 'wealthmesh:entering-as'

function read(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(CHANGED, onChange)
    window.removeEventListener('storage', onChange)
  }
}

/**
 * Who is entering records in this browser (D-025). A history note, not a sign-in: it is remembered
 * per browser and sent with each save. Returns the member only while they still exist.
 */
export function useEnteringAs(members: Member[] | undefined) {
  const stored = useSyncExternalStore(subscribe, read, () => '')
  const setMemberId = useCallback((id: string) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, id)
    } catch {
      // Storage can be blocked; the choice then lasts until the page reloads.
    }
    window.dispatchEvent(new Event(CHANGED))
  }, [])
  const member = members?.find((candidate) => candidate.id === stored)
  return { member, setMemberId }
}
