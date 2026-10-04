import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../test/server'
import { ApiError, request } from './client'

describe('request', () => {
  it('returns the parsed body', async () => {
    server.use(http.get('*/api/v1/ping', () => HttpResponse.json({ ok: true })))
    expect(await request('/ping')).toEqual({ ok: true })
  })

  it('uses the server message when the error body has one', async () => {
    server.use(
      http.get('*/api/v1/ping', () =>
        HttpResponse.json({ message: 'Name is taken' }, { status: 409 }),
      ),
    )
    await expect(request('/ping')).rejects.toMatchObject({ message: 'Name is taken', status: 409 })
  })

  it('falls back to a plain message when the error has no usable body', async () => {
    server.use(http.get('*/api/v1/ping', () => new HttpResponse(null, { status: 404 })))
    const failure = await request('/ping').catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(ApiError)
    expect(failure).toMatchObject({ message: 'That item was not found.', status: 404 })
  })

  it('reports an unreachable server with status 0', async () => {
    server.use(http.get('*/api/v1/ping', () => HttpResponse.error()))
    await expect(request('/ping')).rejects.toMatchObject({
      message: 'Cannot reach the server. Check that the backend is running.',
      status: 0,
    })
  })
})
