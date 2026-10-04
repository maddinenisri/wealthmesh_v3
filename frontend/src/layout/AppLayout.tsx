import { NavLink, Outlet } from 'react-router'
import { cn, Container } from '../design-system'
import { EnteringAs } from './EnteringAs'
import { AppFooter } from './AppFooter'
import { appName, navigation } from './navigation'
import { useDocumentTitle } from './useDocumentTitle'

/** Pathless layout route: shared header and navigation around every page. */
export function AppLayout() {
  useDocumentTitle()

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only rounded-control bg-surface px-3 py-2 focus:not-sr-only focus:absolute focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <header className="border-b border-line bg-surface">
        <Container className="flex flex-wrap items-center gap-x-8 gap-y-2 py-3">
          <span className="font-display text-xl font-medium">{appName}</span>
          <nav aria-label="Main" className="flex gap-1">
            {navigation.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'rounded-control px-3 py-1.5 text-sm font-medium',
                    isActive ? 'bg-primary-soft text-primary' : 'text-ink-muted hover:bg-sunken',
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <EnteringAs />
        </Container>
      </header>
      <Container as="main" id="main" tabIndex={-1} className="flex-1 py-8 outline-none">
        <Outlet />
      </Container>
      <AppFooter />
    </div>
  )
}
