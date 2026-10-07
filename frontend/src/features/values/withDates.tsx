import { Fragment, type ReactNode } from 'react'
import { Dated } from './Dated'

/** A sentence with every date in it kept whole: "Start moved from 2026-09-01 to 2026-08-01" never breaks a date. */
export function withDates(text: string): ReactNode {
  return text
    .split(/(\d{4}-\d{2}-\d{2})/)
    .map((part, index) =>
      /^\d{4}-\d{2}-\d{2}$/.test(part) ? (
        <Dated key={index} on={part} />
      ) : (
        <Fragment key={index}>{part}</Fragment>
      ),
    )
}
