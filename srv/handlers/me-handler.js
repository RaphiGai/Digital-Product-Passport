'use strict';

const cds = require('@sap/cds');
const { getAppRole, requireActiveUser } = require('./auth-helpers');

module.exports = (srv) => {
  srv.on('me', async (req) => {
    const orgId = await requireActiveUser(req);
    const { Users, Organizations } = cds.entities('dpp');

    let userRow = await SELECT.one
      .from(Users)
      .columns('email', 'display_name', 'must_reset_password', 'appearance_theme')
      .where({ external_user_id: req.user.id });
    if (!userRow) {
      userRow = await SELECT.one
        .from(Users)
        .columns('email', 'display_name', 'must_reset_password', 'appearance_theme')
        .where({ email: req.user.id });
    }

    const org = await SELECT.one
      .from(Organizations)
      .columns('tenant_id', 'is_platform_tenant')
      .where({ ID: orgId });

    return {
      id:               req.user.id,
      displayName:      userRow?.display_name || req.user.id,
      email:            userRow?.email || '',
      role:             getAppRole(req),
      organizationId:   orgId,
      tenantId:         org?.tenant_id || '',
      mustResetPassword: !!userRow?.must_reset_password,
      appearanceTheme:  userRow?.appearance_theme || 'green',
      // gates the Field-Catalogue admin UI (global master data — operator only)
      isPlatformAdmin:  getAppRole(req) === 'company_advanced' && org?.is_platform_tenant === true
    };
  });
};
