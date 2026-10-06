import { describe, expect, it } from 'vitest'
import type { Account } from '../../api/accounts'
import { usableAccounts } from './accountChoice'

const account = (id: string, type: string, status: string): Account => ({
  id,
  type,
  name: id,
  institution: null,
  ownerMemberIds: [],
  openedOn: '2026-09-01',
  openingAmount: '0.00',
  balance: { amount: '0.00', asOf: '2026-09-01' },
  status,
})

describe('usableAccounts', () => {
  const all = [
    account('a', 'checking', 'active'),
    account('b', 'savings', 'archived'),
    account('c', 'credit_card', 'closed'),
    account('d', 'brokerage', 'active'),
  ]

  it('V2_ACCOUNT_LIFECYCLE_001 leaves out archived, closed and not-yet-supported accounts', () => {
    expect(usableAccounts(all).map((a) => a.id)).toEqual(['a'])
  })

  it('V2_ACCOUNT_LIFECYCLE_003 keeps an account an edit already points at', () => {
    expect(usableAccounts(all, 'c').map((a) => a.id)).toEqual(['a', 'c'])
    expect(usableAccounts(undefined)).toEqual([])
  })
})
