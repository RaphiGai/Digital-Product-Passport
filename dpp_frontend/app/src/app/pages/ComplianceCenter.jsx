// src/app/pages/ComplianceCenter.jsx
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ShieldAlert,
  FileWarning,
  Copy,
  Search,
  ExternalLink
} from 'lucide-react';
import { buildComplianceIssues, norm } from '@/lib/complianceIssues';

import { odataList } from '@/api/client';
import { Card, CardTitle } from '@/ui/Card';
import { Badge } from '@/ui/Badge';
import { Input, Select } from '@/ui/Form';
import { Banner } from '@/ui/Breadcrumb';
import { PageHeader } from './ComingSoon';

const fmtDate = (v) => {
  if (!v) return '—';
  const [y, m, d] = String(v).slice(0, 10).split('-');
  return d && m && y ? `${d}.${m}.${y}` : String(v).slice(0, 10);
};

function severityTone(severity) {
  if (severity === 'critical') return 'red';
  if (severity === 'warning') return 'yellow';
  return 'gray';
}

function SeverityBadge({ severity }) {
  return <Badge tone={severityTone(severity)}>{severity}</Badge>;
}

function IssueIcon({ type }) {
  if (type.includes('Duplicate')) return <Copy className="h-4 w-4" />;
  if (type.includes('Certificate') || type.includes('document')) return <FileWarning className="h-4 w-4" />;
  return <ShieldAlert className="h-4 w-4" />;
}

