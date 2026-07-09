import { useCallback, useRef, useState } from 'react';
import { sendChat } from '@/api/assistant';

/**
 * Shared chat state for the DPP Assistant, used by both the full page and the
 * floating widget. Conversation history is kept client-side only (no server-side
 * persistence → no extra data-retention surface). Each assistant turn carries its
 * proposals/actions so the UI can render editable cards / one-click buttons inline.
 *
 * @param {{ context?: object }} [opts]  optional UI context passed to the backend
 */
export function useAssistant({ context } = {}) {
  const [messages, setMessages] = useState([]); // { id, role, content, proposals?, actions? }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef(null);

  const send = useCallback(
    async (text) => {
      const trimmed = (text || '').trim();
      if (!trimmed || loading) return;
      setError('');

      const userMsg = { id: crypto.randomUUID(), role: 'user', content: trimmed };
      // Build the wire history from what the model needs (role + content only).
      const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);

      try {
        const { reply, proposals, actions } = await sendChat({ messages: history, context });
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: 'assistant', content: reply, proposals, actions },
        ]);
      } catch (e) {
        setError(e?.message || 'The assistant is unavailable. Please try again.');
      } finally {
        setLoading(false);
        abortRef.current = null;
      }
    },
    [messages, loading, context]
  );

  /** Append a local system note (e.g. "Product created") without calling the model. */
  const addSystemNote = useCallback((content) => {
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', content, system: true }]);
  }, []);

  /** Append an assistant turn carrying a proposal card (e.g. from a document upload). */
  const addProposalMessage = useCallback((proposal, content) => {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: 'assistant', content: content || '', proposals: [proposal] },
    ]);
  }, []);

  const clear = useCallback(() => {
    setMessages([]);
    setError('');
  }, []);

  return { messages, send, addSystemNote, addProposalMessage, loading, error, clear };
}
