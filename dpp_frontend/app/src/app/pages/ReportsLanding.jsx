import { Link } from 'react-router-dom';
import { Leaf, ArrowRight, BarChart3 } from 'lucide-react';
import { PageHeader } from './ComingSoon';
import { Card, CardTitle, CardDescription } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { useHasRole } from '@/auth/useMe';

export function ReportsLanding() {
  const isAdvanced = useHasRole('company_advanced');

  return (
    <div className="space-y-6">
      <PageHeader
        title="DPP KPI Analytics"
        subtitle="Sustainability monitoring, CSRD support and management steering"
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100">
            <Leaf className="h-5 w-5 text-brand-700" />
          </div>

          <CardTitle>DPP-based sustainability KPIs</CardTitle>

          <CardDescription>
            Analyse DPP data across products, variants and batches: CO₂ footprint,
            recycled content, durability, repairability, ESPR readiness and incomplete
            data. Use filters, charts, top-10 rankings and CSV export for internal
            sustainability reporting and management decisions.
          </CardDescription>

          {isAdvanced ? (
            <Link to="/reports/sustainability" className="mt-1">
              <Button>
                Open KPI analytics
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          ) : (
            <p className="mt-1 text-sm text-ink-muted">
              Available to company advanced users.
            </p>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100">
            <BarChart3 className="h-5 w-5 text-brand-700" />
          </div>

          <CardTitle>What this report supports</CardTitle>

          <CardDescription>
            The report helps advanced users monitor sustainability performance,
            identify high-impact products, compare DPP data quality and prepare
            structured KPI exports for CSRD-oriented internal reporting.
          </CardDescription>
        </Card>
      </div>
    </div>
  );
}