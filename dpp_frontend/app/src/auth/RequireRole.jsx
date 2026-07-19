import { useMe } from './useMe';

/**
 * UX-only gate: renders children only when the caller has the required role.
 * Security is enforced server-side (auth-helpers.js) — this just hides controls
 * a company_user cannot use (all write/lifecycle actions require company_advanced).
 *
 * @param {{ role: import('@/api/types').UserRole, children: React.ReactNode }} props
 */
export function RequireRole({ role, children }) {
  const { data: me } = useMe();
  if (me?.role !== role) return null;
  return <>{children}</>;
}
