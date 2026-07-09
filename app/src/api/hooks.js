import { useMutation, useQueryClient } from '@tanstack/react-query';
import { odataCreate, odataUpdate, odataDelete, callAction, callUnboundAction, newId } from './client';

/**
 * Create an entity, then invalidate the given query keys (e.g. the list + counts).
 * @param {string} entitySet
 * @param {{ invalidate?: any[][], onSuccess?: (row: any) => void }} [opts]
 */
export function useCreate(entitySet, opts = {}) {
  const qc = useQueryClient();
  return useMutation({
    // Inject a client-side key if the caller didn't supply one (String keys aren't auto-assigned).
    mutationFn: (payload) => odataCreate(entitySet, payload.ID ? payload : { ...payload, ID: newId() }),
    onSuccess: (row) => {
      (opts.invalidate ?? [[entitySet]]).forEach((key) => qc.invalidateQueries({ queryKey: key }));
      opts.onSuccess?.(row);
    }
  });
}

/**
 * Patch an entity by key.
 * @param {string} entitySet
 * @param {{ invalidate?: any[][] }} [opts]
 */
export function useUpdate(entitySet, opts = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, payload }) => odataUpdate(entitySet, key, payload),
    onSuccess: () => {
      (opts.invalidate ?? [[entitySet]]).forEach((k) => qc.invalidateQueries({ queryKey: k }));
    }
  });
}

/**
 * Hard-delete an entity by key, then invalidate the given query keys. The backend cascades
 * the delete down the product hierarchy (see srv/handlers/cascade-delete.js), so the single
 * DELETE removes the whole subtree. Pass `onSuccess` to navigate back to the list.
 * @param {string} entitySet
 * @param {{ invalidate?: any[][], onSuccess?: (key: string) => void }} [opts]
 */
export function useDelete(entitySet, opts = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key) => odataDelete(entitySet, key),
    onSuccess: (_d, key) => {
      (opts.invalidate ?? [[entitySet]]).forEach((k) => qc.invalidateQueries({ queryKey: k }));
      opts.onSuccess?.(key);
    }
  });
}

/**
 * Invoke a bound action (approveDPP, publishDPP, archiveDPP, …) on an entity.
 * @param {string} entitySet
 * @param {{ invalidate?: any[][] }} [opts]
 */
export function useAction(entitySet, opts = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, action, payload }) => callAction(entitySet, key, action, payload),
    onSuccess: () => {
      (opts.invalidate ?? [[entitySet]]).forEach((k) => qc.invalidateQueries({ queryKey: k }));
    }
  });
}

/**
 * Invoke an unbound action (createUser, resetUserPassword, deactivateUser, …).
 * @param {{ invalidate?: any[][] }} [opts]
 */
export function useUnboundAction(opts = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, payload }) => callUnboundAction(action, payload),
    onSuccess: () => {
      (opts.invalidate ?? []).forEach((k) => qc.invalidateQueries({ queryKey: k }));
    }
  });
}
