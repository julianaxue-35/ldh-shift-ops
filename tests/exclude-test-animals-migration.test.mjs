import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const sql = fs.readFileSync(new URL('../supabase/migrations/0040_exclude_test_animals.sql', import.meta.url), 'utf8');

test('0040 skips TEST animals in the nurse and Behaviour counts', () => {
  assert.match(sql, /function public\.is_test_animal/);
  assert.match(sql, /noga_log_done[\s\S]*is_test_animal\(new\.animal_id\)/);
  assert.match(sql, /behaviour_log_done[\s\S]*is_test_animal\(new\.animal_id\)/);
  assert.match(sql, /nurse_daily_counts[\s\S]*is_test_animal\(title\)[\s\S]*is_test_animal\(t\.animal_id\)[\s\S]*is_test_animal\(animal_id\)/);
});
