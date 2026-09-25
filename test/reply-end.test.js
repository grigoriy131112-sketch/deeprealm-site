import test from 'node:test';
import assert from 'node:assert/strict';
import { withEnd, finaleText } from '../server.js';

test('a reply that lacks the closing word gets it', () => {
  assert.equal(withEnd('Привет!'), 'Привет!\n\nконец');
});

test('a reply that already ends with the word is left alone', () => {
  const once = withEnd('Привет!\n\nконец');
  assert.equal(once, 'Привет!\n\nконец');
  assert.equal(withEnd(once), once, 'the word must never be doubled');
});

test('the closing word is recognised with trailing punctuation', () => {
  assert.equal(withEnd('Всё готово. Конец.'), 'Всё готово. Конец.');
  assert.equal(withEnd('Всё готово. конец!'), 'Всё готово. конец!');
});

test('the word inside a sentence is not mistaken for the ending', () => {
  // "конец" here is part of the text, not the closing word, so it is added.
  assert.equal(withEnd('Это конец истории, но мы продолжим.'), 'Это конец истории, но мы продолжим.\n\nконец');
});

test('an empty reply stays empty', () => {
  assert.equal(withEnd(''), '');
  assert.equal(withEnd(null), '');
  assert.equal(withEnd(undefined), '');
});

test('the hand-off endings also close with the word', () => {
  for (const text of [finaleText('guide', 'ru'), finaleText('interview', 'ru'), finaleText('staff', 'ru')]) {
    assert.ok(withEnd(text).trim().endsWith('конец'), `"${text.slice(-40)}" must end with the word`);
  }
});
