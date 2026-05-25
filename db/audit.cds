using { dpp.identified } from './common';

namespace dpp;

// ----- Audit / import history (NFR Traceability) -----
// Captures imports, exports, publishes, archives, regenerations, deactivations
// — any operation that should remain traceable beyond the entity's own state.
entity AuditEvents : identified {
  event_time  : Timestamp;
  user_id     : String(120);
  event_type  : String(40);  // 'import_products' | 'import_batches' | 'import_bom' |
                             // 'export_products' | 'export_dpp_pdf' | 'publish_dpp' |
                             // 'archive_product' | 'regenerate_qr' | etc.
  entity_type : String(40);  // 'Product' | 'Batch' | 'BOM' | 'DPP' | …
  entity_id   : String(36);  // optional — empty for bulk operations
  result      : String(20);  // 'success' | 'partial' | 'failed'
  records_in  : Integer;     // for imports: rows received
  records_ok  : Integer;     // for imports: rows accepted
  records_err : Integer;     // for imports: rows rejected
  message     : String(500);
  payload     : LargeString; // JSON detail (full report for imports)
}
