import type { Account } from '../../api/accounts'
import type { WealthGroup, WealthLine } from '../../api/wealth'

/**
 * The accounts a wealth group lists: the ones the server counted in it. The server decides group membership once
 * (`AccountType.groups`), so the Household page never repeats that rule by type.
 */
export function accountsIn(accounts: Account[], group: WealthGroup | undefined): Account[] {
  if (!group) return []
  const counted = new Set(group.accounts.map((line) => line.accountId))
  return accounts.filter((account) => counted.has(account.id))
}

/** The names the server gives the overlapping groups (D-067), as the page titles them. */
const OVERLAP_TITLE: Record<string, string> = {
  investments: 'Investments',
  retirement: 'Retirement',
  healthSavings: 'Health savings',
}

/** The other groups that list a line, for "Also in Retirement": the server decides, the page only reads. */
export function alsoIn(line: WealthLine | undefined, key: string): string[] {
  return (line?.groups ?? []).filter((group) => group !== key).map((g) => OVERLAP_TITLE[g] ?? g)
}

/** "A and B" / "A, B and C": the names of the accounts that two groups list together. */
function joined(names: string[]): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/**
 * The sentence that explains an overlap (WEALTH_002): which accounts of `group` are also in `other`. A group total is
 * a view and is never added again to financial assets or net worth.
 */
export function overlapNote(
  group: WealthGroup | undefined,
  groupKey: string,
  other: string,
): string | undefined {
  const shared = (group?.accounts ?? []).filter((line) => line.groups.includes(other))
  if (shared.length === 0) return undefined
  const verb = shared.length === 1 ? 'appears' : 'appear'
  const [first, second] = [groupKey, other].sort(
    (x, y) => Object.keys(OVERLAP_TITLE).indexOf(x) - Object.keys(OVERLAP_TITLE).indexOf(y),
  )
  // A long household lists three names and a count, so the sentence stays readable.
  const names = shared.map((line) => line.name)
  const listed = names.length > 4 ? [...names.slice(0, 3), `${names.length - 3} more`] : names
  return `${joined(listed)} ${verb} in both ${OVERLAP_TITLE[first]} and ${OVERLAP_TITLE[second]}.`
}

/** The overlap sentences of one group against the others, with the rule that a group total is a view. */
export function overlapText(
  group: WealthGroup | undefined,
  groupKey: string,
  others: string[],
): string | undefined {
  const sentences = others.map((other) => overlapNote(group, groupKey, other)).filter(Boolean)
  if (sentences.length === 0) return undefined
  return `${sentences.join(' ')} A group total is a view and is not added again to financial assets or net worth.`
}
