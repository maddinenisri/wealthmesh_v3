import { createBrowserRouter, type RouteObject } from 'react-router'
import { HouseholdPage } from './features/household/HouseholdPage'
import { AppLayout } from './layout/AppLayout'
import type { RouteHandle } from './layout/navigation'
import { NotFoundPage } from './pages/NotFoundPage'
import { Showcase } from './Showcase'

const handle = (title: string): RouteHandle => ({ title })

/** Data-mode route config. The pathless AppLayout wraps every page. */
export const routes: RouteObject[] = [
  {
    Component: AppLayout,
    children: [
      { index: true, Component: HouseholdPage, handle: handle('Household') },
      { path: 'design', Component: Showcase, handle: handle('Design system') },
      { path: '*', Component: NotFoundPage, handle: handle('Page not found') },
    ],
  },
]

export const createAppRouter = () => createBrowserRouter(routes)
