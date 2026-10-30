import test from 'node:test';
import assert from 'node:assert/strict';
import { toCsv } from '../tools/backup/backup-export.mjs';

test('backup CSV: header from every key, quotes/commas/newlines escaped, objects as JSON, nulls empty', () => {
  const csv = toCsv([{ a: 1, b: 'x,y' }, { a: 2, c: 'say "hi"\nthere', d: { k: 1 }, b: null }]);
  const lines = csv.split('\n');
  assert.equal(lines[0], 'a,b,c,d');
  assert.equal(lines[1], '1,"x,y",,');
  assert.equal(csv.includes('"say ""hi""\nthere"'), true);
  assert.equal(csv.includes('"{""k"":1}"'), true);
  assert.equal(toCsv([]), '');
});
