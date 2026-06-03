import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useMe } from '@/auth/useMe';
import { ApiError } from '@/api/client';
import { AccountNotActivated } from '@/app/pages/AccountNotActivated';

/**
 * Authenticated shell. Resolves me() once; on 403 (no active Users row) shows the
 * not-activated page; on other errors shows a minimal message. The Approuter handles
 * 401/login in production, so here we mainly guard the "logged in but unprovisioned" case.
 */
export function AppShell() {
  const { isLoading, error } = useMe();

  if (isLoading) {
    return <div className="flex h-full items-center justify-center text-ink-muted">Loading…</div>;
  }

  if (error) {
    if (error instanceof ApiError && error.status === 403) return <AccountNotActivated />;
    return (
      <div className="flex h-full items-center justify-center text-ink-muted">
        Could not load your profile. Please reload.
      </div>
    );
  }

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
