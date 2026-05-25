'use strict';

// CAP auto-loads `srv/<service-name>.js` as the implementation for the matching
// service defined in `srv/<service-name>.cds`. Wire up the three handler modules
// in registration order: product defaults & BOM guards → DPP actions → validation.
const productHandlers = require('./handlers/product-handlers');
const dppHandlers = require('./handlers/dpp-handlers');
const validationHandlers = require('./handlers/validation-handlers');

module.exports = (srv) => {
  productHandlers(srv);
  dppHandlers(srv);
  validationHandlers(srv);
};
