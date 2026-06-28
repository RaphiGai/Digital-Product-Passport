'use strict';

const cds = require('@sap/cds');
const { getUserOrg, requireOwningOrg } = require('./auth-helpers');
const dppHandlers = require('./dpp-handlers'); // for reevaluateDrift (one-way require)

function rejectCrossOrgWrite(req, fieldValue, callerOrgId) {
  if (fieldValue !== undefined && fieldValue !== callerOrgId) {
    req.reject(403, 'Cannot assign marketing links to a different organization.');
  }
}

/**
 * DPPs whose snapshot embeds a marketing link: a dpp-specific link affects only that
 * DPP; an org-wide link (dpp_ID null) appears in every DPP of the org.
 */
async function affectedMarketingDppIds(dppId, owningOrgId) {
  const { DPPs } = cds.entities('dpp');
  if (dppId) return [dppId];
  if (!owningOrgId) return [];
  return (await SELECT.from(DPPs).columns('ID').where({ 'product.owning_organization_ID': owningOrgId })).map((r) => r.ID);
}

function checkValidWindow(req) {
  const { valid_from, valid_to } = req.data;
  if (valid_from && valid_to && valid_from > valid_to) {
    req.reject(400, 'The "valid from" date must not be after the "valid to" date.');
  }
}

module.exports = (srv) => {
  const { DPPMarketingLinks } = srv.entities;

  srv.before('CREATE', DPPMarketingLinks, async (req) => {
    if (!req.data.title) req.reject(400, 'A marketing link must have a title.');

    const org = await getUserOrg(req);
    rejectCrossOrgWrite(req, req.data.owning_organization_ID, org.ID);
    if (!req.data.owning_organization_ID) req.data.owning_organization_ID = org.ID;

    // A link may only be attached to one of the caller's own DPPs.
    if (req.data.dpp_ID) {
      await requireOwningOrg(req, 'DPPs', req.data.dpp_ID, 'product.owning_organization_ID');
    }

    checkValidWindow(req);
  });

  srv.before('UPDATE', DPPMarketingLinks, async (req) => {
    rejectCrossOrgWrite(req, req.data.owning_organization_ID, req.user._appOrgId);
    if (req.data.dpp_ID) {
      await requireOwningOrg(req, 'DPPs', req.data.dpp_ID, 'product.owning_organization_ID');
    }
    checkValidWindow(req);
  });

  // The central READ filter does not apply to DELETE, so verify ownership explicitly.
  srv.before('DELETE', DPPMarketingLinks, async (req) => {
    const last = req.params && req.params[req.params.length - 1];
    const id = last && typeof last === 'object' ? last.ID : last;
    if (id) await requireOwningOrg(req, 'DPPMarketingLinks', id, 'owning_organization_ID');
  });

  // Drift: a marketing-link change re-evaluates the affected DPP(s). Capture the link's
  // target DPP / owning org in `before` (the row still exists on DELETE).
  srv.before(['CREATE', 'UPDATE', 'DELETE'], DPPMarketingLinks, async (req) => {
    let dppId = req.data && req.data.dpp_ID;
    let orgId = (req.data && req.data.owning_organization_ID) || req.user._appOrgId || null;
    if (req.event !== 'CREATE' && (dppId === undefined || !orgId)) {
      const last = req.params && req.params[req.params.length - 1];
      const id = last && typeof last === 'object' ? last.ID : last;
      if (id) {
        const row = await SELECT.one.from(cds.entities('dpp').DPPMarketingLinks)
          .columns('dpp_ID', 'owning_organization_ID').where({ ID: id });
        if (row) {
          if (dppId === undefined) dppId = row.dpp_ID;
          if (!orgId) orgId = row.owning_organization_ID;
        }
      }
    }
    req._driftMarketing = { dppId: dppId || null, orgId: orgId || null };
  });
  srv.after(['CREATE', 'UPDATE', 'DELETE'], DPPMarketingLinks, async (_d, req) => {
    const m = req._driftMarketing;
    if (m) await dppHandlers.reevaluateDrift(await affectedMarketingDppIds(m.dppId, m.orgId));
  });
};
