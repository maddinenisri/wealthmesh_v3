import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { ApiError } from './api/client'
import './index.css'
import { createAppRouter } from './routes'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Client errors (404 before the household exists, 400s) will not change on retry.
      retry: (count, error) =>
        !(error instanceof ApiError && error.status < 500 && error.status !== 0) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={createAppRouter()} />
    </QueryClientProvider>
  </StrictMode>,
)
