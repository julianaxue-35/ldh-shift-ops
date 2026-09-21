import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const L = createRequire(import.meta.url)('../lib/ldh-logic.js');
const sql = fs.readFileSync(path.resolve(import.meta.dirname, '../supabase/migrations/0009_surveillance.sql'), 'utf8');

test('the migration seeds exactly the spaces the flag form offers (same names; order differs on purpose)', () => {
  const names = [...sql.matchAll(/^\s*\('([^']+)',\s*'[^']+',\s*\d+,\s*\d+\)/gm)].map(m => m[1]);
  assert.equal(new Set(names).size, names.length, 'no duplicate names in the migration');
  assert.equal(new Set(L.LOCATIONS).size, L.LOCATIONS.length, 'no duplicate names in LOCATIONS');
  // Order is presentation only: the dropdown keeps its familiar order, the heat map orders by the migration's sort column.
  assert.deepEqual([...names].sort(), [...L.LOCATIONS].sort());
});

test('the migration allows exactly the reported signs the JS knows about', () => {
  const check = sql.match(/condition in\s*\(([^)]*)\)/)[1];
  const keys = [...check.matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
  assert.deepEqual(keys, L.SIGN_KEYS);
  const arr = sql.match(/array\[([^\]]*)\]/)[1];
  assert.deepEqual([...arr.matchAll(/'([a-z_]+)'/g)].map(m => m[1]), L.SIGN_KEYS, 'the snapshot function loops the same signs');
});
