// Owner notifications through a Telegram bot.
//
// The site tells the owner when someone visits it and forwards the sheets the
// Interviewer approves. Everything goes to a bot the owner owns, so nothing is
// sent anywhere else and no third-party service sees the players' data.
//
// The bot token is a secret, so it is never committed: it comes from the
// environment or from `data/telegram.json`, which ships empty. Until the owner
// fills it in, every call is a no-op that reports `skipped`, so the site works
// and the chats never wait on a missing notification.
//
// This file is bundled into the browser too, where notifications are sent
// directly to Telegram. That is what makes them work on GitHub Pages, which
// cannot run a server; the token is public there, which is why the owner should
// use a dedicated bot.

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
export function isConfigured(config) {
  return Boolean(config && config.token && config.chatId);
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
    for (const part of parts) {
      // Space the parts out, and never run two sends at once, so Telegram's rate
      // limit is not tripped by a long sheet.
      const wait = Math.max(0, lastSent + MIN_GAP_MS - Date.now());
      if (wait) await new Promise((r) => setTimeout(r, wait));
      const res = await fetchImpl(`${API_ROOT}/bot${config.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: config.chatId, text: part, disable_web_page_preview: true })
      });
      lastSent = Date.now();
      if (!res || !res.ok) {
        const detail = res && typeof res.text === 'function' ? await res.text().catch(() => '') : '';
        log(`telegram error: ${res ? res.status : 'no response'} ${detail}`.trim());
        return { ok: false, error: `telegram ${res ? res.status : 'unreachable'}` };
      }
    }
    return { ok: true, parts: parts.length };
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
