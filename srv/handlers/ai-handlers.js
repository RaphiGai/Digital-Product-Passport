'use strict';

const cds = require('@sap/cds');
const LOG = cds.log('dpp/ai');
const { requireActiveUser, getAppRole } = require('./auth-helpers');
const gemini = require('../lib/gemini');
const { buildSystemPrompt } = require('../lib/ai-prompt');
const { toolDeclarations, executeTool, isProposeTool, isLifecycleTool } = require('../lib/ai-tools');
const rateLimit = require('../lib/ai-ratelimit');

/**
 * AI assistant orchestration (unbound action `aiChat`).
 *
 * Backend-orchestrated, tool-calling agent. The loop:
 *   1. send system prompt + conversation + tool declarations to Gemini,
 *   2. if the model requests tool calls, execute them (tenant-scoped, read-only
 *      or dryRun-validation) and feed the results back,
 *   3. repeat until the model returns a final text answer or MAX_TURNS is hit.
 *
 * The action itself performs NO writes: propose* tools only validate via dryRun.
 * Real creation/approval happens frontend-driven through the existing guarded
 * flows. Available to every active user (company_user read-only); the model is
 * told the caller's role so it does not offer writes to read-only users.
 *
 * Returns a JSON string { reply, proposals, model, usage }.
 */

const MAX_TURNS = 8;
const MAX_MESSAGES = 40; // cap conversation length fed to the model

/**
 * Build a user-facing error that survives the central error net in dpp-service.js
 * (which otherwise rewrites any 5xx to a generic message). `expose:true` keeps the
 * clean message; `code` drives the HTTP status. Mirrors srv/lib/credentials.js#fail.
 */
function fail(status, message) {
  return Object.assign(new Error(message), { code: status, status, expose: true });
}

/** Map the SPA's [{role,content}] history to Gemini `contents`. */
function toContents(messages) {
  const out = [];
  for (const m of messages.slice(-MAX_MESSAGES)) {
    const role = m.role === 'assistant' || m.role === 'model' ? 'model' : 'user';
    const text = typeof m.content === 'string' ? m.content : '';
    if (!text.trim()) continue;
    out.push({ role, parts: [{ text }] });
  }
  return out;
}

function parseJsonArg(raw, fallback) {
  if (raw == null) return fallback;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

module.exports = (srv) => {
  srv.on('aiChat', async (req) => {
    const orgId = await requireActiveUser(req);
    const role = getAppRole(req);

    if (!gemini.isConfigured()) {
      LOG.warn('aiChat called but GEMINI_API_KEY is not configured');
      throw fail(503, 'The AI assistant is not available right now. Please contact your administrator.');
    }

    if (!rateLimit.allow(`chat:${req.user._appUserId}`)) {
      throw fail(429, 'You are sending messages too quickly. Please wait a moment and try again.');
    }

    const messages = parseJsonArg(req.data.messages, []);
    const context = parseJsonArg(req.data.context, null);
    if (!Array.isArray(messages) || messages.length === 0) {
      return req.reject(400, 'A message is required.');
    }

    const system = buildSystemPrompt({ role, context });
    const tools = toolDeclarations(role);
    const contents = toContents(messages);
    const ctx = { srv, req, orgId, role };

    const proposals = [];
    const actions = [];
    const usage = { prompt: 0, output: 0 };
    let reply = '';

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      let result;
      try {
        result = await gemini.generate({ system, contents, tools, signal: req.http?.req?.signal });
      } catch (e) {
        LOG.error('gemini generate failed', { code: e.code || null, status: e.status || null });
        if (e.status === 429) {
          throw fail(429, 'The AI assistant is busy (rate limit reached). Please wait a minute and try again.');
        }
        throw fail(502, 'The AI assistant is temporarily unavailable. Please try again.');
      }
      if (result.usage.prompt) usage.prompt += result.usage.prompt;
      if (result.usage.output) usage.output += result.usage.output;

      if (!result.functionCalls.length) {
        reply = result.text;
        break;
      }

      // Record the model's tool-call turn verbatim (raw parts) so follow-up responses
      // line up AND thinking-model metadata (thoughtSignature) is preserved.
      contents.push({
        role: 'model',
        parts: result.parts && result.parts.length
          ? result.parts
          : result.functionCalls.map((c) => ({ functionCall: { name: c.name, args: c.args } })),
      });

      // Execute the requested tools (reads/validation are safe to run concurrently).
      const results = await Promise.all(
        result.functionCalls.map(async (call) => {
          const output = await executeTool(call.name, call.args, ctx);
          if (isProposeTool(call.name) && output && output.entity) proposals.push(output);
          if (isLifecycleTool(call.name) && output && output.dppId && !output.error) actions.push(output);
          return { name: call.name, output };
        })
      );

      contents.push({
        role: 'user',
        parts: results.map((r) => ({
          functionResponse: { name: r.name, response: { result: r.output } },
        })),
      });

      if (turn === MAX_TURNS - 1) {
        // Out of tool budget — ask for a final synthesis without further tools.
        try {
          const finalResult = await gemini.generate({ system, contents, signal: req.http?.req?.signal });
          reply = finalResult.text;
        } catch {
          reply = 'I gathered the information but could not complete the final step. Please try again.';
        }
      }
    }

    if (!reply) reply = 'I could not produce a response. Please rephrase your request.';

    return JSON.stringify({ reply, proposals, actions, model: gemini.chatModel(), usage });
  });
};
