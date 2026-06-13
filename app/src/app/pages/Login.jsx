import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { login as apiLogin, changePassword as apiChangePassword } from '@/auth/authApi';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Banner } from '@/ui/Breadcrumb';
import { Input } from '@/ui/Form';

/**
 * App-managed login screen (replaces XSUAA). Renders OUTSIDE <AppShell>, so it
 * does not call me() and is reachable without a session. On a forced first-login
 * (mustReset) it switches to a change-password step before entering the app.
 */
export function Login() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [mode, setMode] = useState(/** @type {'login' | 'reset'} */ ('login'));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function enterApp() {
    // Refetch identity with the new cookie, then go to the dashboard.
    await qc.invalidateQueries({ queryKey: ['me'] });
    navigate('/', { replace: true });
  }

  async function onLogin(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await apiLogin(username.trim(), password);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.mustReset) {
        // The temp password becomes the "current" password for the change step.
        setCurrentPassword(password);
        setPassword('');
        setMode('reset');
        return;
      }
      await enterApp();
    } catch {
      setError('Login is currently unavailable. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function onReset(e) {
    e.preventDefault();
    setError('');
    if (newPassword !== confirm) {
      setError('The new passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const res = await apiChangePassword(currentPassword, newPassword);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      await enterApp();
    } catch {
      setError('Could not change the password. Please try again.');
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

        {mode === 'login' ? (
          <form onSubmit={onLogin} className="space-y-4">
            <h1 className="text-lg font-semibold text-ink">Sign in</h1>
            {error && <Banner kind="error">{error}</Banner>}
            <div className="space-y-1.5">
              <label htmlFor="username" className="text-sm font-medium text-ink">Username</label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-ink">Password</label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        ) : (
          <form onSubmit={onReset} className="space-y-4">
            <h1 className="text-lg font-semibold text-ink">Set a new password</h1>
            <p className="text-sm text-ink-muted">
              Please choose a new password to finish signing in.
            </p>
            {error && <Banner kind="error">{error}</Banner>}
            <div className="space-y-1.5">
              <label htmlFor="newPassword" className="text-sm font-medium text-ink">New password</label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
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
              {busy ? 'Saving…' : 'Set password & continue'}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
