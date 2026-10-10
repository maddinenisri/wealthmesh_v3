import { request } from './client'
import { parseAccount, type NewAccount } from './accounts'

const bad = () => new Error('Unexpected response from the server.')

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw bad()
  return value as Record<string, unknown>
}

function str(value: unknown): string {
  if (typeof value !== 'string') throw bad()
  return value
}

const strOrNull = (value: unknown) => (value == null ? null : str(value))

/** One holding line as the server keeps it: `value` is shares x price to the cent. */
export type HoldingLine = {
  symbol: string
  quantity: string
  price: string
  value: string
  valueOn: string
  /** The purchase cost of this line's shares, or null when it is not known. */
  cost: string | null
  /** Value minus cost, or null while the cost is not known. */
  gain: string | null
}

/**
 * The review of an opening before it is saved. `complete` saves an active account, `draft` (cash not answered) keeps a
 * draft, `mismatch` cannot be saved (the typed total differs from cash plus holdings).
 */
export type OpeningPreview = {
  state: 'complete' | 'draft' | 'mismatch'
  canSave: boolean
  cash: string | null
  holdingsValue: string
  calculatedBalance: string | null
  openingTotal: string | null
  difference: string | null
  missing: string[]
  message: string | null
  holdings: HoldingLine[]
}

/** What an investment account was opened with. */
export type OpeningView = {
  total: string | null
  cash: string | null
  holdingsValue: string
  noStartingAmount: boolean
  holdings: HoldingLine[]
  statementId: string | null
  statementRemoved: boolean
}

/**
 * One security in an account, its lines added together. `cost` and `gain` are null unless every share has a known
 * cost; the `known*` figures are for the shares whose cost is known. `price` is null when its lines differ.
 */
export type Security = {
  symbol: string
  shares: string
  price: string | null
  priceOn: string
  value: string
  knownShares: string
  knownValue: string | null
  knownCost: string | null
  knownGain: string | null
  coverage: string
  cost: string | null
  gain: string | null
  /** The security's value over the account's Balance ("25.58%"): a different measure from cost coverage. */
  shareOfBalance: string | null
}

/** The holdings of an investment account with the one Balance and what is known of cost. */
export type Holdings = {
  cash: string
  holdingsValue: string
  balance: string
  balanceOn: string
  securities: Security[]
  cost: string | null
  gain: string | null
}

function parseHoldings(value: unknown): Holdings {
  const data = record(value)
  if (!Array.isArray(data.securities)) throw bad()
  return {
    cash: str(data.cash),
    holdingsValue: str(data.holdingsValue),
    balance: str(data.balance),
    balanceOn: str(data.balanceOn),
    securities: data.securities.map((item) => {
      const s = record(item)
      return {
        symbol: str(s.symbol),
        shares: str(s.shares),
        price: strOrNull(s.price),
        priceOn: str(s.priceOn),
        value: str(s.value),
        knownShares: str(s.knownShares),
        knownValue: strOrNull(s.knownValue),
        knownCost: strOrNull(s.knownCost),
        knownGain: strOrNull(s.knownGain),
        coverage: str(s.coverage),
        cost: strOrNull(s.cost),
        gain: strOrNull(s.gain),
        shareOfBalance: strOrNull(s.shareOfBalance),
      }
    }),
    cost: strOrNull(data.cost),
    gain: strOrNull(data.gain),
  }
}

function parseLines(value: unknown): HoldingLine[] {
  if (!Array.isArray(value)) throw bad()
  return value.map((item) => {
    const data = record(item)
    return {
      symbol: str(data.symbol),
      quantity: str(data.quantity),
      price: str(data.price),
      value: str(data.value),
      valueOn: str(data.valueOn),
      cost: strOrNull(data.cost),
      gain: strOrNull(data.gain),
    }
  })
}

function parsePreview(value: unknown): OpeningPreview {
  const data = record(value)
  if (data.state !== 'complete' && data.state !== 'draft' && data.state !== 'mismatch') throw bad()
  if (typeof data.canSave !== 'boolean' || !Array.isArray(data.missing)) throw bad()
  return {
    state: data.state,
    canSave: data.canSave,
    cash: strOrNull(data.cash),
    holdingsValue: str(data.holdingsValue),
    calculatedBalance: strOrNull(data.calculatedBalance),
    openingTotal: strOrNull(data.openingTotal),
    difference: strOrNull(data.difference),
    missing: data.missing.map(str),
    message: strOrNull(data.message),
    holdings: parseLines(data.holdings),
  }
}

function parseView(value: unknown): OpeningView {
  const data = record(value)
  if (typeof data.noStartingAmount !== 'boolean' || typeof data.statementRemoved !== 'boolean')
    throw bad()
  return {
    total: strOrNull(data.total),
    cash: strOrNull(data.cash),
    holdingsValue: str(data.holdingsValue),
    noStartingAmount: data.noStartingAmount,
    holdings: parseLines(data.holdings),
    statementId: strOrNull(data.statementId),
    statementRemoved: data.statementRemoved,
  }
}

