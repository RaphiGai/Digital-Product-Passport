import { useEffect, useState } from 'react';
import { useMe } from '@/auth/useMe';
import { useUnboundAction } from '@/api/hooks';
import { ApiError } from '@/api/client';
import { Card, CardTitle } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Breadcrumb, Banner } from '@/ui/Breadcrumb';
import { FieldRow, Input } from '@/ui/Form';
import { Eye, EyeOff } from 'lucide-react';
import { changePassword as apiChangePassword } from '@/auth/authApi';

export function ProfileSettings() {
  const { data: me, isLoading } = useMe();
  // Self-service profile update; invalidating ['me'] refreshes the topbar + this page.
  const updateProfile = useUnboundAction({ invalidate: [['me']] });

  const [form, setForm] = useState({
    displayName: '',
    email: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (!me) return;
    setForm((f) => ({
      ...f,
      displayName: me.displayName ?? '',
      email: me.email ?? ''
    }));
  }, [me]);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
  };

  const isValidEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const savePersonalInformation = () => {
    setMsg(null);

    if (!form.displayName.trim()) {
      setMsg({ kind: 'error', text: 'Name is required.' });
      return;
    }

    if (!form.email.trim()) {
      setMsg({ kind: 'error', text: 'Email is required.' });
      return;
    }

    if (!isValidEmail(form.email)) {
      setMsg({ kind: 'error', text: 'Please enter a valid email address.' });
      return;
    }

    updateProfile.mutate(
      { action: 'updateProfile', payload: { displayName: form.displayName.trim(), email: form.email.trim() } },
      {
        onSuccess: () => setMsg({ kind: 'success', text: 'Personal information updated successfully.' }),
        onError: (err) =>
          setMsg({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not update your profile.' })
      }
    );
  };

  const submitPasswordChange = async (e) => {
    e.preventDefault();
    setMsg(null);

    if (!form.currentPassword) {
      setMsg({ kind: 'error', text: 'Current password is required to change password.' });
      return;
    }

    if (form.newPassword.length < 8) {
      setMsg({ kind: 'error', text: 'New password must have at least 8 characters.' });
      return;
    }

    if (form.newPassword !== form.confirmPassword) {
      setMsg({ kind: 'error', text: 'New passwords do not match.' });
      return;
    }

    setSaving(true);
    try {
      const hasPasswordChange =
        form.currentPassword || form.newPassword || form.confirmPassword;

      if (hasPasswordChange) {
        const res = await apiChangePassword(form.currentPassword, form.newPassword);

        if (!res.ok) {
          setMsg({ kind: 'error', text: res.error || 'Could not change password.' });
          return;
        }
      }

      setForm((f) => ({
        ...f,
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      }));

      setMsg({ kind: 'success', text: 'Password updated successfully.' });
    } catch {
      setMsg({ kind: 'error', text: 'Could not change password.' });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <p className="text-ink-muted">Loading…</p>;

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: 'Dashboard', to: '/' },
          { label: 'My Profile' }
        ]}
      />

      <div>
        <h1 className="text-2xl font-semibold text-ink">My Profile</h1>
        <p className="mt-1 text-sm text-ink-muted">
          View and update your personal account information.
        </p>
      </div>

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      <form>
        <Card className="p-6">
          <CardTitle>Personal information</CardTitle>

          <div className="mt-5 space-y-4">
            <FieldRow label="Name" required htmlFor="displayName">
              <Input
                id="displayName"
                value={form.displayName}
                onChange={set('displayName')}
                maxLength={70}
              />
            </FieldRow>

            <FieldRow label="Email" required htmlFor="email">
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={set('email')}
                maxLength={120}
              />
            </FieldRow>

            <FieldRow label="Role" htmlFor="role">
              <Input id="role" value={me?.role ?? '—'} disabled />
            </FieldRow>

            <FieldRow label="Tenant" htmlFor="tenant">
              <Input id="tenant" value={me?.tenantId ?? '—'} disabled />
            </FieldRow>
          </div>
          <div className="mt-6 flex justify-end border-t border-black/5 pt-5">
          <Button
            type="button"
            onClick={savePersonalInformation}
            disabled={updateProfile.isPending}
          >
            {updateProfile.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
        </Card>

        <Card className="mt-6 p-6">
          <CardTitle>Change password</CardTitle>

          <div className="mt-5 space-y-4">
          <FieldRow label="Current password" htmlFor="currentPassword">
            <div className="relative">
              <Input
                id="currentPassword"
                type={showCurrentPassword ? 'text' : 'password'}
                value={form.currentPassword}
                onChange={set('currentPassword')}
                autoComplete="current-password"
                maxLength={50}
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted"
              >
                {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </FieldRow>

          <FieldRow label="New password" htmlFor="newPassword">
            <div className="relative">
              <Input
                id="newPassword"
                type={showNewPassword ? 'text' : 'password'}
                value={form.newPassword}
                onChange={set('newPassword')}
                autoComplete="new-password"
                maxLength={50}
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted"
              >
                {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </FieldRow>

          <FieldRow label="Confirm new password" htmlFor="confirmPassword">
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={form.confirmPassword}
                onChange={set('confirmPassword')}
                autoComplete="new-password"
                maxLength={50}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted"
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </FieldRow>
          </div>

          <div className="mt-6 flex justify-end border-t border-black/5 pt-5">
          <Button type="button" onClick={submitPasswordChange} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}