import type { Member } from '../../api/household'

/** "Maya (Parent)": the label tells members with the same name apart. */
export function memberLabel(member: Member): string {
  return member.label ? `${member.name} (${member.label})` : member.name
}

/** "Maya" or "Maya, Sam" for an account's owners; members not loaded yet are skipped. */
export function ownerNames(ownerMemberIds: string[], members: Member[] | undefined): string {
  return ownerMemberIds
    .map((id) => members?.find((member) => member.id === id))
    .filter((member): member is Member => member !== undefined)
    .map(memberLabel)
    .join(', ')
}