/** The review of a new setup: the same checks as the save, writing nothing. */
/** `accountId` is set when finishing a draft: its present owners may stay, as an edit allows. */
export const previewOpening = (account: NewAccount, accountId?: string) =>
  request(`/accounts/opening-preview${accountId ? `?accountId=${accountId}` : ''}`, {
    method: 'POST',
    body: {
      type: account.type,
      name: account.name,
      institution: account.institution,
      ownerMemberIds: account.ownerMemberIds,
      openedOn: account.openedOn,
      opening: account.opening,
    },
    parse: parsePreview,
  })

export const getOpening = (accountId: string) =>
  request(`/accounts/${accountId}/opening`, { parse: parseView })

/** The holdings of a completed investment account (a draft has none: Finish setup first). */
export const getHoldings = (accountId: string) =>
  request(`/accounts/${accountId}/holdings`, { parse: parseHoldings })

/** Finish setup of a draft: the components again; the account becomes active when they are complete. */
export const finishSetup = (accountId: string, opening: NewAccount['opening'], memberId: string) =>
  request(`/accounts/${accountId}/opening`, {
    method: 'PUT',
    body: { opening, enteredByMemberId: memberId },
    parse: parseAccount,
  })

/** Quick discard of a draft: gone at once, no Undo. */
export const discardDraft = (accountId: string, memberId: string) =>
  request(`/accounts/${accountId}/discard`, {
    method: 'POST',
    body: { enteredByMemberId: memberId },
    parse: parseAccount,
  })

/** One account in the whole-investment group: its one Balance and, when recorded, its cash and holdings value. */
export type GroupAccount = {
  accountId: string
  name: string
  type: string
  status: string
  balance: string
  pricesOn: string | null
  cash: string | null
  holdingsValue: string | null
}

/** One account's holding of a security: its own shares, price and price date (a price is never shared). */
export type GroupPosition = {
  accountId: string
  accountName: string
  accountStatus: string
  shares: string
  price: string | null
  priceOn: string
  value: string
  knownShares: string
  knownCost: string | null
  cost: string | null
  gain: string | null
  coverage: string
}

/** One security across the accounts that hold it. `cost` and `gain` are null unless every share has a known cost. */
export type GroupSecurity = {
  symbol: string
  shares: string
  value: string
  accountCount: number
  knownShares: string
  knownValue: string | null
  knownCost: string | null
  knownGain: string | null
  coverage: string
  cost: string | null
  gain: string | null
  shareOfBalance: string | null
  positions: GroupPosition[]
}

/** The holdings of the whole investment group (slice 19c): its Balance total, the accounts and each security. */
export type InvestmentGroup = {
  total: string
  accounts: GroupAccount[]
  securities: GroupSecurity[]
}

function parseGroup(value: unknown): InvestmentGroup {
  const data = record(value)
  if (!Array.isArray(data.accounts) || !Array.isArray(data.securities)) throw bad()
  return {
    total: str(data.total),
    accounts: data.accounts.map((item) => {
      const a = record(item)
      return {
        accountId: str(a.accountId),
        name: str(a.name),
        type: str(a.type),
        status: str(a.status),
        balance: str(a.balance),
        pricesOn: strOrNull(a.pricesOn),
        cash: strOrNull(a.cash),
        holdingsValue: strOrNull(a.holdingsValue),
      }
    }),
    securities: data.securities.map((item) => {
      const s = record(item)
      if (typeof s.accountCount !== 'number' || !Array.isArray(s.positions)) throw bad()
      return {
        symbol: str(s.symbol),
        shares: str(s.shares),
        value: str(s.value),
        accountCount: s.accountCount,
        knownShares: str(s.knownShares),
        knownValue: strOrNull(s.knownValue),
        knownCost: strOrNull(s.knownCost),
        knownGain: strOrNull(s.knownGain),
        coverage: str(s.coverage),
        cost: strOrNull(s.cost),
        gain: strOrNull(s.gain),
        shareOfBalance: strOrNull(s.shareOfBalance),
        positions: s.positions.map((p) => {
          const x = record(p)
          return {
            accountId: str(x.accountId),
            accountName: str(x.accountName),
            accountStatus: str(x.accountStatus),
            shares: str(x.shares),
            price: strOrNull(x.price),
            priceOn: str(x.priceOn),
            value: str(x.value),
            knownShares: str(x.knownShares),
            knownCost: strOrNull(x.knownCost),
            cost: strOrNull(x.cost),
            gain: strOrNull(x.gain),
            coverage: str(x.coverage),
          }
        }),
      }
    }),
  }
}

/** The whole investment group: every completed investment account once, and each security across them. */
export const getInvestmentGroup = () => request('/investments/holdings', { parse: parseGroup })
