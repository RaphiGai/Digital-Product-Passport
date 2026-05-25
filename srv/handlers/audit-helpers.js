'use strict';

const cds = require('@sap/cds');
const { randomUUID } = require('crypto');

/**
 * Persist a single AuditEvents row. Callers fire-and-forget but should still
 * await the promise so that the AuditEvents row hits the same transaction.
 */
async function recordAuditEvent(req, {
  event_type, entity_type, entity_id = null,
  result = 'success', records_in = null, records_ok = null, records_err = null,
  message = null, payload = null
}) {
  const { AuditEvents } = cds.entities('dpp');
  await INSERT.into(AuditEvents).entries({
    ID: randomUUID(),
    event_time: new Date().toISOString(),
    user_id: req?.user?.id || 'system',
    event_type,
    entity_type,
    entity_id,
    result,
    records_in,
    records_ok,
    records_err,
    message,
    payload: payload ? (typeof payload === 'string' ? payload : JSON.stringify(payload)) : null
  });
}

module.exports = { recordAuditEvent };
