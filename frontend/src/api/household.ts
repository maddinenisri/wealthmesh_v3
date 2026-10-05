import { request } from './client'

export type Household = { id: string; name: string }
export type NameChange = { name: string; label: string | null; changedAt: string }
export type Member = {
  id: string
  householdId: string
  name: string
  label: string | null
  /** False once the member was removed: they leave new choices but keep ownership and history. */
  active: boolean
  /** Earlier names and labels, newest first. */
  nameHistory: NameChange[]
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null)
    throw new Error('Unexpected response from the server.')
  return value as Record<string, unknown>
}

function str(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Unexpected response from the server.')
  return value
}

function parseHousehold(value: unknown): Household {
  const data = record(value)
  return { id: str(data.id), name: str(data.name) }
}

function parseMember(value: unknown): Member {
  const data = record(value)
  return {
    id: str(data.id),
    householdId: str(data.householdId),
    name: str(data.name),
    label: data.label == null ? null : str(data.label),
    active: data.active !== false,
    nameHistory: Array.isArray(data.nameHistory) ? data.nameHistory.map(parseNameChange) : [],
  }
}

function parseNameChange(value: unknown): NameChange {
  const data = record(value)
  return {
    name: str(data.name),
    label: data.label == null ? null : str(data.label),
    changedAt: str(data.changedAt),
  }
}

function parseMembers(value: unknown): Member[] {
  if (!Array.isArray(value)) throw new Error('Unexpected response from the server.')
  return value.map(parseMember)
}

export const getHousehold = () => request('/household', { parse: parseHousehold })

export const createHousehold = (name: string) =>
  request('/household', { method: 'POST', body: { name }, parse: parseHousehold })

export const renameHousehold = (name: string) =>
  request('/household', { method: 'PUT', body: { name }, parse: parseHousehold })

export const listMembers = (householdId: string) =>
  request(`/household-members?householdId=${encodeURIComponent(householdId)}`, {
    parse: parseMembers,
  })

export const addMember = (householdId: string, name: string, label: string) =>
  request('/household-members', {
    method: 'POST',
    body: { householdId, name, label },
    parse: parseMember,
  })

export const updateMember = (id: string, name: string, label: string) =>
  request(`/household-members/${id}`, { method: 'PUT', body: { name, label }, parse: parseMember })

export const deactivateMember = (id: string) =>
  request(`/household-members/${id}/deactivate`, { method: 'POST', parse: parseMember })

export const restoreMember = (id: string) =>
  request(`/household-members/${id}/restore`, { method: 'POST', parse: parseMember })
