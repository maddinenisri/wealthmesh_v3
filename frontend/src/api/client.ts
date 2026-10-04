/** Failure from the backend. Spring's default error body is `{ status, error, message }`. */
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const FALLBACK: Record<number, string> = {
  400: 'Check the details and try again.',
  404: 'That item was not found.',
  409: 'That conflicts with something that already exists.',
}

async function errorFrom(response: Response): Promise<ApiError> {
  let message: string | undefined
  try {
    const body: unknown = await response.json()
    if (
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof body.message === 'string'
    ) {
      message = body.message || undefined
    }
  } catch {
    // Body was empty or not JSON; fall back to a generic message.
  }
  return new ApiError(
    message ?? FALLBACK[response.status] ?? 'The server could not complete the request.',
    response.status,
  )
}

/** Calls the backend under /api/v1 and returns the parsed JSON body, or undefined for 204. */
export async function request<T>(
  path: string,
  options: {
    method?: string
    body?: unknown
    headers?: Record<string, string>
    parse?: (value: unknown) => T
  } = {},
): Promise<T> {
  const { method = 'GET', body, headers, parse } = options
  let response: Response
  try {
    response = await fetch(new URL(`/api/v1${path}`, window.location.origin), {
      method,
      headers: body === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Cannot reach the server. Check that the backend is running.', 0)
  }
  if (!response.ok) throw await errorFrom(response)
  if (response.status === 204) return undefined as T
  const value: unknown = await response.json()
  return parse ? parse(value) : (value as T)
}
