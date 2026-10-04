// Owner notifications through a Telegram bot.
//
// The site tells the owner when someone visits it and forwards the sheets the
// Interviewer approves. Everything goes to a bot the owner owns, so nothing is
// sent anywhere else and no third-party service sees the players' data.
//
// The bot token is a secret, so it is never committed: on the server it comes from
// `.env` / the environment. Until the owner sets it, every call is a no-op that
// reports `skipped`, so the site works and the chats never wait on a missing
// notification.
//
// This file is bundled into the browser too, but the browser never sees the token:
// on GitHub Pages there is no server, so the page posts to the owner's server at
// /api/notify and the server relays to Telegram. That keeps the bot private while
// the static site still reaches the owner.

const API_ROOT = 'https://api.telegram.org';

// Telegram's limits: 4096 characters per message and about 20 messages per
// minute to one chat. Long sheets are split, and the limiter below spaces the
// parts out so a burst cannot turn into 429s.
const MAX_LEN = 3800;
const MIN_GAP_MS = 1200;

export function telegramConfig(env = {}, file = null) {
  const fromFile = file && typeof file === 'object' ? file : {};
  const pick = (a, b) => (a === undefined || a === null || a === '' ? b : a);
  return {
    token: String(pick(env.TELEGRAM_BOT_TOKEN, fromFile.token) || '').trim(),
    chatId: String(pick(env.TELEGRAM_CHAT_ID, fromFile.chatId) || '').trim(),
    // Extra recipients: the owner can add teammates by separating ids with a comma.
    // `chatId` stays the first one so existing configs keep working unchanged.
    chatIds: parseChatIds(pick(env.TELEGRAM_CHAT_IDS, fromFile.chatIds)),
    // A visit ping every few hours per session is enough to show the site is
    // alive; without this an open tab would notify on every reload.
    visitGapMs: Number(pick(env.TELEGRAM_VISIT_GAP_MINUTES, fromFile.visitGapMinutes) || 0) * 60000 || 6 * 60 * 60000
  };
}

export function splitMessage(text, limit = MAX_LEN) {
  const body = String(text == null ? '' : text).trim();
  if (!body) return [];
  if (body.length <= limit) return [body];
  const out = [];
  let rest = body;
  while (rest.length > limit) {
    // Prefer a line break so a message is not cut mid-sentence.
    let cut = rest.lastIndexOf('\n', limit);
    if (cut < limit * 0.5) cut = limit;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

// `enabled` is false when no token or chat is configured; the caller then reports
// the notification as skipped instead of failing.
// A list of recipients, from a comma-separated string or an array. Duplicates are
// dropped so a repeated id does not receive the same sheet twice.
export function parseChatIds(value) {
  const raw = Array.isArray(value) ? value : String(value == null ? '' : value).split(',');
  const out = [];
  for (const item of raw) {
    const id = String(item == null ? '' : item).trim();
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

export function isConfigured(config) {
  if (!config || !config.token) return false;
  return recipients(config).length > 0;
}

// Everyone who should get the message: the extra ids plus the primary one.
export function recipients(config) {
  if (!config) return [];
  return parseChatIds([...(config.chatIds || []), config.chatId]);
}

export function createNotifier(options = {}) {
  const config = options.config || telegramConfig(options.env || {}, options.file || null);
  const fetchImpl = options.fetchImpl || (typeof fetch === 'function' ? fetch : null);
  const log = typeof options.log === 'function' ? options.log : () => {};
  const seen = new Map();
  let lastSent = 0;
  let queue = Promise.resolve();

  async function post(text) {
    if (!isConfigured(config)) return { ok: false, skipped: true, reason: 'not_configured' };
    if (!fetchImpl) return { ok: false, skipped: true, reason: 'no_fetch' };
    const parts = splitMessage(text);
    const to = recipients(config);
    for (const chatId of to) {
      for (const part of parts) {
        // Space the parts out, and never run two sends at once, so Telegram's rate
        // limit is not tripped by a long sheet.
        const wait = Math.max(0, lastSent + MIN_GAP_MS - Date.now());
        if (wait) await new Promise((r) => setTimeout(r, wait));
        // Telegram can accept the request and never answer; without a cap that would
        // pin the queue (and the approving chat) forever.
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), 10000) : null;
        let res;
        try {
          res = await fetchImpl(`${API_ROOT}/bot${config.token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: part, disable_web_page_preview: true }),
            signal: controller ? controller.signal : undefined
          });
        } catch (err) {
          log(`telegram error: ${err.message}`);
          return { ok: false, error: 'telegram unreachable' };
        } finally {
          if (timer) clearTimeout(timer);
        }
        lastSent = Date.now();
        if (!res || !res.ok) {
          const detail = res && typeof res.text === 'function' ? await res.text().catch(() => '') : '';
          log(`telegram error: ${res ? res.status : 'no response'} ${detail}`.trim());
          return { ok: false, error: `telegram ${res ? res.status : 'unreachable'}` };
        }
      }
    }
    return { ok: true, parts: parts.length, recipients: to.length };
  }

  // Sends are serialised so two chats approving at once cannot interleave their
  // parts or race the limiter.
  function send(text) {
    queue = queue.then(() => post(text).catch((err) => ({ ok: false, error: err.message })));
    return queue;
  }

  return {
    config,
    enabled: isConfigured(config),
    send,
    visit(info = {}) {
      const key = String(info.session || info.id || 'anon');
      const now = Date.now();
      const previous = seen.get(key) || 0;
      if (now - previous < config.visitGapMs) return Promise.resolve({ ok: false, skipped: true, reason: 'throttled' });
      seen.set(key, now);
      // Keep the map from growing without bound on a long-running server.
      if (seen.size > 500) {
        for (const [k, t] of seen) if (now - t > config.visitGapMs) seen.delete(k);
      }
      const lines = [
        '🚪 Новый заход на сайт Deeprealm',
        info.page ? `Страница: ${info.page}` : '',
        info.from ? `Пришёл откуда: ${info.from}` : '',
        info.device ? `Устройство: ${info.device}` : '',
        `Время: ${new Date(now).toISOString().replace('T', ' ').slice(0, 16)} UTC`
      ].filter(Boolean);
      return send(lines.join('\n'));
    },
    sheet(info = {}) {
      const kind = { character: 'персонажа', race: 'расы', class: 'класса', story: 'сюжета' }[info.kind] || 'анкета';
      const head = `📋 Новая анкета ${kind} — Deeprealm`;
      const meta = [
        info.title ? `Название: ${info.title}` : '',
        info.contact ? `Контакт: ${info.contact}` : '',
        info.branch ? `Направление: ${info.branch}` : '',
        info.source ? `Источник: ${info.source}` : ''
      ].filter(Boolean).join('\n');
      return send([head, meta, '', String(info.text || '').trim()].filter((p) => p !== undefined).join('\n').trim());
    },
    staff(info = {}) {
      const answers = Array.isArray(info.answers) ? info.answers : [];
      const body = answers.length
        ? answers.map((a, i) => `${i + 1}) ${a.q}\n${a.a}`).join('\n\n')
        : String(info.text || '').trim();
      return send([
        '🧑‍💼 Собеседование в администрацию — Deeprealm',
        info.role ? `Направление: ${info.role}` : '',
        info.contact ? `Контакт: ${info.contact}` : '',
        info.verdict ? `Итог: ${info.verdict}` : '',
        '',
        body
      ].filter(Boolean).join('\n'));
    }
  };
}
