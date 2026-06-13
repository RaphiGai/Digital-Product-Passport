import { Outlet, Navigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useMe } from '@/auth/useMe';
import { ApiError } from '@/api/client';
import { AccountNotActivated } from '@/app/pages/AccountNotActivated';

/**
 * Authenticated shell. Resolves me() once. With the app-managed auth, a 401 (no
 * session) sends the user to the login screen; a 403 (authenticated but no active
 * Users row) shows the not-activated page. A user still flagged mustResetPassword
 * is bounced to /login to complete the forced change.
 */
export function AppShell() {
  const { data: me, isLoading, error } = useMe();

  if (isLoading) {
    return <div className="flex h-full items-center justify-center text-ink-muted">Loading…</div>;
  }

  if (error) {
    if (error instanceof ApiError && error.status === 401) return <Navigate to="/login" replace />;
    if (error instanceof ApiError && error.status === 403) return <AccountNotActivated />;
    return (
      <div className="flex h-full items-center justify-center text-ink-muted">
        Could not load your profile. Please reload.
      </div>
    );
  }

  if (me?.mustResetPassword) return <Navigate to="/login" replace />;

  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-auto px-8 py-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
