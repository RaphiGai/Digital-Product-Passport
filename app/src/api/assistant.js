/**
 * API layer for the DPP Assistant.
 *
 * - Chat runs through the OData action `aiChat` (backend-orchestrated agent).
 * - Document extraction posts raw file bytes to the custom `/ai/extract` route.
 * - Creating a proposed record and running approve/publish reuse the SAME guarded
 *   flows the rest of the app uses (importXxx / bound DPP actions), so every write
 *   goes through the existing tenant + role + validation guards.
 */

import { callUnboundAction, callAction, parseJsonFunctionResult, ApiError } from './client';
import { toUserMessage } from './errors';

/** Map a proposal entity to its import action + default status. */
const IMPORT = {
  product: { action: 'importProducts', status: 'draft' },
  variant: { action: 'importVariants', status: 'active' },
  batch: { action: 'importBatches', status: 'draft' },
  bom: { action: 'importBOM', status: null },
};

/**
 * Send the conversation to the assistant.
 * @param {{ messages: {role:string, content:string}[], context?: object }} args
 * @returns {Promise<{ reply: string, proposals: any[], actions: any[], model?: string }>}
 */
export async function sendChat({ messages, context }) {
  const raw = await callUnboundAction('aiChat', {
    messages: JSON.stringify(messages),
    context: context ? JSON.stringify(context) : undefined,
  });
  const parsed = parseJsonFunctionResult(raw);
  return { reply: '', proposals: [], actions: [], ...parsed };
}

/**
 * Extract draft fields from an uploaded document (PDF/PNG/JPEG).
 * @param {{ file: File, entity?: 'product'|'variant'|'batch' }} args
 * @returns {Promise<{ entity: string, fields: object, model?: string }>}
 */
export async function extractDocument({ file, entity = 'product' }) {
  let res;
  try {
    res = await fetch(`/ai/extract?entity=${encodeURIComponent(entity)}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
  } catch {
    const err = new ApiError(0, null, '');
    err.message = toUserMessage(err);
    throw err;
  }
  if (!res.ok) {
    let body = null;
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    const err = new ApiError(res.status, body, body?.error?.message || `${res.status}`);
    err.message = toUserMessage(err);
    throw err;
  }
  return res.json();
}

/** Rows for the import action. `bom` proposals carry an array; the rest a single object. */
function toRows(entity, fields) {
  const def = IMPORT[entity];
  if (entity === 'bom') return Array.isArray(fields) ? fields : [];
  return [def.status ? { status: def.status, ...fields } : { ...fields }];
}

/** Parse the ImportResult.errors JSON string into an array. */
function parseErrors(result) {
  try {
    return JSON.parse(result.errors || '[]');
  } catch {
    return [];
  }
}

/**
 * Validate a (possibly edited) proposal without writing — reuses importXxx dryRun.
 * @returns {Promise<{ valid: boolean, errors: any[] }>}
 */
export async function validateProposal({ entity, fields }) {
  const def = IMPORT[entity];
  const result = await callUnboundAction(def.action, {
    rows: JSON.stringify(toRows(entity, fields)),
    dryRun: true,
  });
  return { valid: result.skipped === 0, errors: parseErrors(result) };
}

/**
 * Commit a proposal — actually create the record (dryRun:false).
 * @returns {Promise<{ created: number, valid: boolean, errors: any[] }>}
 */
export async function commitProposal({ entity, fields }) {
  const def = IMPORT[entity];
  const result = await callUnboundAction(def.action, {
    rows: JSON.stringify(toRows(entity, fields)),
    dryRun: false,
  });
  return { created: result.created || 0, valid: result.skipped === 0, errors: parseErrors(result) };
}

/**
 * Run a DPP lifecycle action the assistant offered.
 * @param {{ dppId: string, action: 'approve'|'publish' }} args
 */
export function runLifecycle({ dppId, action }) {
  if (action === 'publish') {
    return callAction('DPPs', dppId, 'publishDPP', { change_reason: 'Published via DPP Assistant' });
  }
  return callAction('DPPs', dppId, 'approveDPP', {});
}