export default function ComplianceCenter() {
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState('all');
  const [type, setType] = useState('all');
  const [entity, setEntity] = useState('all');

  const safeList = async (entityName, options = {}) => {
    try {
      return await odataList(entityName, options);
    } catch {
      return [];
    }
  };

  const productsQ = useQuery({
    queryKey: ['ComplianceCenter', 'Products'],
    queryFn: () => safeList('Products', { top: 1000 })
  });

  const variantsQ = useQuery({
    queryKey: ['ComplianceCenter', 'ProductVariants'],
    queryFn: () => safeList('ProductVariants', { top: 1000 })
  });

  const batchesQ = useQuery({
    queryKey: ['ComplianceCenter', 'Batches'],
    queryFn: () => safeList('Batches', { top: 1000 })
  });

  const itemsQ = useQuery({
    queryKey: ['ComplianceCenter', 'ProductItems'],
    queryFn: () => safeList('ProductItems', { top: 1000 })
  });

  const docsQ = useQuery({
    queryKey: ['ComplianceCenter', 'Documents'],
    queryFn: () => safeList('Documents', { top: 1000 })
  });

  const bomsQ = useQuery({
    queryKey: ['ComplianceCenter', 'ProductBOMs'],
    queryFn: () => safeList('ProductBOMs', { top: 1000 })
  });

  const batchComponentsQ = useQuery({
    queryKey: ['ComplianceCenter', 'BatchComponents'],
    queryFn: () => safeList('BatchComponents', { top: 1000 })
  });

  const loading =
    productsQ.isLoading ||
    variantsQ.isLoading ||
    batchesQ.isLoading ||
    itemsQ.isLoading ||
    docsQ.isLoading ||
    bomsQ.isLoading ||
    batchComponentsQ.isLoading;

  const issues = useMemo(() => {
    return buildComplianceIssues({
      products: productsQ.data ?? [],
      variants: variantsQ.data ?? [],
      batches: batchesQ.data ?? [],
      items: itemsQ.data ?? [],
      docs: docsQ.data ?? [],
      boms: bomsQ.data ?? [],
      batchComponents: batchComponentsQ.data ?? []
    });
  }, [
    productsQ.data,
    variantsQ.data,
    batchesQ.data,
    itemsQ.data,
    docsQ.data,
    bomsQ.data,
    batchComponentsQ.data
  ]);

  const types = useMemo(() => ['all', ...Array.from(new Set(issues.map((i) => i.type))).sort()], [issues]);

  const filtered = useMemo(() => {
    const q = norm(search);

    return issues.filter((i) => {
      if (severity !== 'all' && i.severity !== severity) return false;
      if (type !== 'all' && i.type !== type) return false;
      if (entity !== 'all' && i.entityType !== entity) return false;

      if (!q) return true;

      return [
        i.type,
        i.severity,
        i.entityType,
        i.entityId,
        i.entityName,
        i.message,
        i.details
      ].some((v) => norm(v).includes(q));
    });
  }, [issues, search, severity, type, entity]);

  const counts = useMemo(() => ({
    total: issues.length,
    critical: issues.filter((i) => i.severity === 'critical').length,
    warning: issues.filter((i) => i.severity === 'warning').length,
    info: issues.filter((i) => i.severity === 'info').length
  }), [issues]);

  const statCards = [
    ['Total Issues', counts.total, 'all'],
    ['Critical', counts.critical, 'critical'],
    ['Warnings', counts.warning, 'warning'],
    ['Info', counts.info, 'info']
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Warnings"
        subtitle="Company-wide warnings for certificates, mandatory data, duplicates and DPP readiness."
      />

      <div className="grid gap-4 md:grid-cols-4">
        {statCards.map(([label, value, sev]) => (
          <button
            key={label}
            type="button"
            onClick={() => setSeverity(sev)}
            className="rounded-xl border border-black/5 bg-white p-4 text-left shadow-sm hover:bg-gray-50"
          >
            <div className="text-sm text-ink-muted">{label}</div>
            <div className="mt-1 text-2xl font-semibold text-ink">{value}</div>
          </button>
        ))}
      </div>

      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle>Warnings</CardTitle>
            <p className="mt-1 text-sm text-ink-muted">
              Showing {filtered.length} of {issues.length} issues.
            </p>
          </div>

          <div className="grid gap-2 md:grid-cols-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-muted" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="pl-9"
              />
            </div>

            <Select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              options={[
                { value: 'all', label: 'All severities' },
                { value: 'critical', label: 'Critical' },
                { value: 'warning', label: 'Warning' },
                { value: 'info', label: 'Info' }
              ]}
            />

            <Select
              value={type}
              onChange={(e) => setType(e.target.value)}
              options={types.map((t) => ({
                value: t,
                label: t === 'all' ? 'All issue types' : t
              }))}
            />

            <Select
              value={entity}
              onChange={(e) => setEntity(e.target.value)}
              options={[
                { value: 'all', label: 'All entities' },
                { value: 'Product', label: 'Product' },
                { value: 'Variant', label: 'Variant' },
                { value: 'Batch', label: 'Batch' },
                { value: 'Item', label: 'Item' },
                { value: 'BOM', label: 'BOM' },
                { value: 'Document', label: 'Document' }
              ]}
            />
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-black/5 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-3 py-2">Severity</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Entity</th>
                <th className="px-3 py-2">Issue</th>
                <th className="px-3 py-2">Due date</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-black/5">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-ink-muted">
                    Loading compliance warnings...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-ink-muted">
                    No warnings found.
                  </td>
                </tr>
              ) : (
                filtered.map((i) => (
                  <tr key={i.id} className="align-top hover:bg-gray-50">
                    <td className="px-3 py-3">
                      <SeverityBadge severity={i.severity} />
                    </td>

                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <IssueIcon type={i.type} />
                        <span className="font-medium text-ink">{i.type}</span>
                      </div>
                    </td>

                    <td className="px-3 py-3">
                      <div className="font-medium text-ink">{i.entityName}</div>
                      <div className="text-xs text-ink-muted">
                        {i.entityType} · {i.entityId}
                      </div>
                    </td>

                    <td className="px-3 py-3">
                      <div className="font-medium text-ink">{i.message}</div>
                      {i.details && <div className="mt-1 text-xs text-ink-muted">{i.details}</div>}
                    </td>

                    <td className="px-3 py-3 text-ink-muted">{fmtDate(i.dueDate)}</td>

                    <td className="px-3 py-3">
                      <Badge tone="gray">{i.status}</Badge>
                    </td>

                    <td className="px-3 py-3">
                      {i.link ? (
                        <Link
                          to={i.link}
                          className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
                        >
                          Open <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span className="text-xs text-ink-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}