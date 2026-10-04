/** Primary navigation. Keep in step with the routes in routes.tsx. */
export const navigation = [
  { to: '/', label: 'Household', end: true },
  { to: '/design', label: 'Design system', end: false },
] as const

/** Metadata a route can attach through React Router's `handle`. */
export type RouteHandle = { title: string }

export const appName = 'WealthMesh'
