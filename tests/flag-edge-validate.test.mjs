import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const src = fs.readFileSync(path.resolve(import.meta.dirname, '../supabase/functions/sync-completion/index.ts'), 'utf8');
const block = src.split('// flag-validate-start')[1].split('// flag-validate-end')[0];
const { validateFlagCheck, validateFlagDone, flagId } = new Function(block + '\nreturn { validateFlagCheck, validateFlagDone, flagId };')();

test('flag_check: IDs are matched ignoring case and spaces, de-duplicated, 1-100', () => {
  assert.deepEqual(validateFlagCheck({ titles: ['a 123', 'A123', ' B9 '] }).ids, ['A123', 'B9']);
  assert.match(validateFlagCheck({ titles: [] }).error, /between 1 and 100/);
  assert.match(validateFlagCheck({ titles: Array.from({ length: 101 }, (_, i) => 'A' + i) }).error, /between 1 and 100/);
  assert.match(validateFlagCheck({ titles: ['x'.repeat(41)] }).error, /between 1 and 100/);
  assert.match(validateFlagCheck({}).error, /Bad request/);
});
test('flag_done: needs an ID and a quick plan; the plan is trimmed and capped', () => {
  assert.deepEqual(validateFlagDone({ title: ' t 100 ', plan: '  Eat well, recheck 3 days  ' }), { id: 'T100', plan: 'Eat well, recheck 3 days' });
  assert.equal(validateFlagDone({ title: 'A1', plan: 'x'.repeat(2000) }).plan.length, 1000);
  assert.match(validateFlagDone({ title: 'A1', plan: '   ' }).error, /plan/i);
  assert.match(validateFlagDone({ plan: 'x' }).error, /animal ID/i);
  assert.equal(flagId('1170 123'), '1170123');
});

// flag_check returns the sign groups of each flag as `conditions` (raw stored keys), keeping `condition` for old tool versions.
const m = src.match(/\/\/ conditions-of-start([\s\S]*?)\/\/ conditions-of-end/);
test('flag_check: conditions is the stored list, else the single old condition, else empty (raw keys, no folding)', () => {
  assert.ok(m, 'conditionsOfRow block is marked in the Edge Function');
  const { conditionsOfRow } = new Function(m[1] + '\nreturn { conditionsOfRow };')();
  assert.deepEqual(conditionsOfRow({ condition: 'vomiting', conditions: [] }), ['vomiting']);
  assert.deepEqual(conditionsOfRow({ condition: 'vomiting', conditions: null }), ['vomiting']);
  assert.deepEqual(conditionsOfRow({ condition: 'gi', conditions: ['gi', 'urinary'] }), ['gi', 'urinary']);
  assert.deepEqual(conditionsOfRow({ condition: null, conditions: ['gi', 'urinary'] }), ['gi', 'urinary']);
  assert.deepEqual(conditionsOfRow({ condition: null, conditions: [] }), []);
  assert.deepEqual(conditionsOfRow({}), []);
  assert.match(src, /select\('id,title,location,condition,conditions,/, 'the select asks for conditions');
  assert.match(src, /conditions: conditionsOfRow\(r\)/, 'each returned flag carries conditions');
});
