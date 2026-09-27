// A bot token once reached this public repository, so the guard is now broad: any
// published file that would ship a Telegram token shape fails the build. The
// test fixtures are excluded because they intentionally hold a fake token, and
// that fake is itself checked below so the exclusion cannot hide a real one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const TOKEN_SHAPE = /\d{6,}:[A-Za-z0-9_-]{30,}/;
const FAKE = '123456789:AAExampleTokenForTestsOnly1234567';

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

test('no published file ships a Telegram token', () => {
  const published = ['public', 'docs', 'data', 'deploy'].map((d) => path.join(root, d));
  const offenders = [];
  for (const dir of published) {
    if (!fs.existsSync(dir)) continue;
    for (const file of walk(dir)) {
      const text = fs.readFileSync(file, 'utf8');
      for (const found of text.match(new RegExp(TOKEN_SHAPE, 'g')) || []) {
        if (found === FAKE) continue;
        offenders.push(`${path.relative(root, file)}: ${found.slice(0, 12)}…`);
      }
    }
  }
  assert.deepEqual(offenders, [], 'a real-looking bot token would be published');
});

test('the test fixture only contains the fake token', () => {
  const fixture = fs.readFileSync(path.join(root, 'test/cloudflare-relay.test.js'), 'utf8');
  for (const found of fixture.match(new RegExp(TOKEN_SHAPE, 'g')) || []) {
    assert.equal(found, FAKE, 'the fixture holds something other than the fake token');
  }
});
