import { Card, CardDescription, CardTitle } from '@/ui/Card';

/**
 * Page header reused across pages.
 * @param {{ title: string, subtitle?: string }} props
 */
export function PageHeader({ title, subtitle }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
    </div>
  );
}

/**
 * Placeholder for routes without backend support yet (Validation, Reports, Settings)
 * and Phase-2 pages (create/detail).
 * @param {{ title: string }} props
 */
export function ComingSoon({ title }) {
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={title} />
      <Card className="mt-6">
        <CardTitle>Coming soon</CardTitle>
        <CardDescription className="mt-1">
          This area is part of the planned scope and will be implemented in a later phase.
        </CardDescription>
      </Card>
    </div>
  );
}
