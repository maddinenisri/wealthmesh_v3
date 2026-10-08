import type { Account } from '../../api/accounts'
import type { Member } from '../../api/household'
import { isDebt, isValued, typeTraits } from './accountTypes'
import { formatMoney } from '../../lib/money'
import { balanceText } from './cardBalance'
import { memberLabel } from './ownerNames'

/** "Maya", "Maya and Sam", "Maya, Sam and Lee": the owners as a phrase, in the order the account lists them. */
function andList(names: string[]): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

const sameIds = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join()

/**
 * The sentence a plain Edit account ends with (Q-062): what was updated, and that the Balance did not move. An edit
 * changes details only, so it names the name it replaced, the new owners and the new institution, and says "no
 * changes" when nothing differs.
 */
export function editSentence(
  before: Account,
  after: Account,
  members: Member[] | undefined,
): string {
  const traits = typeTraits(after.type)
  const changes: string[] = []
  if (before.name !== after.name) changes.push(`It was ${before.name}.`)
  if (!sameIds(before.ownerMemberIds, after.ownerMemberIds)) {
    const names = after.ownerMemberIds.map((id) => {
      const member = members?.find((m) => m.id === id)
      return member ? memberLabel(member) : 'a member'
    })
    const label = traits.plan ? 'Participant' : after.ownerMemberIds.length > 1 ? 'Owners' : 'Owner'
    changes.push(`${label} ${label === 'Owners' ? 'are' : 'is'} now ${andList(names)}.`)
  }
  if ((before.institution ?? '') !== (after.institution ?? '') && traits.institutionLabel) {
    changes.push(`${traits.institutionLabel} is now ${after.institution || 'not set'}.`)
  }
  const word = traits.plan
    ? 'plan value'
    : isValued(after.type)
      ? 'value'
      : isDebt(after.type)
        ? 'Balance owed'
        : 'Balance'
  // A debt reads as the amount owed, the way its own page labels it ("Balance owed").
  const figure = isDebt(after.type)
    ? formatMoney(Math.abs(Number(after.balance.amount)))
    : balanceText(after.type, after.balance.amount)
  const unchanged = `Its ${word} of ${figure} is unchanged.`
  return changes.length === 0
    ? `${after.name} was saved with no changes. ${unchanged}`
    : `${after.name} was updated. ${changes.join(' ')} ${unchanged}`
}
