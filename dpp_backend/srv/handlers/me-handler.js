'use strict';

const cds = require('@sap/cds');
const { getAppRole, requireActiveUser } = require('./auth-helpers');

module.exports = (srv) => {
  srv.on('me', async (req) => {
    const orgId = await requireActiveUser(req);
    const { Users, Organizations } = cds.entities('dpp');

    let userRow = await SELECT.one
      .from(Users)
      .columns('email', 'display_name', 'must_reset_password', 'appearance_theme', 'business_partner_ID')
      .where({ external_user_id: req.user.id });
    if (!userRow) {
      userRow = await SELECT.one
        .from(Users)
        .columns('email', 'display_name', 'must_reset_password', 'appearance_theme', 'business_partner_ID')
        .where({ email: req.user.id });
    }

    const org = await SELECT.one
      .from(Organizations)
      .columns('tenant_id')
      .where({ ID: orgId });

    // business_partner logins: surface the linked partner so the portal page
    // can greet with the partner name without reading BusinessPartners.
    let partner = null;
    if (userRow?.business_partner_ID) {
      const { BusinessPartners } = cds.entities('dpp');
      partner = await SELECT.one
        .from(BusinessPartners)
        .columns('ID', 'name')
        .where({ ID: userRow.business_partner_ID });
    }

    return {
      id:               req.user.id,
      displayName:      userRow?.display_name || req.user.id,
      email:            userRow?.email || '',
      role:             getAppRole(req),
      organizationId:   orgId,
      tenantId:         org?.tenant_id || '',
      mustResetPassword: !!userRow?.must_reset_password,
      appearanceTheme:  userRow?.appearance_theme || 'green',
      businessPartnerId:   partner?.ID || null,
      businessPartnerName: partner?.name || null
    };
  });
};
