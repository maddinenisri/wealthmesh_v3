import { createBrowserRouter, type RouteObject } from 'react-router'
import { AccountDetailPage } from './features/accounts/AccountDetailPage'
import { AccountsPage } from './features/accounts/AccountsPage'
import { EditAccountPage, NewAccountPage } from './features/accounts/AccountFormPages'
import { HouseholdPage } from './features/household/HouseholdPage'
import { AppLayout } from './layout/AppLayout'
import type { RouteHandle } from './layout/navigation'
import { NotFoundPage } from './pages/NotFoundPage'
import { CategoriesPage } from './features/categories/CategoriesPage'
import { SpendingPage } from './features/spending/SpendingPage'
import { Showcase } from './Showcase'

const handle = (title: string): RouteHandle => ({ title })

/** Data-mode route config. The pathless AppLayout wraps every page. */
export const routes: RouteObject[] = [
  {
    Component: AppLayout,
    children: [
      { index: true, Component: HouseholdPage, handle: handle('Household') },
      { path: 'accounts', Component: AccountsPage, handle: handle('Accounts') },
      { path: 'accounts/new', Component: NewAccountPage, handle: handle('Add account') },
      { path: 'accounts/:id', Component: AccountDetailPage, handle: handle('Account') },
      { path: 'accounts/:id/edit', Component: EditAccountPage, handle: handle('Edit account') },
      { path: 'spending', Component: SpendingPage, handle: handle('Spending') },
      { path: 'categories', Component: CategoriesPage, handle: handle('Categories') },
      { path: 'design', Component: Showcase, handle: handle('Design system') },
      { path: '*', Component: NotFoundPage, handle: handle('Page not found') },
    ],
  },
]

export const createAppRouter = () => createBrowserRouter(routes)
