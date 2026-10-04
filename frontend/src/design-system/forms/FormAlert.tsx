/** Form-level error, such as a failed save. Announced to screen readers. */
export function FormAlert({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-control bg-negative-soft px-3 py-2 text-sm text-negative">
      {message}
    </p>
  )
}
