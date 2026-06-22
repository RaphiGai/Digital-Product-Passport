import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { KeyRound, UserX, UserCheck } from 'lucide-react';
import { odataList, ApiError } from '@/api/client';
import { useUnboundAction } from '@/api/hooks';
import { useMe } from '@/auth/useMe';
import { USER_ROLES } from '@/lib/fieldCatalogue';
import { Card, CardTitle, CardDescription } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Banner } from '@/ui/Breadcrumb';
import { DataTable } from '@/ui/Table';
import { StatusBadge } from '@/ui/Badge';
import { FormSection, FieldRow, Input, RadioCards } from '@/ui/Form';
import { PageHeader } from './ComingSoon';

const USERS_KEY = [['Users']];
const EMPTY = { username: '', email: '', displayName: '', role: 'company_user' };
const roleLabel = (r) => USER_ROLES.find((o) => o.value === r)?.label ?? r;

function SortButton({ label, column, sort, onSort }) {
  const active = sort.column === column;

  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className="flex items-center gap-1 text-left font-semibold uppercase"
    >
      {label}
      {active ? (sort.direction === 'asc' ? '↑' : '↓') : ''}
    </button>
  );
}

export function Settings() {
  const { data: me } = useMe();

  const { data: users, isLoading } = useQuery({
    queryKey: ['Users'],
    queryFn: () => odataList('Users', { orderby: 'username', top: 200 }),
    enabled: me?.role === 'company_advanced'
  });

  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(/** @type {{title:string, temp:string} | null} */ (null));

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ column: 'USERNAME', direction: 'asc' });

  const onSort = (column) => {
    setSort((s) =>
      s.column === column
        ? { column, direction: s.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' }
    );
  };

  const createUser = useUnboundAction({ invalidate: USERS_KEY });
  const resetPwd = useUnboundAction({ invalidate: USERS_KEY });
  const setActive = useUnboundAction({ invalidate: USERS_KEY });

  // Only company_advanced may manage users (server-enforced too).
  if (me && me.role !== 'company_advanced') {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="Administrative Settings" />
        <Card className="mt-6">
          <CardTitle>Restricted</CardTitle>
          <CardDescription className="mt-1">
            User management is available to company advanced users only.
          </CardDescription>
        </Card>
      </div>
    );
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const submit = (e) => {
    e.preventDefault();
    setError('');
    setNotice(null);

      if (form.username.trim().length > 50) {
    setError('Username may contain a maximum of 50 characters.');
    return;
    }

    if (form.displayName.trim().length > 50) {
      setError('Display name may contain a maximum of 50 characters.');
      return;
    }

    if (form.email.trim().length > 80) {
      setError('Email may contain a maximum of 80 characters.');
      return;
    }
    if (!form.username.trim() || !form.email.trim()) {
      setError('Username and email are required.');
      return;
    }
    if (!isValidEmail(form.email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    createUser.mutate(
      {
        action: 'createUser',
        payload: {
          username: form.username.trim(),
          email: form.email.trim(),
          displayName: form.displayName.trim(),
          role: form.role
        }
      },
      {
        onSuccess: (data) => {
          setForm(EMPTY);
          setNotice({
            title: `User “${data.username}” created (${roleLabel(data.role)}).`,
            temp: data.tempPassword
          });
        },
        onError: (err) =>
          setError(err instanceof ApiError ? err.message : 'Could not create the user.')
      }
    );
  };

  const onReset = (u) => {
    setError('');
    setNotice(null);
    resetPwd.mutate(
      { action: 'resetUserPassword', payload: { userId: u.ID } },
      {
        onSuccess: (data) =>
          setNotice({ title: `New temporary password for “${u.username}”.`, temp: data.tempPassword }),
        onError: (err) =>
          setError(err instanceof ApiError ? err.message : 'Could not reset the password.')
      }
    );
  };

  const onToggleActive = (u) => {
    setError('');
    setNotice(null);
    setActive.mutate(
      { action: u.active ? 'deactivateUser' : 'reactivateUser', payload: { userId: u.ID } },
      {
        onError: (err) =>
          setError(err instanceof ApiError ? err.message : 'Could not update the user.')
      }
    );
  };

  const getSortValue = (u, column) => {
  if (column === 'ID') return u.ID ?? '';
  if (column === 'USERNAME') return u.username ?? '';
  if (column === 'DISPLAY_NAME') return u.display_name ?? '';
  if (column === 'EMAIL') return u.email ?? '';
  if (column === 'ROLE') return roleLabel(u.role);
  if (column === 'ACTIVE') return u.active ? 'active' : 'inactive';
  return '';
};

const visibleUsers = [...(users ?? [])]
  .filter((u) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;

    return [
      u.ID,
      u.username,
      u.display_name,
      u.email,
      u.organization_ID,
      u.role,
      roleLabel(u.role),
      u.external_user_id,
      u.active ? 'active' : 'inactive'
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q));
  })
  .sort((a, b) => {
    const av = String(getSortValue(a, sort.column)).toLowerCase();
    const bv = String(getSortValue(b, sort.column)).toLowerCase();

    const result = av.localeCompare(bv, undefined, {
      numeric: true,
      sensitivity: 'base'
    });

    return sort.direction === 'asc' ? result : -result;
  });

  const columns = [

  {
    header: <SortButton label="ID" column="ID" sort={sort} onSort={onSort} />,
    cell: (u) => <span className="font-mono text-xs">{u.ID}</span>
  },
  {
    header: <SortButton label="USERNAME" column="USERNAME" sort={sort} onSort={onSort} />,
    cell: (u) => <span className="font-medium text-ink">{u.username}</span>
  },
    { header: <SortButton label="NAME" column="DISPLAY_NAME" sort={sort} onSort={onSort} />, cell: (u) => u.display_name || '—' },
    { header: <SortButton label="EMAIL" column="EMAIL" sort={sort} onSort={onSort} />, cell: (u) => u.email },
    { header: <SortButton label="ROLE" column="ROLE" sort={sort} onSort={onSort} />, cell: (u) => roleLabel(u.role) },
    { header: <SortButton label="STATUS" column="ACTIVE" sort={sort} onSort={onSort} />, cell: (u) => <StatusBadge status={u.active ? 'active' : 'inactive'} /> },
    {
      header: 'Actions',
      cell: (u) => (
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => onReset(u)} disabled={resetPwd.isPending}>
            Reset password
          </Button>
          {u.username === me?.id ? null : u.active ? (
            <Button variant="danger" size="sm" onClick={() => onToggleActive(u)} disabled={setActive.isPending}>
              Deactivate
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => onToggleActive(u)} disabled={setActive.isPending}>
               Reactivate
            </Button>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Administrative Settings" subtitle="User management" />

      {error && <Banner kind="error">{error}</Banner>}
      {notice && (
        <Banner kind="success">
          {notice.title} Temporary password (share securely — shown once):{' '}
          <code className="rounded bg-white/60 px-1.5 py-0.5 font-mono text-sm">{notice.temp}</code>{' '}
          The user must change it on first login.
        </Banner>
      )}

      <Card className="p-6">
        <CardTitle>Add user</CardTitle>
        <CardDescription className="mt-1">
          Creates a user in your organisation. A one-time temporary password is generated; the user
          must change it on first login.
        </CardDescription>
        <form onSubmit={submit} className="mt-4">
          <FormSection title="Account">
            <FieldRow label="Username" required htmlFor="username" hint="Used to sign in. Must be unique.">
              <Input id="username" value={form.username} onChange={set('username')} placeholder="jane.doe" maxLength={50} />
            </FieldRow>
            <FieldRow label="Email" required htmlFor="email">
              <Input id="email" type="email" value={form.email} onChange={set('email')} placeholder="jane.doe@company.com" maxLength={80} />
            </FieldRow>
            <FieldRow label="Display name" htmlFor="displayName">
              <Input id="displayName" value={form.displayName} onChange={set('displayName')}  placeholder="Jane Doe" maxLength={50}/>
            </FieldRow>
          </FormSection>

          <FormSection title="Role" description="Choose the access level for the new user.">
            <div className="md:col-span-2">
              <RadioCards
                value={form.role}
                onChange={(v) => setForm((f) => ({ ...f, role: v }))}
                options={USER_ROLES}
              />
            </div>
          </FormSection>

          <div className="flex justify-end border-t border-black/5 pt-5">
            <Button type="submit" disabled={createUser.isPending}>
              {createUser.isPending ? 'Creating…' : 'Create user'}
            </Button>
          </div>
        </form>
      </Card>

            <Card className="p-4">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users by ID, username, name, email, role, organization..."
        />
      </Card>

      <DataTable columns={columns} rows={visibleUsers} loading={isLoading} empty="No users found." />
    </div>
  );
}
