import { Link } from 'react-router-dom';
import { Leaf, ArrowRight, ShieldCheck } from 'lucide-react';
import { PageHeader } from './ComingSoon';
import { Card, CardTitle, CardDescription } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { useHasRole } from '@/auth/useMe';

/**
 * Reports hub (US9.6). Entry point to the report types; for now Sustainability
 * analytics, with room for further compliance reports. Gated to company_advanced —
 * the same role the analytics backend requires.
 */
export function ReportsLanding() {
  const isAdvanced = useHasRole('company_advanced');

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" subtitle="Compliance & sustainability reporting" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100">
            <Leaf className="h-5 w-5 text-brand-700" />
          </div>
          <CardTitle>Sustainability reports</CardTitle>
          <CardDescription>
            KPI dashboard across products, variants and batches — CO₂ footprint, recycled
            content, durability/repairability and ESPR compliance. Filter by period and
            criteria, view the top performers in charts, and export the data.
          </CardDescription>
          {isAdvanced ? (
            <Link to="/reports/sustainability" className="mt-1">
              <Button>
                Open sustainability reports
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          ) : (
            <p className="mt-1 text-sm text-ink-muted">Available to advanced users.</p>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100">
            <ShieldCheck className="h-5 w-5 text-brand-700" />
          </div>
          <CardTitle>Compliance reports</CardTitle>
          <CardDescription>
            ESPR readiness and documentation-evidence completeness across products and batches —
            self-declared compliance vs. the certificates/proofs on file, expiring documents, and
            the products that declare compliance the evidence doesn&apos;t yet substantiate.
          </CardDescription>
          {isAdvanced ? (
            <Link to="/reports/compliance" className="mt-1">
              <Button>
                Open compliance reports
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          ) : (
            <p className="mt-1 text-sm text-ink-muted">Available to advanced users.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
