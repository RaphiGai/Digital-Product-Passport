const KEY = 'dpp:import_history';
const MAX = 200;

/** @returns {Array} newest-first list of import log entries */
export function loadImportHistory() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

/**
 * Prepend a new entry and persist (capped at MAX entries).
 * @param {{
 *   id: string,
 *   timestamp: string,
 *   category: string,
 *   total: number,
 *   created: number,
 *   skipped: number,
 *   errorCount: number,
 *   status: 'success'|'partial'|'failed'
 * }} entry
 */
export function saveImportEntry(entry) {
  const history = loadImportHistory();
  history.unshift(entry);
  if (history.length > MAX) history.length = MAX;
  localStorage.setItem(KEY, JSON.stringify(history));
}

export function clearImportHistory() {
  localStorage.removeItem(KEY);
}
