/**
 * Account types in their final order; every one can be set up (a ledger type also holds money activity, the server's
 * `AccountType.holdsActivity`). `noun` is what a type is called in a sentence when its label would read badly there
 * ("Review new HSA"); it defaults to the lowercase label.
 */
export const ACCOUNT_TYPES = [
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'property', label: 'Property', valued: 'property' },
  { value: 'other_asset', label: 'Other asset', valued: 'asset' },
  {
    value: 'defined_benefit',
    label: 'Defined benefit',
    noun: 'defined benefit plan',
    valued: 'plan',
    singleOwner: true,
  },
  { value: 'brokerage', label: 'Brokerage', investment: true },
  { value: '401k', label: '401(k)', noun: '401(k)', investment: true, singleOwner: true },
  {
    value: 'traditional_ira',
    label: 'Traditional IRA',
    noun: 'Traditional IRA',
    investment: true,
    singleOwner: true,
  },
  { value: 'roth_ira', label: 'Roth IRA', noun: 'Roth IRA', investment: true, singleOwner: true },
  {
    value: 'hsa',
    label: 'Health savings account (HSA)',
    noun: 'HSA',
    investment: true,
    singleOwner: true,
  },
  { value: 'loan', label: 'Loan', debt: true },
  { value: 'mortgage', label: 'Mortgage', debt: true },
] as const satisfies readonly {
  value: string
  label: string
  noun?: string
  valued?: 'property' | 'asset' | 'plan'
  singleOwner?: true
  debt?: true
  investment?: true
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

/** True for a brokerage, retirement or health account: set up from opening cash and holdings (the server's `AccountType.isInvestment`). */
export function isInvestment(type: string): boolean {
  const found = ACCOUNT_TYPES.find((candidate) => candidate.value === type)
  return !!found && 'investment' in found
}

/** How a type's Balance is read, the one answer every type branch asks (the server's `AccountType.Kind`). */
export type TypeKind = 'ledger' | 'card' | 'valued' | 'debt' | 'investment'

/** What a type is, in the words and gates the screens need. Branch on this, not on a type literal. */
export type TypeTraits = {
  kind: TypeKind
  /** The label of the bank, issuer, lender or institution field; null for a property or other asset. */
  institutionLabel: string | null
  /** True for a type that takes ordinary money in and out (the server's `AccountType.holdsActivity`, plus cards). */
  holdsMoney: boolean
  /** The label of the opening date field. */
  dateLabel: string
  /** A defined benefit: a plan-reported value with statements that carry pay and interest credits. */
  plan: boolean
  /** True for a type held by exactly one member (the server's `AccountType.singleOwner`). */
  singleOwner: boolean
  /** The label of the owner field: "Participant" for a plan, "Owner" for a type held by one member, else "Owners". */
  ownerLabel: string
  /** The label of the amount typed at setup and for a new value. */
  valueLabel: string
  /** True when setup records the member who entered it (the server's `AccountType.recordsCreator`). */
  recordsCreator: boolean
  /** The refusal text for a negative typed value; null for a type that has no value to type. */
  negativeValueMessage: string | null
}

export function typeTraits(type: string): TypeTraits {
  const kind: TypeKind =
    type === 'credit_card'
      ? 'card'
      : isValued(type)
        ? 'valued'
        : isDebt(type)
          ? 'debt'
          : isInvestment(type)
            ? 'investment'
            : 'ledger'
  const noun = valuedNoun(type)
  const plan = noun === 'plan'
  const singleOwner = ACCOUNT_TYPES.some(
    (candidate) => candidate.value === type && 'singleOwner' in candidate,
  )
  return {
    kind,
    institutionLabel: plan
      ? 'Institution'
      : {
          ledger: 'Bank',
          card: 'Issuer',
          valued: null,
          debt: 'Lender',
          investment: 'Institution',
        }[kind],
    holdsMoney: kind === 'ledger' || kind === 'card',
    dateLabel: plan
      ? 'As of'
      : {
          ledger: 'Opened on',
          card: 'Opened on',
          valued: 'Value date',
          debt: 'As of',
          investment: 'Setup date',
        }[kind],
    plan,
    singleOwner,
    ownerLabel: plan ? 'Participant' : singleOwner ? 'Owner' : 'Owners',
    valueLabel: plan
      ? 'Plan-reported value'
      : kind === 'valued'
        ? 'Value'
        : kind === 'debt'
          ? 'Amount owed'
          : 'Balance',
    recordsCreator: kind === 'investment' || plan,
    negativeValueMessage:
      noun === null
        ? null
        : plan
          ? 'Plan value must be zero or greater'
          : `Enter zero or a positive ${noun} value`,
  }
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

/** "property", "asset" or "plan" for a valued type, as the messages name it ("Enter zero or a positive property value"). */
export function valuedNoun(type: string): 'property' | 'asset' | 'plan' | null {
  const found = ACCOUNT_TYPES.find((candidate) => candidate.value === type)
  return found && 'valued' in found ? found.valued : null
}

/** What a type is called inside a sentence: "brokerage", "401(k)", "HSA". Unknown values are shown as they are. */
export function typeNoun(value: string): string {
  const found = ACCOUNT_TYPES.find((type) => type.value === value)
  if (!found) return value
  return 'noun' in found ? found.noun : found.label.toLowerCase()
}

/** The name of a type for headings, for example "Savings". Unknown values are shown as they are. */
export function accountTypeLabel(value: string): string {
  return ACCOUNT_TYPES.find((type) => type.value === value)?.label ?? value
}
