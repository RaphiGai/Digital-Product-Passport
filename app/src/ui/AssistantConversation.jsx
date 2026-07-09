import { useEffect, useRef, useState } from 'react';
import { Send, Bot, User, CheckCircle2, ShieldCheck, Rocket } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';
import { Textarea } from './Form';
import { Banner } from './Breadcrumb';
import { ProposalCard } from './ProposalCard';
import { runLifecycle } from '@/api/assistant';

/**
 * Shared conversation UI for the DPP Assistant — used by both the full page and
 * the floating widget. Renders the transcript, inline proposal cards, one-click
 * lifecycle actions, and the composer.
 *
 * @param {{
 *   assistant: ReturnType<typeof import('@/app/hooks/useAssistant').useAssistant>,
 *   canWrite: boolean,
 *   compact?: boolean,
 *   emptyHint?: string,
 * }} props
 */
export function AssistantConversation({ assistant, canWrite, compact = false, emptyHint }) {
  const { messages, send, addSystemNote, loading, error } = assistant;
  const [draft, setDraft] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  function submit(e) {
    e?.preventDefault();
    const text = draft;
    setDraft('');
    send(text);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-1 py-2">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-ink-muted">
            <Bot className="h-8 w-8 text-brand-500" />
            <p className="text-sm">{emptyHint || 'Ask me to create a product, variant, BOM or batch — or what a DPP still needs to be published.'}</p>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={cn('flex gap-2', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            {m.role === 'assistant' && (
              <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                <Bot className="h-3.5 w-3.5" />
              </span>
            )}
            <div className={cn('min-w-0', m.role === 'user' ? 'max-w-[85%]' : 'w-full')}>
              {m.content && (
                <div
                  className={cn(
                    'whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm',
                    m.role === 'user'
                      ? 'bg-brand-600 text-white'
                      : m.system
                        ? 'bg-brand-50 text-brand-800'
                        : 'bg-gray-100 text-ink dark:bg-white/10'
                  )}
                >
                  {m.system && <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />}
                  {m.content}
                </div>
              )}

              {Array.isArray(m.proposals) && m.proposals.length > 0 && (
                <div className="mt-2 space-y-3">
                  {m.proposals.map((p, i) => (
                    <ProposalCard
                      key={i}
                      proposal={p}
                      canWrite={canWrite}
                      onCommitted={(entity) => addSystemNote(`${entity[0].toUpperCase()}${entity.slice(1)} created successfully.`)}
                    />
                  ))}
                </div>
              )}

              {Array.isArray(m.actions) && m.actions.filter((a) => a.ready).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {m.actions.filter((a) => a.ready).map((a, i) => (
                    <LifecycleButton key={i} action={a} canWrite={canWrite} onDone={addSystemNote} />
                  ))}
                </div>
              )}
            </div>
            {m.role === 'user' && (
              <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-ink-muted dark:bg-white/10">
                <User className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-brand-700">
              <Bot className="h-3.5 w-3.5" />
            </span>
            <span className="animate-pulse">Thinking…</span>
          </div>
        )}
      </div>

      {error && (
        <div className="px-1 pb-2">
          <Banner kind="error">{error}</Banner>
        </div>
      )}

      <form onSubmit={submit} className="flex items-end gap-2 border-t border-black/5 pt-3">
        <Textarea
          rows={compact ? 2 : 2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) submit(e);
          }}
          placeholder="Message the DPP Assistant…  (Enter to send, Shift+Enter for a new line)"
          className="flex-1"
        />
        <Button type="submit" disabled={loading || !draft.trim()} aria-label="Send">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

function LifecycleButton({ action, canWrite, onDone }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const isPublish = action.action === 'publish';
  const Icon = isPublish ? Rocket : ShieldCheck;

  if (!canWrite) return null;
  if (done) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700">
        <CheckCircle2 className="h-3.5 w-3.5" /> {isPublish ? 'Published' : 'Approved'}
      </span>
    );
  }

  async function run() {
    setBusy(true);
    try {
      await runLifecycle({ dppId: action.dppId, action: action.action });
      setDone(true);
      onDone?.(`DPP ${isPublish ? 'published' : 'approved'} successfully.`);
    } catch (e) {
      onDone?.(e?.message || 'The action could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant={isPublish ? 'primary' : 'outline'} onClick={run} disabled={busy}>
      <Icon className="h-4 w-4" />
      {busy ? 'Working…' : isPublish ? 'Publish DPP' : 'Approve DPP'}
      {action.product_name ? ` · ${action.product_name}` : ''}
    </Button>
  );
}
