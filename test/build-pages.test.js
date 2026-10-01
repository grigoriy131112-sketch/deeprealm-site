import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// `docs/` is not only build output: the owner adds files there by hand (the `/void`
// game and `docs/img`) that live nowhere else in the repo. The build used to wipe
// the whole tree, which deleted them on the next rebuild. This test runs the real
// build and checks that a file it does not own survives.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sentinel = path.join(root, 'docs', '__keep_me__.txt');

test('a rebuild leaves files the build does not own in place', () => {
  fs.writeFileSync(sentinel, 'hand-added');
  try {
    execFileSync('node', ['scripts/build-pages.js'], { cwd: root, stdio: 'pipe' });
    assert.ok(fs.existsSync(sentinel), 'a hand-added file in docs/ was deleted by the rebuild');
    // The files the build does own must still be rewritten.
    assert.ok(fs.existsSync(path.join(root, 'docs', 'index.html')), 'the build still writes its own files');
    assert.ok(fs.existsSync(path.join(root, 'docs', 'data', 'knowledge.json')), 'the knowledge payload is written');
  } finally {
    fs.rmSync(sentinel, { force: true });
  }
});
