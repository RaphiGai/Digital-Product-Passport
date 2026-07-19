import { useQuery } from '@tanstack/react-query';
import { callFunction } from '@/api/client';

/**
 * Resolves the caller's identity, role and tenant via the backend me() function.
 * This is the first call after login and drives role-based UI gating.
 *
 * A 403 here means "authenticated but no active Users row" → handled by the caller
 * (AccountNotActivated page). 401 means no session → redirect to '/' for a fresh login.
 *
 * @returns {import('@tanstack/react-query').UseQueryResult<import('@/api/types').MeInfo>}
 */
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => callFunction('me()'),
    retry: false,
    staleTime: 5 * 60 * 1000
  });
}

/**
 * Convenience hook for conditional logic outside of <RequireRole>.
 * @param {import('@/api/types').UserRole} role
 * @returns {boolean}
 */
export function useHasRole(role) {
  const { data: me } = useMe();
  return me?.role === role;
}
