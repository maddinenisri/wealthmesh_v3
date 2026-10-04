import { Container } from '../design-system'
import { appName } from './navigation'

const year = new Date().getFullYear()

/** Sits at the bottom of the viewport on short pages; longer pages push it down. */
export function AppFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <Container className="py-4 text-right text-caption text-ink-muted">
        &copy; {year} {appName}
      </Container>
    </footer>
  )
}
