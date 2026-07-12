import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const UnsavedChangesContext = createContext(null);

/**
 * Tracks whether a create/edit form has unsaved changes and guards page exits:
 *  - a browser-level `beforeunload` prompt (refresh / tab close / hard navigation, incl. logout);
 *  - `confirmLeave()`, which in-app links (Sidebar) call before an SPA navigation.
 *
 * Forms flip `setDirty(true|false)` as their contents change and clear it on unmount.
 * `useBlocker` would be cleaner but needs a data router; this app uses <BrowserRouter>.
 */
export function UnsavedChangesProvider({ children }) {
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = ''; // required for the native prompt in some browsers
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // Returns true when it's safe to leave: no changes, or the user confirmed discarding.
  const confirmLeave = useCallback(
    () => !dirty || window.confirm('You have unsaved changes. Leave without saving?'),
    [dirty]
  );

  return (
    <UnsavedChangesContext.Provider value={{ dirty, setDirty, confirmLeave }}>
      {children}
    </UnsavedChangesContext.Provider>
  );
}

/** Safe accessor — returns no-op defaults when used outside the provider. */
export function useUnsavedChanges() {
  return (
    useContext(UnsavedChangesContext) ?? {
      dirty: false,
      setDirty: () => {},
      confirmLeave: () => true
    }
  );
}
