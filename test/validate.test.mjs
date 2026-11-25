import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDoc, readDoc } from '../scripts/validate.mjs';

test('the shipped sample is valid', () => {
  assert.deepEqual(validateDoc(readDoc('sample-items.js')), []);
});

test('a minimal document is valid', () => {
  assert.deepEqual(validateDoc({ items: [{ q: 1, title: 'Ship it' }] }), []);
});

test('lists every problem at once', () => {
  const problems = validateDoc({
    color: 'red',
    linkBase: 'javascript:alert(1)',
    items: [{ q: 5, title: '', by: 'tomorrow', url: 'ftp://x', id: 'a' }, { q: 1, title: 'x', id: 'a' }],
  });
  assert.deepEqual(problems, [
    'unknown field "color"',
    'linkBase must start with http:// or https://',
    'items[0].q must be 1, 2, 3 or 4',
    'items[0].title is required',
    'items[0].by must be YYYY-MM-DD, a whole number of days, or null',
    'items[0].url must start with http:// or https://',
    'items[1].id "a" is used twice',
  ]);
});

test('quadrant renames accept a name or { name, hint }', () => {
  assert.deepEqual(validateDoc({ quadrants: { 4: 'Park', 1: { name: 'Now', hint: 'Do first' } }, items: [] }), []);
  assert.equal(validateDoc({ quadrants: { 5: 'x' }, items: [] }).length, 1);
});
