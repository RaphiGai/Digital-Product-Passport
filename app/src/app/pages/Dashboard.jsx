import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Building2, Shirt } from 'lucide-react';
import { useMe } from '@/auth/useMe';
import { odataCount } from '@/api/client';
import { Card, CardDescription, CardTitle } from '@/ui/Card';
import { Button } from '@/ui/Button';

/** @param {Date} [date] */
function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** @param {{ label: string, value: string | number, hint?: string, to: string }} props */
function Kpi({ label, value, hint, to }) {
  return (
    <Link to={to} className="block">
      <Card className="cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md">
        <p className="text-sm text-ink-muted">{label}</p>
        <p className="mt-1 text-3xl font-semibold text-ink">{value}</p>
        {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
      </Card>
    </Link>
  );
}

export function Dashboard() {
  const { data: me } = useMe();

  // KPI counts via OData $count (tenant filter applied server-side).
  const products = useQuery({
    queryKey: ['count', 'Products'],
    queryFn: () => odataCount('Products')
  });
  const partners = useQuery({
    queryKey: ['count', 'BusinessPartners'],
    queryFn: () => odataCount('BusinessPartners')
  });
  const dpps = useQuery({ queryKey: ['count', 'DPPs'], queryFn: () => odataCount('DPPs') });

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-semibold text-ink">
          {greeting()}, {me?.displayName ?? ''}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          {me?.tenantId} · {me?.role} · {today}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Kpi label="Total products" value={products.data ?? '—'} hint="Access all products" to="/products" />
      <Kpi
        label="Business partners"
        value={partners.data ?? '—'}
        hint="Suppliers, factories, recyclers"
        to="/partners"
      />
      <Kpi
        label="Digital product passports"
        value={dpps.data ?? '—'}
        hint="Across all product variants"
        to="/dpps"
      />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100">
            <Building2 className="h-5 w-5 text-brand-700" />
          </div>
          <CardTitle>Business partners</CardTitle>
          <CardDescription>
            Add and manage your supply chain partners before creating products. Partners are linked
            to batches as factories and suppliers.
          </CardDescription>
          <Link to="/partners/new" className="mt-1">
            <Button>Create business partner</Button>
          </Link>
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100">
            <Shirt className="h-5 w-5 text-brand-700" />
          </div>
          <CardTitle>Products</CardTitle>
          <CardDescription>
            Create a product model to start building variants, batches, and digital product
            passports for EU ESPR compliance.
          </CardDescription>
          <Link to="/products/new" className="mt-1">
            <Button>Create product</Button>
          </Link>
        </Card>
      </div>
    </div>
  );
}
