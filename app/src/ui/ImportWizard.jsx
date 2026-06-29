import { useState, useRef, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { Upload, X, AlertCircle, AlertTriangle, CheckCircle2, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/ui/Button';
import { callUnboundAction } from '@/api/client';
import { parseTemplateSheet, getPreviewColumns } from '@/lib/importTemplates';
import { saveImportEntry } from '@/lib/importHistory';

// ── Constants ──────────────────────────────────────────────────────────────

const ACTION = {
  products:          'importProducts',
  variants:          'importVariants',
  batches:           'importBatches',
  bom:               'importBOM',
  business_partners: 'importBusinessPartners',
};
const INVALIDATE = {
  products:          'Products',
  variants:          'ProductVariants',
  batches:           'Batches',
  bom:               'ProductBOMs',
  business_partners: 'BusinessPartners',
};
const TYPE_LABEL = {
  products:          'Products',
  variants:          'Variants',
  batches:           'Batches',
  bom:               'BOM / Hierarchy',
  business_partners: 'Business Partners',
};

// ── Sub-components ─────────────────────────────────────────────────────────

function IssueTag({ severity }) {
  if (severity === 'warning') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        <AlertTriangle className="h-3 w-3" /> warning
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
      <AlertCircle className="h-3 w-3" /> error
    </span>
  );
}

// ── Main ImportWizard ──────────────────────────────────────────────────────

/**
 * Self-contained import wizard rendered as a modal overlay.
 * Handles: file upload → parse → validate (dryRun=true) → commit (dryRun=false).
 *
 * @param {{
 *   type: 'products' | 'batches' | 'bom',
 *   label?: string,
 *   size?: 'sm' | 'md',
 *   onImported?: () => void
 * }} props
 */
export function ImportWizard({ type, label, size = 'md', onImported }) {
  const [open, setOpen]           = useState(false);
  const [step, setStep]           = useState('upload'); // upload | preview | done
  const [rows, setRows]           = useState([]);
  const [parseError, setParseError] = useState(null);
  const [issues, setIssues]       = useState([]);
  const [validated, setValidated] = useState(false);
  const [result, setResult]       = useState(null);
  const [busy, setBusy]           = useState(false);
  const fileRef                   = useRef(null);
  const qc                        = useQueryClient();

  const displayLabel = label ?? `Import ${TYPE_LABEL[type] ?? type}`;

  function reset() {
    setStep('upload');
    setRows([]);
    setParseError(null);
    setIssues([]);
    setValidated(false);
    setResult(null);
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  function close() {
    setOpen(false);
    reset();
  }

  // ── File parsing ──────────────────────────────────────────────────────

  async function handleFile(file) {
    if (!file) return;
    setParseError(null);
    setIssues([]);
    setValidated(false);
    try {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const { rows: parsed } = parseTemplateSheet(type, ws);
      if (parsed.length === 0) {
        setParseError('No data rows found. Make sure your file has data starting from row 3 (row 1 = headers, row 2 = format hints).');
        return;
      }
      setRows(parsed);
      setStep('preview');
    } catch (e) {
      setParseError(e.message || 'Failed to read the file. Make sure it is a valid .xlsx file.');
    }
  }

  function onFileChange(e) {
    handleFile(e.target.files?.[0] ?? null);
  }

  // ── Drag-and-drop ─────────────────────────────────────────────────────

  const [dragging, setDragging] = useState(false);

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  // ── Validate / Import ─────────────────────────────────────────────────

  const validate = useCallback(async () => {
    setBusy(true);
    try {
      const res = await callUnboundAction(ACTION[type], {
        rows: JSON.stringify(rows),
        dryRun: true,
      });
      const parsed = typeof res.errors === 'string' ? JSON.parse(res.errors) : (res.errors ?? []);
      setIssues(parsed);
      setValidated(true);
    } catch (e) {
      setIssues([{ row: 0, field: '', message: e.message, severity: 'error' }]);
      setValidated(true);
    } finally {
      setBusy(false);
    }
  }, [type, rows]);

  const commitImport = useCallback(async () => {
    setBusy(true);
    try {
      const res = await callUnboundAction(ACTION[type], {
        rows: JSON.stringify(rows),
        dryRun: false,
      });
      const parsedIssues = typeof res.errors === 'string' ? JSON.parse(res.errors) : (res.errors ?? []);
      setResult({ ...res, parsedIssues });
      setStep('done');
      if (INVALIDATE[type]) {
        qc.invalidateQueries({ queryKey: [INVALIDATE[type]] });
      }
      const errorCount = parsedIssues.filter((i) => i.severity === 'error').length;
      saveImportEntry({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        category: type,
        total: res.total ?? rows.length,
        created: res.created ?? 0,
        skipped: res.skipped ?? 0,
        errorCount,
        status: (res.created ?? 0) === 0 ? 'failed' : errorCount > 0 ? 'partial' : 'success',
      });
      onImported?.();
    } catch (e) {
      setIssues([{ row: 0, field: '', message: e.message, severity: 'error' }]);
    } finally {
      setBusy(false);
    }
  }, [type, rows, qc, onImported]);

  // ── Derived values ────────────────────────────────────────────────────

  const errorsByRow = useMemo(() => {
    const map = new Map();
    for (const issue of issues) {
      if (!map.has(issue.row)) map.set(issue.row, []);
      map.get(issue.row).push(issue);
    }
    return map;
  }, [issues]);

  const hardErrors  = useMemo(() => issues.filter((i) => i.severity === 'error'), [issues]);
  const warnings    = useMemo(() => issues.filter((i) => i.severity === 'warning'), [issues]);
  const validCount  = useMemo(
    () => rows.filter((_, i) => !(errorsByRow.get(i + 1) ?? []).some((e) => e.severity === 'error')).length,
    [rows, errorsByRow]
  );
  const previewCols = useMemo(() => getPreviewColumns(type), [type]);

  // ── Button (trigger) ──────────────────────────────────────────────────

  const btnH = size === 'sm' ? 'h-8 px-3 text-sm' : 'h-10 px-4 text-sm';
  const triggerBtn = (
    <button
      className={cn(
        'inline-flex items-center gap-2 font-medium rounded-lg border border-gray-300 bg-white text-ink hover:bg-gray-50 transition-colors',
        btnH
      )}
      onClick={() => setOpen(true)}
    >
      <Upload className="h-4 w-4" />
      {displayLabel}
    </button>
  );

  if (!open) return triggerBtn;

  // ── Modal ─────────────────────────────────────────────────────────────

  return (
    <>
      {triggerBtn}
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6">
        <div className="w-full max-w-3xl rounded-xl bg-white shadow-2xl">

          {/* Header */}
          <div className="flex items-center justify-between border-b border-black/8 px-6 py-4">
            <div>
              <h2 className="text-base font-semibold text-ink">
                Import {TYPE_LABEL[type] ?? type}
              </h2>
              {step === 'upload' && (
                <p className="mt-0.5 text-xs text-ink-muted">
                  Use the downloaded template. Data starts from row 3 (row 1 = headers, row 2 = format hints).
                </p>
              )}
              {step === 'preview' && (
                <p className="mt-0.5 text-xs text-ink-muted">
                  {rows.length} row{rows.length !== 1 ? 's' : ''} parsed — validate before importing.
                </p>
              )}
              {step === 'done' && (
                <p className="mt-0.5 text-xs text-ink-muted">Import complete.</p>
              )}
            </div>
            <button
              className="rounded-lg p-1.5 text-ink-muted hover:bg-gray-100"
              onClick={close}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5">

            {/* ── Step: upload ── */}
            {step === 'upload' && (
              <div>
                <div
                  className={cn(
                    'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-12 transition-colors cursor-pointer',
                    dragging ? 'border-brand-400 bg-brand-50' : 'border-black/15 hover:border-brand-300 hover:bg-gray-50'
                  )}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="h-8 w-8 text-ink-muted" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-ink">Drop your .xlsx file here</p>
                    <p className="text-xs text-ink-muted">or click to browse</p>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={onFileChange}
                  />
                </div>
                {parseError && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    {parseError}
                  </div>
                )}
              </div>
            )}

            {/* ── Step: preview ── */}
            {step === 'preview' && (
              <div className="space-y-4">
                {/* Validation result banner */}
                {validated && (
                  <div className={cn(
                    'flex items-start gap-3 rounded-lg px-4 py-3 text-sm',
                    hardErrors.length ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
                  )}>
                    {hardErrors.length
                      ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    }
                    <span>
                      {hardErrors.length
                        ? `${hardErrors.length} error${hardErrors.length !== 1 ? 's' : ''} found — ${rows.length - validCount} row${rows.length - validCount !== 1 ? 's' : ''} will be skipped.`
                        : `All ${rows.length} row${rows.length !== 1 ? 's' : ''} are valid.`
                      }
                      {warnings.length > 0 && (
                        <> {warnings.length} warning{warnings.length !== 1 ? 's' : ''} (rows still imported with notes).</>
                      )}
                    </span>
                  </div>
                )}

                {/* Preview table */}
                <div className="overflow-x-auto rounded-lg border border-black/8">
                  <table className="w-full min-w-max text-sm">
                    <thead>
                      <tr className="border-b border-black/8 bg-gray-50/80">
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-ink-muted">#</th>
                        {previewCols.map((c) => (
                          <th key={c.fieldName} className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                            {c.label}
                          </th>
                        ))}
                        {validated && <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-ink-muted">Issues</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 50).map((row, i) => {
                        const rowNum    = i + 1;
                        const rowIssues = errorsByRow.get(rowNum) ?? [];
                        const hasError  = rowIssues.some((e) => e.severity === 'error');
                        const hasWarn   = rowIssues.some((e) => e.severity === 'warning');
                        return (
                          <tr
                            key={i}
                            className={cn(
                              'border-b border-black/5 last:border-0',
                              hasError ? 'bg-red-50' : hasWarn ? 'bg-amber-50/60' : 'bg-white'
                            )}
                          >
                            <td className="px-3 py-2 text-xs text-ink-muted">{rowNum}</td>
                            {previewCols.map((c) => (
                              <td key={c.fieldName} className="px-3 py-2 text-xs text-ink">
                                {row[c.fieldName] || <span className="text-ink-muted">—</span>}
                              </td>
                            ))}
                            {validated && (
                              <td className="px-3 py-2">
                                {rowIssues.length > 0 ? (
                                  <div className="space-y-1">
                                    {rowIssues.map((issue, j) => (
                                      <IssueTag key={j} severity={issue.severity} />
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-xs text-green-600">✓</span>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {rows.length > 50 && (
                    <p className="border-t border-black/5 px-4 py-2 text-xs text-ink-muted">
                      Showing first 50 of {rows.length} rows.
                    </p>
                  )}
                </div>

                {/* Issues detail list */}
                {validated && issues.length > 0 && (
                  <div className="max-h-52 overflow-y-auto rounded-lg border border-black/8">
                    <div className="border-b border-black/8 bg-gray-50/80 px-4 py-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
                      Issues ({issues.length})
                    </div>
                    {issues.map((issue, i) => (
                      <div
                        key={i}
                        className={cn(
                          'flex items-start gap-3 border-b border-black/5 px-4 py-2.5 last:border-0 text-xs',
                          issue.severity === 'error' ? 'text-red-700' : 'text-amber-700'
                        )}
                      >
                        {issue.severity === 'error'
                          ? <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        }
                        <span>
                          {issue.row > 0 && <span className="font-medium">Row {issue.row}</span>}
                          {issue.field && <span className="text-ink-muted"> · {issue.field}</span>}
                          {' — '}
                          {issue.message}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Step: done ── */}
            {step === 'done' && result && (
              <div className="py-4 text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-green-500" />
                <h3 className="mt-3 text-base font-semibold text-ink">Import complete</h3>
                <p className="mt-1 text-sm text-ink-muted">
                  <span className="font-medium text-green-700">{result.created}</span> record{result.created !== 1 ? 's' : ''} created
                  {result.skipped > 0 && (
                    <>, <span className="font-medium text-amber-700">{result.skipped}</span> skipped</>
                  )}
                  {' '}out of <span className="font-medium">{result.total}</span> total rows.
                </p>
                {result.parsedIssues?.length > 0 && (
                  <div className="mt-4 max-h-40 overflow-y-auto rounded-lg border border-black/8 text-left">
                    {result.parsedIssues.map((issue, i) => (
                      <div key={i} className={cn(
                        'flex items-start gap-2 border-b border-black/5 px-3 py-2 last:border-0 text-xs',
                        issue.severity === 'error' ? 'text-red-700' : 'text-amber-700'
                      )}>
                        {issue.severity === 'error'
                          ? <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        }
                        {issue.row > 0 && <span className="font-medium">Row {issue.row} — </span>}
                        {issue.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-black/8 px-6 py-4">
            <div>
              {step === 'preview' && (
                <button
                  className="text-sm text-ink-muted hover:text-ink"
                  onClick={() => { reset(); }}
                >
                  ← Upload a different file
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={close}>
                {step === 'done' ? 'Close' : 'Cancel'}
              </Button>

              {step === 'preview' && !validated && (
                <Button onClick={validate} disabled={busy}>
                  {busy ? 'Validating…' : 'Validate'}
                </Button>
              )}

              {step === 'preview' && validated && (
                <Button
                  onClick={commitImport}
                  disabled={busy || validCount === 0}
                >
                  {busy
                    ? 'Importing…'
                    : validCount === 0
                      ? 'No valid rows'
                      : `Import ${validCount} row${validCount !== 1 ? 's' : ''}`
                  }
                </Button>
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}

// ── ImportDropdown ─────────────────────────────────────────────────────────

const BASE =
  'inline-flex items-center justify-center gap-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:pointer-events-none disabled:opacity-50 border border-gray-300 bg-white text-ink hover:bg-gray-50 text-sm';

/**
 * Dropdown button that lets the user pick an import type; selecting one opens
 * the ImportWizard modal for that type.  For a single option it renders a
 * plain button.
 *
 * @param {{
 *   options: Array<{ key: string, label: string }>,
 *   label?: string,
 *   size?: 'sm' | 'md',
 *   onImported?: () => void
 * }} props
 */
export function ImportDropdown({ options, label = 'Import', size = 'md', onImported }) {
  const [open, setOpen]           = useState(false);
  const [activeType, setActiveType] = useState(null);
  const ref                       = useRef(null);

  // Close dropdown on outside click
  const handleDocClick = useCallback((e) => {
    if (ref.current && !ref.current.contains(e.target)) setOpen(false);
  }, []);

  // Register/unregister global listener
  const [listening, setListening] = useState(false);
  if (open && !listening) {
    document.addEventListener('mousedown', handleDocClick);
    setListening(true);
  }
  if (!open && listening) {
    document.removeEventListener('mousedown', handleDocClick);
    setListening(false);
  }

  const h = size === 'sm' ? 'h-8 px-3' : 'h-10 px-4';

  return (
    <div ref={ref} className="relative">
      {/* Wizard modal — rendered when a type is selected */}
      {activeType && (
        <ImportWizard
          key={activeType}
          type={activeType}
          label={options.find((o) => o.key === activeType)?.label ?? label}
          size={size}
          onImported={() => { setActiveType(null); onImported?.(); }}
        />
      )}

      {/* Trigger button — hidden while a wizard is active */}
      {!activeType && (
        options.length === 1 ? (
          <button
            className={cn(BASE, h, 'rounded-lg')}
            onClick={() => setActiveType(options[0].key)}
          >
            <Upload className="h-4 w-4" />
            {label}
          </button>
        ) : (
          <>
            <button
              className={cn(BASE, h, 'rounded-lg')}
              onClick={() => setOpen((o) => !o)}
            >
              <Upload className="h-4 w-4" />
              {label}
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
            </button>

            {open && (
              <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-lg border border-black/10 bg-white py-1 shadow-lg">
                {options.map((opt) => (
                  <button
                    key={opt.key}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-ink hover:bg-gray-50"
                    onClick={() => { setOpen(false); setActiveType(opt.key); }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
