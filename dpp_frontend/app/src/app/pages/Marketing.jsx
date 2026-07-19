import { PageHeader } from './ComingSoon';
import { MarketingLinksManager } from '@/ui/MarketingLinksManager';

/**
 * Marketing campaigns admin page (US5.8). Org-wide overview of all promotional links;
 * each link can stay org-wide or be attached to a specific DPP. Editing is gated to
 * company_advanced inside MarketingLinksManager.
 */
export function Marketing() {
  return (
    <div className="space-y-6">
      <PageHeader title="Marketing" subtitle="Promotional links shown on consumer passports" />
      <MarketingLinksManager />
    </div>
  );
}
