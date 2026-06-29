import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, ShieldCheck } from 'lucide-react';
import { odataList } from '@/api/client';
import { Card, CardDescription, CardTitle } from '@/ui/Card';
import { Input, Select } from '@/ui/Form';
import { StatusBadge, Badge } from '@/ui/Badge';
import { PageHeader } from './ComingSoon';

const typeOptions = ['all', 'DPP', 'QR', 'Item', 'Batch', 'Product', 'Variant'];
const statusOptions = ['all', 'success', 'inactive', 'draft'];


function formatDate(value) {
  if (!value) return '—';

  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function makeLog({ id, time, user, role, organization, action, objectType, objectId, details, status = 'success' }) {
  return { id, time, user, role, organization, action, objectType, objectId, details, status };
}

export function ActivityLogs() {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState({ key: 'time', dir: 'desc' });

   function toggleSort(key) {
    setSort((current) => ({
      key,
      dir: current.key === key && current.dir === 'asc' ? 'desc' : 'asc',
    }));
  }

  function sortIcon(key) {
    if (sort.key !== key) return '↕';
    return sort.dir === 'asc' ? '↑' : '↓';
  }
  
  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: [['Users']],
    queryFn: () => odataList('Users'),
  });

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: [['Products']],
    queryFn: () => odataList('Products'),
  });

  const { data: variants = [], isLoading: variantsLoading } = useQuery({
    queryKey: [['ProductVariants']],
    queryFn: () => odataList('ProductVariants'),
  });

  const { data: batches = [], isLoading: batchesLoading } = useQuery({
    queryKey: [['Batches']],
    queryFn: () => odataList('Batches'),
  });

  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: [['ProductItems']],
    queryFn: () => odataList('ProductItems'),
  });

  const { data: dpps = [], isLoading: dppsLoading } = useQuery({
    queryKey: [['DPPs']],
    queryFn: () => odataList('DPPs'),
  });

  const { data: qrs = [], isLoading: qrsLoading } = useQuery({
    queryKey: [['QRCodes']],
    queryFn: () => odataList('QRCodes'),
  });

  const loading =
    usersLoading ||
    productsLoading ||
    variantsLoading ||
    batchesLoading ||
    itemsLoading ||
    dppsLoading ||
    qrsLoading;

  const adminUser =
    users.find((u) => u.role === 'company_advanced') ??
    users.find((u) => u.role === 'admin') ??
    users[0];

  const user = adminUser?.display_name ?? adminUser?.displayName ?? adminUser?.username ?? 'System';
  const role = adminUser?.role ?? 'system';

  const logs = useMemo(() => {
    const productById = Object.fromEntries(products.map((p) => [p.ID, p]));
    const variantById = Object.fromEntries(variants.map((v) => [v.ID, v]));

    return [
      ...products.map((product) =>
        makeLog({
          id: `log-product-${product.ID}`,
          time: product.modifiedAt ?? product.createdAt ?? product.valid_from,
          user,
          role,
          organization: product.owning_organization_ID ?? '—',
          action: product.status === 'published' ? 'Published Product' : 'Created Product',
          objectType: 'Product',
          objectId: product.ID,
          details: `${product.name ?? product.ID} (${product.product_type ?? 'product'})`,
          status: product.status === 'draft' ? 'draft' : 'success',
        })
      ),

      ...variants.map((variant) =>
        makeLog({
          id: `log-variant-${variant.ID}`,
          time: variant.modifiedAt ?? variant.createdAt,
          user,
          role,
          organization: productById[variant.product_ID]?.owning_organization_ID ?? '—',
          action: 'Created Variant',
          objectType: 'Variant',
          objectId: variant.ID,
          details: `${variant.color ?? '—'} / ${variant.size ?? '—'} for ${variant.product_ID}`,
          status: variant.status === 'inactive' ? 'inactive' : 'success',
        })
      ),

      ...batches.map((batch) =>
        makeLog({
          id: `log-batch-${batch.ID}`,
          time: batch.production_date,
          user,
          role,
          organization: '—',
          action: batch.status === 'approved' ? 'Approved Batch' : 'Created Batch',
          objectType: 'Batch',
          objectId: batch.ID,
          details: `Batch ${batch.batch_number ?? batch.ID} for ${batch.variant_ID}`,
          status: batch.status === 'draft' ? 'draft' : 'success',
        })
      ),

      ...items.map((item) =>
        makeLog({
          id: `log-item-${item.ID}`,
          time: item.manufacturing_date,
          user,
          role,
          organization: '—',
          action: item.status === 'sold' ? 'Updated Item Status' : 'Created Item',
          objectType: 'Item',
          objectId: item.ID,
          details: `${item.serial_number ?? '—'} / ${item.upi ?? '—'} for ${item.batch_ID}`,
          status: 'success',
        })
      ),

      ...dpps.map((dpp) =>
        makeLog({
          id: `log-dpp-${dpp.ID}`,
          time: dpp.published_at ?? dpp.approved_at ?? dpp.valid_from,
          user,
          role,
          organization: productById[dpp.product_ID]?.owning_organization_ID ?? '—',
          action: dpp.status === 'published' ? 'Published DPP' : 'Created DPP',
          objectType: 'DPP',
          objectId: dpp.ID,
          details: `${dpp.dpp_type ?? 'DPP'} passport for ${dpp.product_ID ?? dpp.item_ID ?? '—'}`,
          status: dpp.status === 'draft' ? 'draft' : 'success',
        })
      ),

      ...qrs.map((qr) =>
        makeLog({
          id: `log-qr-${qr.ID}`,
          time: qr.created_at,
          user,
          role,
          organization: '—',
          action: 'Generated QR Code',
          objectType: 'QR',
          objectId: qr.ID,
          details: `QR code generated for ${qr.dpp_ID}`,
          status: qr.status === 'active' ? 'success' : 'inactive',
        })
      ),
    ].sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
  }, [user, role, products, variants, batches, items, dpps, qrs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    const result = logs.filter((log) => {
      const matchesQuery =
        !q ||
        [
          log.id,
          log.user,
          log.organization,
          log.action,
          log.objectType,
          log.objectId,
          log.details,
          log.role,
        ]
          .join(' ')
          .toLowerCase()
          .includes(q);

      return (
        matchesQuery &&
        (type === 'all' || log.objectType === type) &&
        (status === 'all' || log.status === status)
      );
    });

    return [...result].sort((a, b) => {
      const aValue = a[sort.key] ?? '';
      const bValue = b[sort.key] ?? '';

      if (sort.key === 'time') {
        return sort.dir === 'asc'
          ? new Date(aValue) - new Date(bValue)
          : new Date(bValue) - new Date(aValue);
      }

      return sort.dir === 'asc'
        ? String(aValue).localeCompare(String(bValue))
        : String(bValue).localeCompare(String(aValue));
    });
  }, [logs, query, type, status, sort]);

  return (
    <div>
      <PageHeader
        title="Activity Logs"
        subtitle="Admin overview of platform activity based on database records."
      />

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Card>
          <CardTitle>{logs.length}</CardTitle>
          <CardDescription>Total log entries</CardDescription>
        </Card>
        <Card>
          <CardTitle>{logs.filter((l) => l.objectType === 'DPP').length}</CardTitle>
          <CardDescription>DPP activities</CardDescription>
        </Card>
        <Card>
          <CardTitle>{logs.filter((l) => l.objectType === 'Item').length}</CardTitle>
          <CardDescription>Item activities</CardDescription>
        </Card>
      </div>

      <Card className="mt-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-ink">Search</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-muted" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by user, action, object ID, organization..."
                className="pl-9"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Object type</label>
            <Select
              value={type}
              onChange={(e) => setType(e.target.value)}
              options={typeOptions.map((option) => ({
                value: option,
                label: option === 'all' ? 'All types' : option,
              }))}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Status</label>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              options={statusOptions.map((option) => ({
                value: option,
                label: option === 'all' ? 'All statuses' : option,
              }))}
            />
          </div>
        </div>
      </Card>

      <Card className="mt-6 overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
          <thead className="border-b border-black/10 bg-black/[0.03] text-xs uppercase text-ink-muted">
            <tr>
              <th className="px-4 py-3">
                <button onClick={() => toggleSort('time')}>Time {sortIcon('time')}</button>
              </th>
              <th className="px-4 py-3">
                <button onClick={() => toggleSort('user')}>User {sortIcon('user')}</button>
              </th>
              <th className="px-4 py-3">
                <button onClick={() => toggleSort('action')}>Action {sortIcon('action')}</button>
              </th>
              <th className="px-4 py-3">
                <button onClick={() => toggleSort('objectType')}>Object {sortIcon('objectType')}</button>
              </th>
              <th className="px-4 py-3">
                <button onClick={() => toggleSort('details')}>Details {sortIcon('details')}</button>
              </th>
              <th className="px-4 py-3">
                <button onClick={() => toggleSort('status')}>Status {sortIcon('status')}</button>
              </th>
            </tr>
          </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-ink-muted">
                    Loading activity logs...
                  </td>
                </tr>
              )}

              {!loading &&
                filtered.map((log) => (
                  <tr key={log.id} className="border-b border-black/5 last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-ink-muted">
                      {formatDate(log.time)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{log.user}</div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
                        <Badge>{log.role}</Badge>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium">{log.action}</td>
                    <td className="px-4 py-3">
                      <Badge>{log.objectType}</Badge>
                      <div className="mt-1 font-mono text-xs text-ink-muted">{log.objectId}</div>
                    </td>
                    <td className="min-w-[280px] px-4 py-3 text-ink-muted">{log.details}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusBadge status={log.status} />
                    </td>
                  </tr>
                ))}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-ink-muted">
                    No activity logs found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}