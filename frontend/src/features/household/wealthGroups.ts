import type { Account } from '../../api/accounts'
import type { WealthGroup } from '../../api/wealth'

/**
 * The accounts a wealth group lists: the ones the server counted in it. The server decides group membership once
 * (`AccountType.groups`), so the Household page never repeats that rule by type.
 */
export function accountsIn(accounts: Account[], group: WealthGroup | undefined): Account[] {
  if (!group) return []
  const counted = new Set(group.accounts.map((line) => line.accountId))
  return accounts.filter((account) => counted.has(account.id))
}
