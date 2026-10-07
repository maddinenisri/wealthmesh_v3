/**
 * Account types in their final order. `ready` types can be set up (a ledger type also holds money activity, the
 * server's `AccountType.holdsActivity`); the rest show as "coming soon" until their feature is built.
 */
export const ACCOUNT_TYPES = [
  { value: 'checking', label: 'Checking', ready: true },
  { value: 'savings', label: 'Savings', ready: true },
  { value: 'credit_card', label: 'Credit card', ready: true },
  { value: 'property', label: 'Property', ready: true, valued: 'property' },
  { value: 'other_asset', label: 'Other asset', ready: true, valued: 'asset' },
  { value: 'brokerage', label: 'Brokerage', ready: false },
  { value: 'loan', label: 'Loan', ready: true, debt: true },
  { value: 'mortgage', label: 'Mortgage', ready: true, debt: true },
] as const satisfies readonly {
  value: string
  label: string
  ready: boolean
  valued?: 'property' | 'asset'
  debt?: true
}[]

export type AccountTypeValue = (typeof ACCOUNT_TYPES)[number]['value']

/**
 * True for a property or other asset: no money activity, one Balance that is its latest dated value (the server's
 * `AccountType.isValued`).
 */
export function isValued(type: string): boolean {
  return valuedNoun(type) !== null
}

/**
 * True for a loan or mortgage: a debt with one Balance owed, set up with a lender and changed by payments and reviewed
 * corrections (the server's `AccountType.isDebt`). It takes no ordinary money in or out.
 */
export function isDebt(type: string): boolean {
  const found = ACCOUNT_TYPES.find((candidate) => candidate.value === type)
  return !!found && 'debt' in found
}

/** "loan" or "mortgage": what a debt type is called in a sentence. */
export function debtNoun(type: string): 'loan' | 'mortgage' {
  return type === 'mortgage' ? 'mortgage' : 'loan'
}

/**
 * What to call the debts a person can pay: "loan", "mortgage", or "loan or mortgage" when both (or neither) exist.
 * Pass the types of the debts offered.
 */
export function debtNounOf(types: string[]): string {
  const nouns = new Set(types.map(debtNoun))
  return nouns.size === 1 ? [...nouns][0] : 'loan or mortgage'
}

/** The seeded category a payment's interest counts under, named by the debt's type (the server decides, D-054). */
export const interestCategoryName = (type: string): string =>
  debtNoun(type) === 'mortgage' ? 'Mortgage interest' : 'Loan interest'

/** A noun at the start of a label: "Loan", "Mortgage", "Loan or mortgage". */
export const capitalNoun = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

/** "property" or "asset" for a valued type, as the messages name it ("Enter zero or a positive property value"). */
export function valuedNoun(type: string): 'property' | 'asset' | null {
  const found = ACCOUNT_TYPES.find((candidate) => candidate.value === type)
  return found && 'valued' in found ? found.valued : null
}

/** The name of a type for headings, for example "Savings". Unknown values are shown as they are. */
export function accountTypeLabel(value: string): string {
  return ACCOUNT_TYPES.find((type) => type.value === value)?.label ?? value
}
