import { useState } from 'react';
import { Trash2, CheckCircle2, AlertCircle, AlertTriangle, Clock } from 'lucide-react';
import { useMe } from '@/auth/useMe';
import { Button } from '@/ui/Button';
import { Badge } from '@/ui/Badge';
import { Card, CardTitle } from '@/ui/Card';
import { TemplateDropdown } from '@/ui/TemplateDropdown';
import { ImportDropdown } from '@/ui/ImportWizard';
import { downloadTemplate } from '@/lib/importTemplates';
import { loadImportHistory, clearImportHistory } from '@/lib/importHistory';
import { cn } from '@/lib/cn';

const CATEGORY_LABEL = {
  products:          'Products',
  variants:          'Variants',
  batches:           'Batches',
  bom:               'BOM / Hierarchy',
  business_partners: 'Business Partners',
};

function StatusBadgeLocal({ status }) {
  if (status === 'success') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
        <CheckCircle2 className="h-3 w-3" /> Success
      </span>
    );
  }
  if (status === 'partial') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
        <AlertTriangle className="h-3 w-3" /> Partial
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
      <AlertCircle className="h-3 w-3" /> Failed
    </span>
  );
}

function formatDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function shortId(uuid) {
  return uuid.slice(0, 8).toUpperCase();
}

const ALL_TEMPLATES = [
  { key: 'products',          label: 'Products template',          onClick: () => downloadTemplate('products') },
  { key: 'variants',          label: 'Variants template',           onClick: () => downloadTemplate('variants') },
  { key: 'batches',           label: 'Batches template',            onClick: () => downloadTemplate('batches') },
  { key: 'bom',               label: 'BOM / Hierarchy template',    onClick: () => downloadTemplate('bom') },
  { key: 'business_partners', label: 'Business Partners template',  onClick: () => downloadTemplate('business_partners') },
];

const ALL_IMPORT_OPTIONS = [
  { key: 'products',          label: 'Import products' },
  { key: 'variants',          label: 'Import variants' },
  { key: 'batches',           label: 'Import batches' },
  { key: 'bom',               label: 'Import BOM / Hierarchy' },
  { key: 'business_partners', label: 'Import business partners' },
];

export function Import() {
  const { data: me } = useMe();
  const [history, setHistory] = useState(() => loadImportHistory());

  // Guard — only company_advanced can reach this page
  if (me && me.role !== 'company_advanced') {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-ink-muted">
        You do not have permission to view this page.
      </div>
    );
  }

  function refreshHistory() {
    setHistory(loadImportHistory());
  }

  function handleClear() {
    clearImportHistory();
    setHistory([]);
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Import</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Download templates, fill them in, and upload them to bulk-create records.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <TemplateDropdown templates={ALL_TEMPLATES} label="Download template" />
          <ImportDropdown
            label="Import"
            options={ALL_IMPORT_OPTIONS}
            onImported={refreshHistory}
          />
        </div>
      </div>

      {/* How-to note */}
      <Card>
        <CardTitle>How it works</CardTitle>
        <ol className="mt-3 space-y-2 text-sm text-ink-muted list-decimal list-inside">
          <li>Download the template for the data type you want to import.</li>
          <li>Fill in the spreadsheet from row 3 onwards (row 1 = headers, row 2 = format hints).</li>
          <li>Click <span className="font-medium text-ink">Import</span>, select the data type, and upload your file.</li>
          <li>Review the validation results, then confirm to create the records.</li>
        </ol>
      </Card>

      {/* History table */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">Import history</h2>
          {history.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleClear}>
              <Trash2 className="h-3.5 w-3.5" /> Clear history
            </Button>
          )}
        </div>

        {history.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Clock className="h-8 w-8 text-ink-muted/40" />
              <p className="text-sm text-ink-muted">No imports yet. History appears here after you upload a file.</p>
            </div>
          </Card>
        ) : (
          <Card className="p-0">
            {/* Column headers */}
            <div className="grid grid-cols-[180px_100px_160px_80px_80px_80px_100px] gap-4 border-b border-black/5 px-5 py-2.5 text-xs font-medium uppercase tracking-wider text-ink-muted">
              <span>Date &amp; time</span>
              <span>Import ID</span>
              <span>Category</span>
              <span className="text-right">Total</span>
              <span className="text-right">Created</span>
              <span className="text-right">Skipped</span>
              <span>Status</span>
            </div>

            {history.map((entry) => (
              <div
                key={entry.id}
                className="grid grid-cols-[180px_100px_160px_80px_80px_80px_100px] gap-4 items-center border-b border-black/5 px-5 py-3 last:border-0 hover:bg-black/[0.015]"
              >
                <span className="text-xs text-ink-muted tabular-nums">
                  {formatDateTime(entry.timestamp)}
                </span>
                <span className="font-mono text-xs text-ink-muted">{shortId(entry.id)}</span>
                <span>
                  <Badge tone="gray">{CATEGORY_LABEL[entry.category] ?? entry.category}</Badge>
                </span>
                <span className="text-right text-sm tabular-nums text-ink">{entry.total}</span>
                <span className={cn('text-right text-sm tabular-nums font-medium', entry.created > 0 ? 'text-green-700' : 'text-ink-muted')}>
                  {entry.created}
                </span>
                <span className={cn('text-right text-sm tabular-nums', entry.skipped > 0 ? 'text-amber-700' : 'text-ink-muted')}>
                  {entry.skipped}
                </span>
                <StatusBadgeLocal status={entry.status} />
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
