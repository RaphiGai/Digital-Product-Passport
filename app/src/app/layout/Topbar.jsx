import { useState, useRef, useEffect } from 'react';
import { LogOut } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useMe } from '@/auth/useMe';
import { logout as apiLogout } from '@/auth/authApi';

/** @param {string} [name] */
function initials(name) {
  if (!name) return '??';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function Topbar() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close the profile menu on outside click or Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // App-managed logout: clear the dpp_session cookie on the backend, drop the
  // cached identity, then go to the login screen.
  const logout = async () => {
    await apiLogout();
    qc.clear();
    window.location.assign('/login');
  };

  return (
    <header className="flex h-16 shrink-0 items-center justify-end gap-4 border-b border-black/5 bg-card px-6">
      <span className="text-sm text-ink-muted">{me?.tenantId ?? '—'}</span>
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800 transition hover:ring-2 hover:ring-brand-200"
          title={me?.displayName}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          {initials(me?.displayName)}
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-lg border border-black/10 bg-card py-1 shadow-lg"
          >
            <div className="border-b border-black/5 px-3 py-2">
              <p className="truncate text-sm font-medium text-ink">{me?.displayName ?? 'Signed in'}</p>
              {me?.role && <p className="truncate text-xs text-ink-muted">{me.role}</p>}
              {me?.tenantId && <p className="truncate text-xs text-ink-muted">{me.tenantId}</p>}
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={logout}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-gray-50"
            >
              <LogOut className="h-4 w-4 text-ink-muted" />
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
