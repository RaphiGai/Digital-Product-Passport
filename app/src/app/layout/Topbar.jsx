import { useMe } from '@/auth/useMe';

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
  return (
    <header className="flex h-16 shrink-0 items-center justify-end gap-4 border-b border-black/5 bg-card px-6">
      <span className="text-sm text-ink-muted">{me?.tenantId ?? '—'}</span>
      <span
        className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800"
        title={me?.displayName}
      >
        {initials(me?.displayName)}
      </span>
    </header>
  );
}
