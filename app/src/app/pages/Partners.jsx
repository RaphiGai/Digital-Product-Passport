import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { odataList } from '@/api/client';
import { DataTable, SortHeader } from '@/ui/Table';
import { StatusBadge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { RequireRole } from '@/auth/RequireRole';
import { PageHeader } from './ComingSoon';
import { formatLabel } from '@/lib/formatters';

function getSortValue(partner, column) {
  if (column === 'roles') {
    return (partner.roles ?? []).map((r) => formatLabel(r.role)).join(', ');
  }

  if (column === 'status') {
    return partner.archived ? 'archived' : 'active';
  }

  return partner[column] ?? '';
}

export function Partners() {
  const [search, setSearch] = useState('');
  const [sortConfig, setSortConfig] = useState({
    column: 'name',
    direction: 'asc'
  });

  const { data, isLoading } = useQuery({
    queryKey: ['BusinessPartners'],
    queryFn: () => odataList('BusinessPartners', { orderby: 'name', top: 100, expand: ['roles'] })
  });

  function handleSort(column) {
    setSortConfig((current) =>
      current.column === column
        ? { column, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' }
    );
  }

  const filteredPartners = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return data ?? [];

    return (data ?? []).filter((p) => {
      const searchableText = [
        p.name,
        p.country_iso2,
        p.city,
        p.identifier,
        p.contact_person,
        p.contact_email,
        p.archived ? 'archived' : 'active',
        ...(p.roles ?? []).map((r) => r.role)
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [data, search]);

  const sortedPartners = useMemo(() => {
    return [...filteredPartners].sort((a, b) => {
      const aValue = String(getSortValue(a, sortConfig.column)).toLowerCase();
      const bValue = String(getSortValue(b, sortConfig.column)).toLowerCase();

      const result = aValue.localeCompare(bValue, 'en', {
        numeric: true,
        sensitivity: 'base'
      });

      return sortConfig.direction === 'asc' ? result : -result;
    });
  }, [filteredPartners, sortConfig]);

  const columns = useMemo(
    () => [
      {
        header: (
          <SortHeader
            label="Partner"
            column="name"
            sortConfig={sortConfig}
            onSort={handleSort}
          />
        ),
        cell: (p) => (
          <Link to={`/partners/${p.ID}`} className="font-medium text-ink hover:text-brand-700">
            {p.name}
          </Link>
        )
      },
      {
        header: (
          <SortHeader
            label="Country"
            column="country_iso2"
            sortConfig={sortConfig}
            onSort={handleSort}
          />
        ),
        cell: (p) => p.country_iso2 ?? '—'
      },
      {
        header: (
          <SortHeader
            label="City"
            column="city"
            sortConfig={sortConfig}
            onSort={handleSort}
          />
        ),
        cell: (p) => p.city ?? '—'
      },
      {
        header: (
          <SortHeader
            label="Roles"
            column="roles"
            sortConfig={sortConfig}
            onSort={handleSort}
          />
        ),
        cell: (p) => (p.roles ?? []).map((r) => formatLabel(r.role)).join(', ') || '—'
      },
      {
        header: (
          <SortHeader
            label="Status"
            column="status"
            sortConfig={sortConfig}
            onSort={handleSort}
          />
        ),
        cell: (p) => <StatusBadge status={p.archived ? 'archived' : 'active'} />
      }
    ],
    [sortConfig]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Business partners" subtitle="Suppliers, factories, recyclers" />
        <RequireRole role="company_advanced">
          <Link to="/partners/new">
            <Button>Create business partner</Button>
          </Link>
        </RequireRole>
      </div>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search business partners..."
        className="w-full rounded-lg border border-black/10 bg-white px-4 py-2 text-sm text-ink outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />

      <DataTable
        columns={columns}
        rows={sortedPartners}
        loading={isLoading}
        empty="No business partners found."
      />
    </div>
  );
}