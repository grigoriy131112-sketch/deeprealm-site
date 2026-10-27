// Where the bot keeps each player's sheet.
//
// One JSON file, keyed by the player's Telegram id, so a person can only ever
// change their own numbers. The file is small and written whole; the bot is a
// single process, so there is no concurrent writer to guard against.

import fs from 'node:fs';
import path from 'node:path';

export function createStore(file) {
  const resolved = path.resolve(file);

  function readAll() {
    try {
      const raw = fs.readFileSync(resolved, 'utf8');
      const data = JSON.parse(raw);
      return data && typeof data === 'object' ? data : {};
    } catch {
      return {};
    }
  }

  function writeAll(data) {
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    const tmp = resolved + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, resolved);
  }

  return {
    file: resolved,
    get(id) {
      return readAll()[String(id)] || null;
    },
    set(id, record) {
      const data = readAll();
      data[String(id)] = { ...record, id: String(id), updatedAt: new Date().toISOString() };
      writeAll(data);
      return data[String(id)];
    },
    remove(id) {
      const data = readAll();
      delete data[String(id)];
      writeAll(data);
    },
    all() {
      return readAll();
    }
  };
}
