import { useNavigate } from 'react-router'
import { Button, EmptyState } from '../design-system'

export function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <EmptyState
      title="Page not found"
      description="This address doesn't match a page in WealthMesh. Check the link, or go back to the household."
      action={<Button onClick={() => void navigate('/')}>Go to household</Button>}
    />
  )
}
