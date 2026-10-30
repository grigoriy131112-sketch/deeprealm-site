// A KV-backed store with the same async shape as bot/store.js, so the bot core
// runs unchanged on Cloudflare's edge. One key per player keeps writes small and
// avoids read-modify-write races between two players registering at once.

export function kvStore(kv) {
  const key = (id) => 'player:' + String(id);

  return {
    async get(id) {
      const raw = await kv.get(key(id));
      return raw ? JSON.parse(raw) : null;
    },
    async set(id, record) {
      const value = { ...record, id: String(id), updatedAt: new Date().toISOString() };
      await kv.put(key(id), JSON.stringify(value));
      return value;
    },
    async remove(id) {
      await kv.delete(key(id));
    },
    // The menu message ids per chat, so a long section's tail can be cleared.
    async getMenuMsg(chatId) {
      const raw = await kv.get('menu:' + String(chatId));
      return raw ? JSON.parse(raw) : null;
    },
    async setMenuMsg(chatId, record) {
      await kv.put('menu:' + String(chatId), JSON.stringify(record));
      return record;
    },
    async clearMenuMsg(chatId) {
      await kv.delete('menu:' + String(chatId));
    },
    async all() {
      const out = {};
      let cursor;
      for (;;) {
        const page = await kv.list({ prefix: 'player:', cursor });
        for (const { name } of page.keys) {
          const raw = await kv.get(name);
          if (raw) out[name.slice('player:'.length)] = JSON.parse(raw);
        }
        if (page.list_complete) break;
        cursor = page.cursor;
      }
      return out;
    }
  };
}
