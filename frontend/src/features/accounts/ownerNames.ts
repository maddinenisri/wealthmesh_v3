import type { Member } from '../../api/household'

/** "Maya (Parent)": the label tells members with the same name apart; "Sam (inactive)" once removed. */
export function memberLabel(member: Member): string {
  const name = member.label ? `${member.name} (${member.label})` : member.name
  return member.active ? name : `${name} (inactive)`
}

/** "Maya" or "Maya, Sam" for an account's owners, in name order; members not loaded yet are skipped. */
export function ownerNames(ownerMemberIds: string[], members: Member[] | undefined): string {
  return ownerMemberIds
    .map((id) => members?.find((member) => member.id === id))
    .filter((member): member is Member => member !== undefined)
    .map(memberLabel)
    .sort((a, b) => a.localeCompare(b))
    .join(', ')
}
