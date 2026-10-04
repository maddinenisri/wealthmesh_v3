import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { mockApi } from '../test/mockApi'
import { renderRoute } from '../test/render'

describe('AppLayout', () => {
  it('wraps pages with the header, main navigation and a skip link', async () => {
    renderRoute('/design')

    expect(
      await screen.findByRole('heading', { name: 'WealthMesh design system' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main')
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Household', 'Accounts', 'Design system'])
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
  })

  it('ends every page with a footer after the main content', async () => {
    renderRoute('/design')
    await screen.findByRole('heading', { name: 'WealthMesh design system' })

    const footer = screen.getByRole('contentinfo')
    expect(footer).toHaveTextContent(`\u00a9 ${new Date().getFullYear()} WealthMesh`)
    expect(
      screen.getByRole('main').compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('marks the current page in the navigation and sets the tab title', async () => {
    renderRoute('/design')
    await screen.findByRole('heading', { name: 'WealthMesh design system' })

    expect(screen.getByRole('link', { name: 'Design system' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'Household' })).not.toHaveAttribute('aria-current')
    expect(document.title).toBe('Design system | WealthMesh')
  })

  it('navigates between pages without a reload and updates the title', async () => {
    mockApi({ household: { id: '11111111-1111-4111-8111-111111111111', name: 'Doe Family' } })
    const { user } = renderRoute('/design')

    await user.click(await screen.findByRole('link', { name: 'Household' }))

    expect(await screen.findByRole('heading', { name: 'Doe Family' })).toBeInTheDocument()
    expect(document.title).toBe('Household | WealthMesh')
  })

  it('shows a not-found page inside the layout for unknown addresses', async () => {
    renderRoute('/nowhere')

    expect(await screen.findByText('Page not found', { selector: 'h3' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(document.title).toBe('Page not found | WealthMesh')
  })

  it('returns to the household from the not-found page', async () => {
    mockApi({ household: { id: '11111111-1111-4111-8111-111111111111', name: 'Doe Family' } })
    const { user } = renderRoute('/nowhere')

    await user.click(await screen.findByRole('button', { name: 'Go to household' }))

    expect(await screen.findByRole('heading', { name: 'Doe Family' })).toBeInTheDocument()
  })
})
