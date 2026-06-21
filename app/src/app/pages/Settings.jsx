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

  const createUser = useUnboundAction({ invalidate: USERS_KEY });
  const resetPwd = useUnboundAction({ invalidate: USERS_KEY });
  const setActive = useUnboundAction({ invalidate: USERS_KEY });

  // Only company_advanced may manage users (server-enforced too).
  if (me && me.role !== 'company_advanced') {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="Administrator Settings" />
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

  const columns = [
    { header: 'Username', cell: (u) => <span className="font-medium text-ink">{u.username}</span> },
    { header: 'Name', cell: (u) => u.display_name || '—' },
    { header: 'Email', cell: (u) => u.email },
    { header: 'Role', cell: (u) => roleLabel(u.role) },
    { header: 'Status', cell: (u) => <StatusBadge status={u.active ? 'active' : 'inactive'} /> },
    {
      header: 'Actions',
      cell: (u) => (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onReset(u)} disabled={resetPwd.isPending}>
            <KeyRound className="h-3.5 w-3.5" /> Reset password
          </Button>
          {u.username === me?.id ? null : u.active ? (
            <Button variant="danger" size="sm" onClick={() => onToggleActive(u)} disabled={setActive.isPending}>
              <UserX className="h-3.5 w-3.5" /> Deactivate
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => onToggleActive(u)} disabled={setActive.isPending}>
              <UserCheck className="h-3.5 w-3.5" /> Reactivate
            </Button>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Administrator Settings" subtitle="User management" />

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

      <DataTable columns={columns} rows={users ?? []} loading={isLoading} empty="No users found." />
    </div>
  );
}
