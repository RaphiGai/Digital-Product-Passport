namespace dpp;
using { dpp.Users } from './org';

entity PendingImports {
  key ID                    : UUID;
  entity_type               : String(30);   // 'products' | 'variants' | 'batches' | 'bom' | 'business_partners'
  file_name                 : String(255);
  total_rows                : Integer;
  valid_rows                : Integer;
  skipped_rows              : Integer;
  rows_data                 : LargeString;  // JSON: original parsed rows (for re-run on approval)
  validation_issues         : LargeString;  // JSON: [{row, field, message, severity}]
  status                    : String(20);   // 'pending' | 'approved' | 'rejected'
  owning_organization_ID    : UUID;
  created_at                : Timestamp;
  created_by                : Association to Users;
  reviewed_at               : Timestamp;
  reviewed_by               : Association to Users;
  review_note               : String(500);
}
