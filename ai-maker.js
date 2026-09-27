// Live-speech upgrade for the built-in AI.
//
// The engine in `ai-engine.js` always answers and needs nothing, but its phrasing
// is assembled from the site's own texts. This module asks a free, keyless
// language model to rewrite that answer in a natural voice, so the chats talk
// like a person instead of reading the knowledge base aloud.
//
// Three rules keep it safe to rely on:
//   1. It is optional. Every failure falls back to the engine, so a dead or
//      rate-limited endpoint never breaks a chat.
//   2. It never gets the last word on facts. A reply that drops the chat link,
//      the ending word or the approval mark is rejected, and the engine's answer
//      is used instead.
//   3. It is cheap to skip. Failures open a cooldown, and only one request runs
//      at a time, so a broken endpoint costs one timeout and then nothing.

const DEFAULT_BASE_URL = 'https://text.pollinations.ai/openai';
const DEFAULT_MODEL = 'openai-fast';

// Read the text out of either an OpenAI-shaped reply or a plain-text body, so a
// different free provider can be dropped in without touching the callers.
function readReply(data) {
  if (typeof data === 'string') return data;
  if (!data || typeof data !== 'object') return '';
  const choice = Array.isArray(data.choices) ? data.choices[0] : null;
  if (choice) {
    if (choice.message && typeof choice.message.content === 'string') return choice.message.content;
    if (typeof choice.text === 'string') return choice.text;
  }
  if (typeof data.content === 'string') return data.content;
  if (typeof data.text === 'string') return data.text;
  return '';
}

// The owner's strict format lives in the rules, so a rewritten answer must keep
// it. `local` is the answer the engine already produced; anything the model
// drops that the local answer had is a reason to distrust the rewrite.
export function keepsEssentials(candidate, local) {
  const got = String(candidate || '');
  if (got.trim().length < 2) return false;
  const base = String(local || '');
  // The chats must keep ending on the owner's word.
  if (/(^|\s)конец\s*[.!?]*$/i.test(base) && !/(^|\s)конец\s*[.!?]*$/i.test(got.trim())) return false;
  // A link the player was given must survive: losing it would strand a newcomer.
  const links = base.match(/https?:\/\/[^\s)]+/g) || [];
  for (const link of links) if (!got.includes(link)) return false;
  // An approval has to stay an approval, or the player is left without a verdict.
  if (/ОДОБРЕНО|РЕКОМЕНДОВАН/i.test(base) && !/ОДОБРЕНО|РЕКОМЕНДОВАН/i.test(got)) return false;
  // The owner forbids markdown in the chats; a rewrite that adds it is rejected.
  if (/[*#`]/.test(got.replace(/https?:\/\/\S+/g, ''))) return false;
  return true;
}

export function createLiveSpeaker(options = {}) {
  const baseUrl = options.baseUrl || DEFAULT_BASE_URL;
  const model = options.model || DEFAULT_MODEL;
  const fetchImpl = options.fetchImpl || (typeof fetch === 'function' ? fetch : null);
  const now = options.now || (() => Date.now());
  const timeoutMs = options.timeoutMs || 9000;
  // A failed endpoint is given a rest so later messages answer instantly from the
  // engine instead of waiting for another timeout.
  const cooldownMs = options.cooldownMs || 10 * 60 * 1000;
  const log = typeof options.log === 'function' ? options.log : () => {};

  let downUntil = 0;
  let inflight = null;

  if (!fetchImpl) return null;

  async function request(messages, temperature, timeoutOverride) {
    // The public endpoint rejects a "system" role, so the rules are folded into
    // the first user turn, which it accepts.
    const rules = [];
    const rest = [];
    for (const m of messages || []) {
      if (m && m.role === 'system') rules.push(String(m.content || ''));
      else rest.push({ role: m && m.role === 'assistant' ? 'assistant' : 'user', content: String((m && m.content) || '') });
    }
    const payload = rules.length ? [{ role: 'user', content: rules.join('\n\n') }, ...rest] : rest;

    // The endpoint answers in ten to twenty-five seconds, so a caller that shows
    // the engine's answer first can afford to wait longer than the default.
    const limit = Number(timeoutOverride) > 0 ? Number(timeoutOverride) : timeoutMs;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), limit) : null;
    try {
      const res = await fetchImpl(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: payload, temperature: temperature == null ? 0.75 : temperature }),
        signal: controller ? controller.signal : undefined
      });
      if (!res || !res.ok) throw new Error(`live speaker error ${res ? res.status : 'unreachable'}`);
      const raw = await res.json().catch(() => '');
      const reply = readReply(raw);
      if (!String(reply).trim()) throw new Error('live speaker returned an empty reply');
      return String(reply);
    } catch (err) {
      downUntil = now() + cooldownMs;
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return async function speak(messages, options2 = {}) {
    if (now() < downUntil) throw new Error('live speaker is resting');
    // One request at a time, and a request already running is shared, so a burst
    // of messages cannot multiply the load on a free endpoint.
    if (inflight) return inflight;
    inflight = request(messages, options2.temperature, options2.timeoutMs)
      .finally(() => { inflight = null; });
    return inflight;
  };
}

export { DEFAULT_BASE_URL, DEFAULT_MODEL };
