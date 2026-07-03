'use strict';

const { loadCatalogue } = require('../lib/catalogue');

/**
 * fieldCatalogue(category) — serves the merged per-category attribute catalogue
 * to the frontend as a JSON string. Read-only, NOT a write event → readable by
 * company_user too (auth itself is enforced by the central before('*') gate).
 * The catalogue is global master data, so no tenant scoping applies (same
 * contract as the ProductCategories code list).
 */
module.exports = (srv) => {
  srv.on('fieldCatalogue', async (req) => {
    const category = req.data.category || null;
    const catalogue = await loadCatalogue(category);
    return JSON.stringify({
      category: catalogue.category,
      sections: catalogue.sections,
      fields: catalogue.fields,
    });
  });
};
