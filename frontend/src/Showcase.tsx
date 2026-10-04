import { useState } from 'react'
import {
  Amount,
  Avatar,
  Badge,
  Button,
  Card,
  CardTitle,
  EmptyState,
  Field,
  PageHeader,
  Table,
  Td,
  Th,
} from './design-system'

const swatches = [
  ['canvas', 'bg-canvas'],
  ['surface', 'bg-surface'],
  ['sunken', 'bg-sunken'],
  ['line', 'bg-line'],
  ['ink', 'bg-ink'],
  ['ink-muted', 'bg-ink-muted'],
  ['primary', 'bg-primary'],
  ['primary-soft', 'bg-primary-soft'],
  ['brass', 'bg-brass'],
  ['positive', 'bg-positive'],
  ['negative', 'bg-negative'],
] as const

const members = ['Alex Doe', 'Sam Rivera']

/** Living reference for the design system. Not shipped to end users. */
export function Showcase() {
  const [dark, setDark] = useState(false)

  const toggle = () => {
    const next = !dark
    document.documentElement.classList.toggle('dark', next)
    setDark(next)
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="WealthMesh design system"
        description="Tokens and components shared across the app. Figures are the focus; everything else stays quiet."
        actions={
          <Button variant="secondary" onClick={toggle} aria-pressed={dark}>
            {dark ? 'Use light theme' : 'Use dark theme'}
          </Button>
        }
      />

      <Card>
        <CardTitle>Color</CardTitle>
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {swatches.map(([name, cls]) => (
            <li key={name} className="flex items-center gap-3 text-caption">
              <span
                className={`size-8 rounded-control border border-line ${cls}`}
                aria-hidden="true"
              />
              {name}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardTitle>Amounts</CardTitle>
        <div className="mt-4 flex flex-wrap items-baseline gap-x-10 gap-y-3">
          <Amount value={48210.55} size="lg" />
          <Amount value={1250} signed />
          <Amount value={-84.2} signed />
          <Amount value={0} signed />
        </div>
      </Card>

      <Card>
        <CardTitle>Buttons and badges</CardTitle>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button>Add account</Button>
          <Button variant="secondary">Edit</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="danger">Remove member</Button>
          <Button size="sm">Save changes</Button>
          <Button disabled>Saving</Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge>Joint</Badge>
          <Badge tone="primary">Checking</Badge>
          <Badge tone="positive">Reconciled</Badge>
          <Badge tone="negative">Overdrawn</Badge>
          <Badge tone="brass">Savings goal</Badge>
        </div>
      </Card>

      <Card>
        <CardTitle>Form fields</CardTitle>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Member name" placeholder="Alex Doe" />
          <Field label="Label" hint="Optional, such as Joint or Personal." />
          <Field
            label="Opening balance"
            defaultValue="-"
            error="Enter an amount, such as 1250.00."
          />
        </div>
      </Card>

      <Card>
        <CardTitle>Table</CardTitle>
        <Table className="mt-4">
          <thead>
            <tr>
              <Th>Member</Th>
              <Th>Label</Th>
              <Th className="text-right">Balance</Th>
            </tr>
          </thead>
          <tbody>
            {members.map((name, i) => (
              <tr key={name}>
                <Td>
                  <span className="flex items-center gap-3">
                    <Avatar name={name} />
                    {name}
                  </span>
                </Td>
                <Td>{i === 0 ? <Badge>Joint</Badge> : <Badge tone="primary">Personal</Badge>}</Td>
                <Td className="text-right">
                  <Amount value={i === 0 ? 12480.1 : 903.75} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <EmptyState
        title="No accounts yet"
        description="Add a checking account to start tracking balances for this household."
        action={<Button>Add account</Button>}
      />
    </div>
  )
}
