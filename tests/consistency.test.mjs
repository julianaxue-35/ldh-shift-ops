import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const L = createRequire(import.meta.url)('../lib/ldh-logic.js');
// 0009 seeds the original spaces; 0013 adds the Rabbit Room (2026-10-09)
const sql = ['0009_surveillance.sql', '0013_shelter_board.sql'].map(f => fs.readFileSync(path.resolve(import.meta.dirname, '../supabase/migrations/' + f), 'utf8')).join('\n');

test('the migration seeds exactly the spaces the flag form offers (same names; order differs on purpose)', () => {
  const names = [...sql.matchAll(/^\s*\('([^']+)',\s*'[^']+',\s*\d+,\s*\d+\)/gm)].map(m => m[1]);
  assert.equal(new Set(names).size, names.length, 'no duplicate names in the migration');
  assert.equal(new Set(L.LOCATIONS).size, L.LOCATIONS.length, 'no duplicate names in LOCATIONS');
  // Order is presentation only: the dropdown keeps its familiar order, the heat map orders by the migration's sort column.
  // Offsite is a flag-form option only: it has no cages, so it is not a heat-map space.
  // Dog transport / Cat transport are two flag-form choices that share the one 'Transport' space (L.SUB_SPACES).
  const spaces = [...new Set(L.LOCATIONS.filter(n => !L.OFFSITE_NAMES.includes(n)).map(n => L.SUB_SPACES[n] || n))];
  assert.deepEqual([...names].sort(), spaces.sort());
});

test('the migration allows exactly the reported signs the JS knows about', () => {
  const signs = fs.readFileSync(path.resolve(import.meta.dirname, '../supabase/migrations/0047_sign_groups.sql'), 'utf8');
  const allowed = [...L.SIGN_KEYS, ...Object.keys(L.LEGACY_GROUP).filter(k => !L.SIGN_KEYS.includes(k))];
  const keysOf = s => [...s.matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
  assert.deepEqual(keysOf(signs.match(/condition in\s*\(([^)]*)\)/)[1]).sort(), [...allowed].sort(), 'single-condition check');
  assert.deepEqual(keysOf(signs.match(/conditions <@ array\s*\[([^\]]*)\]/)[1]).sort(), [...allowed].sort(), 'conditions list check');
  const loops = [...signs.matchAll(/unnest\(array\[([^\]]*)\]\)/g)];
  assert.equal(loops.length, 1);
  assert.deepEqual(keysOf(loops[0][1]), L.SIGN_KEYS, 'the snapshot function loops the same groups');
  const ord = signs.match(/ord text\[\] := array\[([^\]]*)\]/)[1];
  assert.deepEqual(keysOf(ord), L.SIGN_KEYS, 'the primary-condition order matches the display order');
});
