import { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Bot, X, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useMe } from '@/auth/useMe';
import { useAssistant } from '@/app/hooks/useAssistant';
import { AssistantConversation } from './AssistantConversation';

/**
 * Global floating chat launcher, mounted once in AppShell. Opens a compact chat
 * panel for quick questions and actions (no document upload — that lives on the
 * full /assistant page). Passes the current route as context so the assistant can
 * resolve references like "this product". Hidden for business_partner logins.
 */
export function AssistantWidget() {
  const { data: me } = useMe();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const assistant = useAssistant({ context: { route: location.pathname } });

  if (!me || me.role === 'business_partner') return null;
  const canWrite = me.role === 'company_advanced';

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[70vh] max-h-[560px] w-[min(92vw,384px)] flex-col rounded-2xl border border-black/10 bg-card shadow-2xl">
          <div className="flex items-center gap-2 border-b border-black/5 px-4 py-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-brand-700">
              <Bot className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold text-ink">DPP Assistant</span>
            <div className="ml-auto flex items-center gap-1">
              <Link to="/assistant" title="Open full assistant" className="rounded-md p-1.5 text-ink-muted hover:bg-gray-100 hover:text-ink">
                <Maximize2 className="h-4 w-4" />
              </Link>
              <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-md p-1.5 text-ink-muted hover:bg-gray-100 hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 px-3 pb-3">
            <AssistantConversation assistant={assistant} canWrite={canWrite} compact emptyHint="Ask a quick question or request an action. Open the full page for document upload." />
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close assistant' : 'Open assistant'}
        className={cn(
          'fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg transition-transform hover:bg-brand-700 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
        )}
      >
        {open ? <X className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
      </button>
    </>
  );
}
