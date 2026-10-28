// A player's characters.
//
// One Telegram account may keep up to two characters (the owner's rule), and
// the player names which one a roll is for by the number after the command -
// "/roll 1" or "/roll 2". A sheet that predates this feature was a single
// character, so `normalizeRecord` lifts it into slot 1 unchanged; nothing in the
// stored data is thrown away.
//
// The shape is deliberately plain data with no I/O, so the same helpers run on
// the Node store and the Cloudflare KV store.

export const MAX_CHARACTERS = 2;

// An old sheet was { name, stats }; a new one is { characters: [...] }.
// Returns a fresh normalized record, never mutating the input.
export function normalizeRecord(raw) {
  const rec = raw && typeof raw === 'object' ? raw : {};
  const list = Array.isArray(rec.characters) ? rec.characters : [];
  const characters = list
    .filter((c) => c && typeof c === 'object')
    .map((c, i) => ({
      slot: Number(c.slot) || i + 1,
      name: String(c.name || '').trim() || `Персонаж ${Number(c.slot) || i + 1}`,
      stats: c.stats && typeof c.stats === 'object' ? c.stats : {},
      user: String(c.user || '').trim(),
      createdAt: c.createdAt || null
    }))
    .sort((a, b) => a.slot - b.slot);

  // Migrate a pre-multi-character sheet into slot 1, keeping its ratings.
  if (!characters.length && rec.name) {
    characters.push({
      slot: 1,
      name: String(rec.name).trim() || 'Персонаж 1',
      stats: rec.stats && typeof rec.stats === 'object' ? rec.stats : {},
      user: String(rec.tgUser || '').trim(),
      createdAt: rec.updatedAt || null
    });
  }

  return {
    id: rec.id != null ? String(rec.id) : undefined,
    updatedAt: rec.updatedAt || null,
    tgUser: rec.tgUser || null,
    characters
  };
}

export function charactersOf(raw) {
  return normalizeRecord(raw).characters;
}

// The character in a given slot (1-based), or null.
export function characterAt(raw, slot) {
  const n = Number(slot);
  if (!Number.isInteger(n) || n < 1) return null;
  return charactersOf(raw).find((c) => c.slot === n) || null;
}

export function canAdd(raw) {
  return charactersOf(raw).length < MAX_CHARACTERS;
}

// The lowest free slot (1 or 2), or null when both are taken.
export function nextSlot(raw) {
  const taken = new Set(charactersOf(raw).map((c) => c.slot));
  for (let s = 1; s <= MAX_CHARACTERS; s++) if (!taken.has(s)) return s;
  return null;
}

// Add a character into the first free slot. Returns the new record, or the same
// record when both slots are taken (the caller decides what to say).
export function addCharacter(raw, { name, stats = {}, user = '' } = {}) {
  const base = normalizeRecord(raw);
  const slot = nextSlot(base);
  if (slot == null) return base;
  const characters = base.characters
    .concat([{
      slot,
      name: String(name || '').trim() || `Персонаж ${slot}`,
      stats: stats && typeof stats === 'object' ? stats : {},
      user: String(user || '').trim(),
      createdAt: new Date().toISOString()
    }])
    .sort((a, b) => a.slot - b.slot);
  return { ...base, characters };
}

// Drop one slot, or both when `slot` is 'all'/'*'. Later characters keep their
// own slot number so a "/roll 2" the player learned does not silently move.
export function removeCharacter(raw, slot) {
  const base = normalizeRecord(raw);
  const all = slot === 'all' || slot === '*' || slot === true;
  const n = Number(slot);
  const characters = base.characters.filter((c) => (all ? false : c.slot !== n));
  return { ...base, characters };
}

// A compact one-line label for a character, used in lists and confirmations.
export function characterLabel(character) {
  if (!character) return '';
  const user = character.user ? ` (@${character.user})` : '';
  return `${character.slot}. ${character.name}${user}`;
}
