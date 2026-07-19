import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { resetPasswordWithToken } from '@/auth/authApi';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Banner } from '@/ui/Breadcrumb';
import { Input } from '@/ui/Form';

/**
 * Self-service password reset landing page (opened from the emailed link at
 * /reset-password?token=…). Renders OUTSIDE <AppShell> (no session needed). The user
 * sets a new password; on success they sign in normally. Invalid/expired tokens are
 * reported by the backend on submit.
 */
export function PasswordReset() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (newPassword !== confirm) {
      setError('The new passwords do not match.');
      return;
    }
    if (newPassword.length < 10 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError('Password must be at least 10 characters and include a letter and a digit.');
      return;
    }
    setBusy(true);
    try {
      const res = await resetPasswordWithToken(token, newPassword);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(true);
    } catch {
      setError('Could not reset the password. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-sm">
        <div className="mb-5 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-sm font-bold text-white">
            O
          </span>
          <span className="text-base font-semibold text-ink">DPP Studio</span>
        </div>

        {!token ? (
          <div className="space-y-4">
            <h1 className="text-lg font-semibold text-ink">Invalid reset link</h1>
            <Banner kind="error">This password reset link is missing or invalid. Please request a new one.</Banner>
            <Link to="/login" className="block text-center text-sm text-brand-700 hover:underline">
              Back to sign in
            </Link>
          </div>
        ) : done ? (
          <div className="space-y-4">
            <h1 className="text-lg font-semibold text-ink">Password updated</h1>
            <Banner kind="success">Your password has been reset. You can now sign in with your new password.</Banner>
            <Button type="button" className="w-full" onClick={() => navigate('/login', { replace: true })}>
              Go to sign in
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <h1 className="text-lg font-semibold text-ink">Set a new password</h1>
            <p className="text-sm text-ink-muted">Choose a new password for your account.</p>
            {error && <Banner kind="error">{error}</Banner>}
            <div className="space-y-1.5">
              <label htmlFor="newPassword" className="text-sm font-medium text-ink">New password</label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                autoFocus
                required
              />
              <p className="text-xs text-ink-muted">At least 10 characters, with a letter and a digit.</p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="confirm" className="text-sm font-medium text-ink">Confirm new password</label>
              <Input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Saving…' : 'Set password'}
            </Button>
            <Link to="/login" className="block text-center text-sm text-brand-700 hover:underline">
              Back to sign in
            </Link>
          </form>
        )}
      </Card>
    </div>
  );
}
