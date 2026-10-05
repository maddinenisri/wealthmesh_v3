/** The class an expense is saved with (CATEGORIES_001). Income has none. */
export const CLASS_LABEL: Record<string, string> = {
  essential: 'Essential',
  discretionary: 'Discretionary',
}

/** "Essential", "Discretionary", or "Unclassified" for an expense saved with none. */
export const classText = (classification: string | null | undefined): string =>
  classification ? (CLASS_LABEL[classification] ?? classification) : 'Unclassified'
