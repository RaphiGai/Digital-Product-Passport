import { useEffect } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useMe } from '@/auth/useMe';
import { ApiError } from '@/api/client';
import { AccountNotActivated } from '@/app/pages/AccountNotActivated';
import { UnsavedChangesProvider } from '@/app/UnsavedChangesContext';

// The only routes a business_partner login may visit — everything else redirects
// to the partner portal. Mirrors the server-side scope gate (auth-helpers.js),
// which blocks all other reads/writes anyway; this just keeps the UX clean.
const PARTNER_PATHS = ['/partner-documents', '/profile', '/appearance'];

/**
 * Authenticated shell. Resolves me() once. With the app-managed auth, a 401 (no
 * session) sends the user to the login screen; a 403 (authenticated but no active
 * Users row) shows the not-activated page. A user still flagged mustResetPassword
 * is bounced to /login to complete the forced change.
 */
export function AppShell() {
  const { data: me, isLoading, error } = useMe();
  const location = useLocation();

  // Apply the user's saved colour theme app-wide (server value is the source of
  // truth; localStorage is kept in sync only for an instant, flash-free apply on
  // the next hard reload — see App.jsx).
  useEffect(() => {
    if (me?.appearanceTheme) {
      document.documentElement.setAttribute('data-theme', me.appearanceTheme);
      try {
        localStorage.setItem('appearanceTheme', me.appearanceTheme);
      } catch {
        /* ignore storage errors */
      }
    }
  }, [me?.appearanceTheme]);

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

  if (
    me?.role === 'business_partner' &&
    !PARTNER_PATHS.some((p) => location.pathname === p || location.pathname.startsWith(`${p}/`))
  ) {
    return <Navigate to="/partner-documents" replace />;
  }

  return (
    <UnsavedChangesProvider>
      <div className="flex h-full">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 overflow-auto px-8 py-7">
            <Outlet />
          </main>
        </div>
      </div>
    </UnsavedChangesProvider>
  );
}
