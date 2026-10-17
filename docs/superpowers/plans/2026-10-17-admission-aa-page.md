# Admission AA Page (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new `admission-aa.html` page where the Admission AA signs in with their own passcode, sees items the nurses send (FIV result, microchip, UV result, bulk vaccination update), watches a 24-hour countdown, and ticks each one off once entered in ShelterMate, which deletes the row for good.

**Architecture:** One new table `aa_items` (one row per item, details in a `payload` jsonb), same RLS pattern as the other dashboard tables, realtime-enabled. Pure rules (building a row from the nurse's form, summary text, countdown, sort order) live in `lib/ldh-logic.js` so they are unit-tested in Node. The AA page and the nurses-page "Send to Admission AA" card are plain inline-JS pages like the others. The passcode gate is the existing `OpsCore.init({ gateRole })` with a new role `aa`.

**Tech Stack:** Static HTML + inline JS, Supabase (Postgres RLS, realtime, `check_passcode` RPC), PGlite migration tests (`tests/*.test.mjs`), Playwright UI tests with the in-memory Supabase stub (`tests/ui/harness.js`).

**Spec:** `docs/superpowers/specs/2026-10-17-admission-aa-page-design.md` (this plan is **Phase 1** only; Phase 2, vets sharing medication charts/notes from `ldh-shift-tools` with Word download, gets its own plan afterwards).

## Global Constraints

- Public repo: **no real passcodes or secrets in any file or commit message.** The migration seeds the `aa` passcode as an unguessable random value; Juliana sets the real one in the Supabase SQL editor (Task 6).
- Ticked = deleted: `aa_items` rows are hard-deleted the moment the AA ticks them. No archive, no soft-delete column.
- 24-hour countdown from `sent_at`. Past 24 h and unticked: stays visible, red "Overdue by Xh", sorted to the top, with an "N overdue" count at the top of the page. Nothing is auto-deleted. (Spec's open question; recommended option adopted. Changing it later is a one-line scheduled delete.)
- FIV, microchip and UV items carry exactly **one** animal ID. Only vaccination updates may carry several.
- Microchip number: digits only after removing spaces, 9 to 15 digits. Implanter initials: required, uppercased, max 4 characters (same rule as `cleanInitials` in `nurses.html`).
- Every dashboard page keeps the IP-notice header comment and `<!-- ip-notice-footer -->` footer (copy from `shelter-board.html`).
- Match surrounding style: 2-space indent, `esc = OpsCore.esc` for every interpolated value, comments only for non-obvious "why".
- Patient data stays out of the browser's storage: nothing from `aa_items` goes to `localStorage`.
- Tests run offline against the stub; never point tests at the live Supabase project. Test commands (from repo root):
  - Node suites: `node --test tests/*.test.mjs`
  - UI suites: `NODE_PATH=$(find ~/.npm/_npx -maxdepth 4 -iname playwright -type d | head -1 | xargs dirname) node tests/ui/run-all.js`
  - Three UI/logic tests are **already failing before this work** (stale: logic `vaccStatus`, UI `disease-watch`, UI `nurse-requests`). Ignore those three; everything else must be green.

## Review Focus

- Vaccination update typed with messy separators ("A1, a2  A3\nA4", trailing commas, duplicates in different case) → one clean, de-duplicated, upper-cased list; blank list is refused (Task 1).
- Microchip number pasted with spaces or dashes ("985 112 000 123 456") → accepted and stored as digits only; letters or too few digits refused (Task 1).
- Item sent exactly 24 h ago, 23 h 59 m ago, and a future `sent_at` (clock skew) → label never shows a negative or "NaN"; exactly 24 h is overdue by 0 and counts as overdue (Task 1).
- Two nurses send the same animal's microchip twice → two cards, no crash (no unique constraint); the AA ticks each separately (Task 2, Task 4).
- The AA ticks the same card on two devices at once → the second delete affects 0 rows and the page just refreshes, no error alert (Task 4).
- A long note/summary or text containing `<script>` or quotes → rendered escaped, not executed (Task 4).

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0017_admission_aa.sql` (create) | `aa_items` table + RLS + realtime; `aa` role allowed in `role_passcodes` with an unguessable seed hash |
| `tests/admission-aa-migration.test.mjs` (create) | PGlite test of the migration |
| `lib/ldh-logic.js` (modify) | `AA_KINDS`, `parseAnimalIds`, `aaBuildItem`, `aaSummary`, `aaCountdown`, `aaSortItems` |
| `tests/logic.test.mjs` (modify) | Node tests for the above |
| `lib/ops-core.js` (modify) | Add `Admission AA` to `NAV_LINKS` |
| `admission-aa.html` (create) | The AA page |
| `nurses.html` (modify) | "Send to Admission AA" card + "Send to AA" prefill buttons |
| `tests/ui/harness.js` (modify) | `aa_items` table, `aa` passcode in the stub |
| `tests/ui/admission-aa.test.js` (create) | AA page UI test |
| `tests/ui/nurses-send-aa.test.js` (create) | Nurse send-form UI test |
| `supabase/rotate-codes.sql` (modify) | Placeholder step for the AA passcode |
| `tests/README.md` (modify) | List the new suites |

---

### Task 1: Pure rules in `LDHLogic`

**Files:**
- Modify: `lib/ldh-logic.js` (add functions before the final `return {…}` at ~line 457; add names to that return object)
- Test: `tests/logic.test.mjs` (append)

**Interfaces:**
- Produces (all on `LDHLogic`):
  - `AA_KINDS`: object `{ fiv:'FIV result', microchip:'Microchip', uv:'UV result', microchip_uv:'Microchip + UV', vaccination:'Vaccination update' }`
  - `AA_HOURS`: `24`
  - `parseAnimalIds(text) -> string[]` (split on commas/whitespace/semicolons, trim, upper-case, drop empties, de-duplicate keeping first-seen order)
  - `aaBuildItem({ kind, idsText, result, chipNumber, uvResult, vaccine, vaccDate, initials }) -> { row } | { error }` where `row = { kind, animal_ids: string[], payload: object, sent_by: string }`
  - `aaSummary(item) -> string` (one-line text for the card body; plain text, caller escapes)
  - `aaCountdown(item, nowMs) -> { msLeft, overdue, overdueMs, level, label }` with `level` in `'ok' | 'amber' | 'red'`
  - `aaSortItems(items, nowMs) -> item[]` (overdue first, then oldest `sent_at` first)

- [ ] **Step 1: Write the failing tests** (append to `tests/logic.test.mjs`)

```js
/* ---------- Admission AA (2026-10-17) ---------- */
test('parseAnimalIds: messy separators -> clean, upper-cased, de-duplicated, order kept', () => {
  assert.deepEqual(L.parseAnimalIds('a1, A2  a3\nA4;; a1,'), ['A1', 'A2', 'A3', 'A4']);
  assert.deepEqual(L.parseAnimalIds('   '), []);
  assert.deepEqual(L.parseAnimalIds(undefined), []);
});

test('aaBuildItem: vaccination takes many IDs, needs a vaccine and initials', () => {
  const r = L.aaBuildItem({ kind: 'vaccination', idsText: 'a1, a2', vaccine: 'F3', vaccDate: '2026-10-17', initials: 'ab' });
  assert.deepEqual(r.row, { kind: 'vaccination', animal_ids: ['A1', 'A2'], payload: { vaccine: 'F3', date: '2026-10-17' }, sent_by: 'AB' });
  assert.match(L.aaBuildItem({ kind: 'vaccination', idsText: '', vaccine: 'F3', initials: 'AB' }).error, /animal ID/i);
  assert.match(L.aaBuildItem({ kind: 'vaccination', idsText: 'A1', vaccine: ' ', initials: 'AB' }).error, /vaccine/i);
  assert.match(L.aaBuildItem({ kind: 'vaccination', idsText: 'A1', vaccine: 'F3', initials: '' }).error, /initials/i);
});

test('aaBuildItem: FIV / UV / microchip take exactly one animal ID', () => {
  assert.match(L.aaBuildItem({ kind: 'fiv', idsText: 'A1 A2', result: 'Negative', initials: 'AB' }).error, /one animal/i);
  assert.match(L.aaBuildItem({ kind: 'uv', idsText: 'A1, A2', result: 'Clear', initials: 'AB' }).error, /one animal/i);
  assert.match(L.aaBuildItem({ kind: 'microchip', idsText: 'A1 A2', chipNumber: '985112000123456', initials: 'AB' }).error, /one animal/i);
  assert.deepEqual(L.aaBuildItem({ kind: 'fiv', idsText: 'a1', result: ' FIV negative ', initials: 'ab' }).row.payload, { result: 'FIV negative' });
  assert.match(L.aaBuildItem({ kind: 'fiv', idsText: 'A1', result: '', initials: 'AB' }).error, /result/i);
});

test('aaBuildItem: microchip number is stored as digits only; 9-15 digits required', () => {
  const ok = L.aaBuildItem({ kind: 'microchip', idsText: 'A1', chipNumber: '985 112-000 123 456', initials: 'ab' });
  assert.equal(ok.row.payload.chip_number, '985112000123456');
  assert.equal(ok.row.payload.implanter, 'AB');           // implanter = the nurse's initials
  assert.match(L.aaBuildItem({ kind: 'microchip', idsText: 'A1', chipNumber: '98511A000123456', initials: 'AB' }).error, /digits/i);
  assert.match(L.aaBuildItem({ kind: 'microchip', idsText: 'A1', chipNumber: '12345678', initials: 'AB' }).error, /digits/i);
  assert.match(L.aaBuildItem({ kind: 'microchip', idsText: 'A1', chipNumber: '1234567890123456', initials: 'AB' }).error, /digits/i);
});

test('aaBuildItem: Microchip + UV carries chip number, implanter and UV result together', () => {
  const r = L.aaBuildItem({ kind: 'microchip_uv', idsText: 'A1', chipNumber: '985112000123456', uvResult: 'No fluorescence', initials: 'ab' });
  assert.deepEqual(r.row.payload, { chip_number: '985112000123456', implanter: 'AB', uv_result: 'No fluorescence' });
  assert.match(L.aaBuildItem({ kind: 'microchip_uv', idsText: 'A1', chipNumber: '985112000123456', uvResult: '', initials: 'AB' }).error, /UV/i);
});

test('aaBuildItem: unknown kind is refused', () => {
  assert.match(L.aaBuildItem({ kind: 'bogus', idsText: 'A1', initials: 'AB' }).error, /type/i);
});

test('aaSummary: one readable line per kind', () => {
  assert.equal(L.aaSummary({ kind: 'fiv', animal_ids: ['A1'], payload: { result: 'FIV negative' } }), 'FIV negative');
  assert.equal(L.aaSummary({ kind: 'uv', animal_ids: ['A1'], payload: { result: 'Clear' } }), 'UV: Clear');
  assert.equal(L.aaSummary({ kind: 'microchip', animal_ids: ['A1'], payload: { chip_number: '985112000123456', implanter: 'AB' } }), 'Chip 985112000123456 · implanted by AB');
  assert.equal(L.aaSummary({ kind: 'microchip_uv', animal_ids: ['A1'], payload: { chip_number: '985112000123456', implanter: 'AB', uv_result: 'Clear' } }), 'Chip 985112000123456 · implanted by AB · UV: Clear');
  assert.equal(L.aaSummary({ kind: 'vaccination', animal_ids: ['A1', 'A2', 'A3'], payload: { vaccine: 'F3', date: '2026-10-17' } }), 'F3 given 2026-10-17 · 3 animals');
  assert.equal(L.aaSummary({ kind: 'vaccination', animal_ids: ['A1'], payload: { vaccine: 'F3', date: '' } }), 'F3 given · 1 animal');
  assert.equal(L.aaSummary({ kind: 'weird', animal_ids: [], payload: null }), '');
});

test('aaCountdown: counts down 24 h, goes amber in the last 4 h, red and overdue after', () => {
  const at = ms => ({ sent_at: new Date(NOW - ms).toISOString() });
  const fresh = L.aaCountdown(at(1 * H), NOW);
  assert.equal(fresh.level, 'ok'); assert.equal(fresh.overdue, false); assert.equal(fresh.label, '23h 0m left');
  const soon = L.aaCountdown(at(21 * H + 30 * M), NOW);
  assert.equal(soon.level, 'amber'); assert.equal(soon.label, '2h 30m left');
  const justUnder = L.aaCountdown(at(24 * H - M), NOW);
  assert.equal(justUnder.overdue, false); assert.equal(justUnder.label, '0h 1m left');
  const exactly = L.aaCountdown(at(24 * H), NOW);
  assert.equal(exactly.overdue, true); assert.equal(exactly.level, 'red'); assert.equal(exactly.label, 'Overdue by 0h 0m');
  const late = L.aaCountdown(at(27 * H + 5 * M), NOW);
  assert.equal(late.label, 'Overdue by 3h 5m'); assert.equal(late.overdueMs, 3 * H + 5 * M);
});

test('aaCountdown: a sent_at in the future (clock skew) reads as a full 24 h, never negative or NaN', () => {
  const r = L.aaCountdown({ sent_at: new Date(NOW + 5 * M).toISOString() }, NOW);
  assert.equal(r.label, '24h 0m left');
  assert.equal(L.aaCountdown({ sent_at: 'not a date' }, NOW).label, '24h 0m left');
});

test('aaSortItems: overdue first (most overdue first), then oldest first', () => {
  const mk = (id, agoH) => ({ id, sent_at: new Date(NOW - agoH * H).toISOString() });
  const out = L.aaSortItems([mk('new', 1), mk('late', 26), mk('old', 10), mk('later', 30)], NOW).map(i => i.id);
  assert.deepEqual(out, ['later', 'late', 'old', 'new']);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/logic.test.mjs`
Expected: the new tests FAIL with `L.parseAnimalIds is not a function` (plus the one pre-existing `vaccStatus` failure).

- [ ] **Step 3: Implement** (insert in `lib/ldh-logic.js` just above `return { BOARD_ROOMS, …`)

```js
  /* ---------- Admission AA (2026-10-17) ----------
     Items the nurses send for the Admission AA to enter in ShelterMate. Ticked = deleted, so there is no "done" state here. */
  const AA_KINDS = { fiv: 'FIV result', microchip: 'Microchip', uv: 'UV result', microchip_uv: 'Microchip + UV', vaccination: 'Vaccination update' };
  const AA_HOURS = 24;

  function parseAnimalIds(text) {
    const seen = new Set(), out = [];
    String(text == null ? '' : text).split(/[\s,;]+/).forEach(s => {
      const id = s.trim().toUpperCase();
      if (id && !seen.has(id)) { seen.add(id); out.push(id); }
    });
    return out;
  }

  function aaBuildItem(f) {
    if (!AA_KINDS[f.kind]) return { error: 'Choose what you are sending (the type).' };
    const ids = parseAnimalIds(f.idsText);
    if (!ids.length) return { error: 'Enter at least one animal ID.' };
    if (f.kind !== 'vaccination' && ids.length > 1) return { error: 'Send one animal at a time for this type (only vaccination updates can list several).' };
    const initials = String(f.initials || '').trim().toUpperCase().slice(0, 4);
    if (!initials) return { error: 'Enter your initials first.' };
    const text = v => String(v == null ? '' : v).trim();
    let payload;
    if (f.kind === 'fiv' || f.kind === 'uv') {
      if (!text(f.result)) return { error: 'Enter the result.' };
      payload = { result: text(f.result) };
    } else if (f.kind === 'microchip' || f.kind === 'microchip_uv') {
      const chip = String(f.chipNumber == null ? '' : f.chipNumber).replace(/[\s-]/g, '');
      if (!/^\d{9,15}$/.test(chip)) return { error: 'The microchip number must be 9 to 15 digits (spaces are fine).' };
      payload = { chip_number: chip, implanter: initials };
      if (f.kind === 'microchip_uv') {
        if (!text(f.uvResult)) return { error: 'Enter the UV result.' };
        payload.uv_result = text(f.uvResult);
      }
    } else {
      if (!text(f.vaccine)) return { error: 'Enter the vaccine given.' };
      payload = { vaccine: text(f.vaccine), date: text(f.vaccDate) };
    }
    return { row: { kind: f.kind, animal_ids: ids, payload, sent_by: initials } };
  }

  function aaSummary(item) {
    const p = item.payload || {};
    const n = (item.animal_ids || []).length;
    switch (item.kind) {
      case 'fiv': return p.result || '';
      case 'uv': return 'UV: ' + (p.result || '');
      case 'microchip': return `Chip ${p.chip_number} · implanted by ${p.implanter}`;
      case 'microchip_uv': return `Chip ${p.chip_number} · implanted by ${p.implanter} · UV: ${p.uv_result}`;
      case 'vaccination': return `${p.vaccine} given${p.date ? ' ' + p.date : ''} · ${n} animal${n === 1 ? '' : 's'}`;
      default: return '';
    }
  }

  function aaCountdown(item, nowMs) {
    const total = AA_HOURS * 3600000;
    let sent = new Date(item.sent_at).getTime();
    if (!isFinite(sent) || sent > nowMs) sent = nowMs;           // bad/future timestamp: treat as just sent
    const left = total - (nowMs - sent);
    const hm = ms => `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
    if (left <= 0) return { msLeft: 0, overdue: true, overdueMs: -left, level: 'red', label: 'Overdue by ' + hm(-left) };
    return { msLeft: left, overdue: false, overdueMs: 0, level: left <= 4 * 3600000 ? 'amber' : 'ok', label: hm(left) + ' left' };
  }

  function aaSortItems(items, nowMs) {
    return items.slice().sort((a, b) => {
      const ca = aaCountdown(a, nowMs), cb = aaCountdown(b, nowMs);
      if (ca.overdue !== cb.overdue) return ca.overdue ? -1 : 1;
      return new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime();
    });
  }
```

Then add `AA_KINDS, AA_HOURS, parseAnimalIds, aaBuildItem, aaSummary, aaCountdown, aaSortItems,` to the final `return { … }` object.

- [ ] **Step 4: Run to verify they pass**

Run: `node --test tests/logic.test.mjs`
Expected: all new tests PASS (only the one pre-existing `vaccStatus` failure remains).

- [ ] **Step 5: Commit**

```bash
git add lib/ldh-logic.js tests/logic.test.mjs
git commit -m "feat: Admission AA rules (build item, summary, 24 h countdown, sort)"
```

---

### Task 2: Migration 0017 `aa_items` + `aa` passcode role

**Files:**
- Create: `supabase/migrations/0017_admission_aa.sql`
- Create: `tests/admission-aa-migration.test.mjs`

**Interfaces:**
- Produces: table `public.aa_items(id uuid pk, kind text, animal_ids text[], payload jsonb, sent_by text, sent_at timestamptz)`; `role_passcodes.role` now allows `'aa'`; `check_passcode('aa', <code>)` returns false until Juliana sets a code.
- Consumes: `check_passcode`, `role_passcodes` from `0010_round3.sql`.

- [ ] **Step 1: Write the failing test** (`tests/admission-aa-migration.test.mjs`)

```js
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const MIG = path.resolve(import.meta.dirname, '../supabase/migrations');
// Same chain the round-3 suite needs for role_passcodes, plus 0017. (0006/0007/0011-0016 don't touch these tables.)
const CHAIN = ['0001_init_schema.sql', '0002_rls_policies.sql', '0003_sync_account_scope.sql', '0004_task_problem_field.sql',
  '0005_task_condition_field.sql', '0008_triage_and_vet_desk.sql', '0009_surveillance.sql', '0010_round3.sql', '0017_admission_aa.sql'];

const SHIM = `
  create schema extensions;
  create function extensions.gen_salt(t text) returns text language sql as $$ select '$shim$' || md5(random()::text) $$;
  create function extensions.crypt(pw text, salt text) returns text language sql as
    $$ select substr(salt, 1, 38) || md5(pw || substr(salt, 1, 38)) $$;`;
const load = f => fs.readFileSync(path.join(MIG, f), 'utf8')
  .replace(/create extension if not exists pgcrypto with schema extensions;/, '')
  .replace(/-- pgcrypto-guard-start[\s\S]*?-- pgcrypto-guard-end/, '');

async function db() {
  const d = new PGlite();
  await d.exec(`
    create schema auth;
    create function auth.role() returns text language sql as $$ select 'authenticated' $$;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('app.jwt', true), ''), '{}')::jsonb $$;
    create role authenticated; create role anon;
    create publication supabase_realtime;` + SHIM);
  for (const f of CHAIN) await d.exec(load(f));
  return d;
}
const rejects = async (d, sql) => { try { await d.exec(sql); return null; } catch (e) { return String(e.message); } };

test('0017: aa_items accepts the five kinds, rejects unknown kinds and empty animal lists', async () => {
  const d = await db();
  for (const k of ['fiv', 'microchip', 'uv', 'microchip_uv', 'vaccination'])
    await d.exec(`insert into public.aa_items (kind, animal_ids, payload, sent_by) values ('${k}', array['A1'], '{}'::jsonb, 'AB')`);
  assert.equal((await d.query(`select count(*)::int n from public.aa_items`)).rows[0].n, 5);
  assert.match(await rejects(d, `insert into public.aa_items (kind, animal_ids, payload, sent_by) values ('bogus', array['A1'], '{}'::jsonb, 'AB')`) || '', /check/i);
  assert.match(await rejects(d, `insert into public.aa_items (kind, animal_ids, payload, sent_by) values ('fiv', array[]::text[], '{}'::jsonb, 'AB')`) || '', /check/i);
});

test('0017: sent_at defaults to now and rows hard-delete', async () => {
  const d = await db();
  await d.exec(`insert into public.aa_items (kind, animal_ids, payload, sent_by) values ('fiv', array['A1'], '{"result":"neg"}'::jsonb, 'AB')`);
  const r = (await d.query(`select extract(epoch from (now() - sent_at)) as age from public.aa_items`)).rows[0];
  assert.ok(Number(r.age) < 60);
  await d.exec(`delete from public.aa_items`);
  assert.equal((await d.query(`select count(*)::int n from public.aa_items`)).rows[0].n, 0);
});

test('0017: RLS is on, the table is in the realtime publication, and the sync_writer role is shut out', async () => {
  const d = await db();
  assert.equal((await d.query(`select relrowsecurity from pg_class where relname='aa_items'`)).rows[0].relrowsecurity, true);
  assert.equal((await d.query(`select count(*)::int n from pg_publication_tables where pubname='supabase_realtime' and tablename='aa_items'`)).rows[0].n, 1);
  const pol = (await d.query(`select polname, pg_get_expr(polqual, polrelid) q from pg_policy where polrelid='public.aa_items'::regclass`)).rows;
  assert.equal(pol.length, 4);
  assert.ok(pol.every(p => !p.q || /sync_writer/.test(p.q)));
});

test("0017: the 'aa' passcode role exists but nothing the repo knows unlocks it", async () => {
  const d = await db();
  assert.equal((await d.query(`select count(*)::int n from public.role_passcodes where role='aa'`)).rows[0].n, 1);
  for (const guess of ['aa', 'admission', 'nurse', 'vet2026', '']) {
    assert.equal((await d.query(`select public.check_passcode('aa', $1) as ok`, [guess])).rows[0].ok, false);
  }
  // Setting a code (what Juliana does in the SQL editor) then works, and the vet/nurse codes are untouched.
  await d.exec(`update public.role_passcodes set code_hash = extensions.crypt('sample-code', extensions.gen_salt('bf')) where role='aa'`);
  assert.equal((await d.query(`select public.check_passcode('aa','sample-code') as ok`)).rows[0].ok, true);
  assert.equal((await d.query(`select public.check_passcode('nurse','nurse') as ok`)).rows[0].ok, true);
});

test('0017: re-running is safe and does not reset an AA code that has been set', async () => {
  const d = await db();
  await d.exec(`update public.role_passcodes set code_hash = extensions.crypt('sample-code', extensions.gen_salt('bf')) where role='aa'`);
  await d.exec(load('0017_admission_aa.sql'));
  assert.equal((await d.query(`select public.check_passcode('aa','sample-code') as ok`)).rows[0].ok, true);
  assert.equal((await d.query(`select count(*)::int n from pg_policy where polrelid='public.aa_items'::regclass`)).rows[0].n, 4);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/admission-aa-migration.test.mjs`
Expected: FAIL with `ENOENT … 0017_admission_aa.sql`.

- [ ] **Step 3: Write the migration** (`supabase/migrations/0017_admission_aa.sql`)

```sql
-- 2026-10-17: Admission AA page. Nurses send items (FIV result, microchip, UV result, vaccination updates) for the
-- Admission AA to enter in ShelterMate; the AA ticks each one off and the row is DELETED (no archive).
-- Run this whole file as ONE script. Safe to run more than once.
-- After running, set the real AA passcode IN THE SQL EDITOR ONLY (see rotate-codes.sql). Never commit a real code.

-- 1. The 'aa' role may have a passcode. The seed is a random value nobody knows, so the AA page stays locked until
--    the real code is set; re-running never overwrites a code that has been set.
alter table public.role_passcodes drop constraint if exists role_passcodes_role_check;
alter table public.role_passcodes add constraint role_passcodes_role_check check (role in ('vet','nurse','aa'));
insert into public.role_passcodes (role, code_hash)
  values ('aa', extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')))
  on conflict (role) do nothing;

-- 2. The items. One row per send; a vaccination update lists many animals, everything else exactly one.
create table if not exists public.aa_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('fiv','microchip','uv','microchip_uv','vaccination')),
  animal_ids text[] not null check (cardinality(animal_ids) >= 1),
  payload jsonb not null default '{}'::jsonb,
  sent_by text,
  sent_at timestamptz not null default now()
);
alter table public.aa_items enable row level security;

-- 3. Same access model as the other dashboard tables (shared staff login; the sync tool's account is shut out) + realtime.
do $$
declare cmd text;
begin
  foreach cmd in array array['select','insert','update','delete'] loop
    execute format('drop policy if exists "authenticated_%s_aa_items" on public.aa_items', cmd);
  end loop;
  create policy "authenticated_select_aa_items" on public.aa_items for select
    using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  create policy "authenticated_insert_aa_items" on public.aa_items for insert
    with check (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  create policy "authenticated_update_aa_items" on public.aa_items for update
    using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  create policy "authenticated_delete_aa_items" on public.aa_items for delete
    using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'aa_items') then
    alter publication supabase_realtime add table public.aa_items;
  end if;
end $$;
```

Note: `gen_random_uuid()` is built in to Postgres 13+ (Supabase and PGlite). If PGlite 0.2.x rejects it, the earlier migrations in this repo already call it as a column default, so it is available.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/admission-aa-migration.test.mjs`
Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0017_admission_aa.sql tests/admission-aa-migration.test.mjs
git commit -m "feat: aa_items table and 'aa' passcode role (migration 0017)"
```

---

### Task 3: Nav link + test stub support

**Files:**
- Modify: `lib/ops-core.js:15-21` (add nav entry)
- Modify: `tests/ui/harness.js` (`aa_items` table, `aa` passcode, two places)
- Test: `tests/ui/ops-core.test.js` (extend)

**Interfaces:**
- Produces: nav key `'aa'` → `admission-aa.html`, label `Admission AA`; harness table `aa_items` (default row `{ payload: {}, sent_at: now }`); harness passcode `aa: 'aa-test'` (both the Node-side `PASSCODES` const at the top and the in-page `PASSCODES` in the stub).

- [ ] **Step 1: Write the failing test** (add to `tests/ui/ops-core.test.js` next to the `navHTML` assertions around line 43; open the file and follow its local variable names)

```js
    const navAA = await page.evaluate(() => OpsCore.navHTML('aa'));
    t.ok(/class="oc-nav-link active"[^>]*>Admission AA</.test(navAA), 'navHTML has an Admission AA link and marks it active');
    t.ok(/href="admission-aa.html"/.test(navAA), 'the Admission AA link points at admission-aa.html');
```

- [ ] **Step 2: Run to verify it fails**

Run: `NODE_PATH=<playwright path> node tests/ui/ops-core.test.js`
Expected: FAIL on the two new assertions.

- [ ] **Step 3: Implement**

In `lib/ops-core.js`, add as the last entry of `NAV_LINKS` (before `stats`, so Stats stays last):

```js
    { key: 'aa', href: 'admission-aa.html', label: 'Admission AA' },
```

In `tests/ui/harness.js`:
- both `const PASSCODES = { nurse: 'nurse', vet: 'vet2026' }` lines → `{ nurse: 'nurse', vet: 'vet2026', aa: 'aa-test' }`
- in the `window.__db = {…}` object add `aa_items: []`
- in `defaults` add `aa_items: () => ({ payload: {}, sent_at: now() }),`

- [ ] **Step 4: Run to verify it passes, and nothing else broke**

Run: the full UI command from Global Constraints.
Expected: `ops-core` PASS; only the two pre-existing stale UI suites fail.

- [ ] **Step 5: Commit**

```bash
git add lib/ops-core.js tests/ui/harness.js tests/ui/ops-core.test.js
git commit -m "feat: Admission AA nav link and test-stub support"
```

---

### Task 4: The Admission AA page

**Files:**
- Create: `admission-aa.html`
- Test: `tests/ui/admission-aa.test.js`

**Interfaces:**
- Consumes: `LDHLogic.AA_KINDS/aaSummary/aaCountdown/aaSortItems`, `OpsCore.init({ page:'aa', gateRole:'aa' })`, `OpsCore.subscribe`, `OpsCore.createAlertSound('sound-chip')`, table `aa_items`.
- Produces (DOM ids the tests use): `#app-root`, `#aa-list`, `#aa-overdue-count`, `#new-item-banner`, `#new-item-banner-text`, `#sound-chip`, `#signout-link`, `#ops-nav`; each card is `.aa-card[data-id]` with `.aa-done` button.

Page layout: copy the `<head>`, CSS variables, `aside` and `main` structure from `nurses.html` (lines 1-168 CSS, 169-186 aside) minus nurse-only CSS; the sidebar hint text says "Enter each item in ShelterMate, then tick it off. Ticked items are deleted." No initials box (the AA doesn't sign items). Include the IP header comment and footer.

- [ ] **Step 1: Write the failing test** (`tests/ui/admission-aa.test.js`)

```js
// Admission AA page: own passcode, cards with a 24 h countdown, overdue warning, tick = delete, new-item banner.
const { open } = require('./harness');
const t = require('./check')('admission-aa');
const H = 3600 * 1000, M = 60 * 1000;
const ago = ms => new Date(Date.now() - ms).toISOString();

(async () => {
  /* Tab 0: gated by the AA's own passcode (not the nurse code). */
  const g = await open({}, 'admission-aa.html', { skipRoleGate: true });
  try {
    t.ok((await g.page.getAttribute('#oc-role-gate', 'data-role')) === 'aa', 'the gate is for the aa role');
    t.ok(!(await g.page.isVisible('#app-root')), 'the app is hidden behind the gate');
    await g.page.fill('#oc-role-gate .oc-gate-input', 'nurse');
    await g.page.click('#oc-role-gate .oc-gate-submit');
    await g.page.waitForFunction(() => getComputedStyle(document.querySelector('#oc-gate-error')).display !== 'none');
    t.ok(await g.page.locator('#oc-role-gate').count() === 1, 'the nurse passcode does not open the AA page');
    await g.page.fill('#oc-role-gate .oc-gate-input', 'aa-test');
    await g.page.click('#oc-role-gate .oc-gate-submit');
    await g.page.waitForSelector('#oc-role-gate', { state: 'detached' });
    t.ok(await g.page.isVisible('#app-root'), 'the AA passcode opens the page');
    t.ok((await g.page.locator('#ops-nav a.active').textContent()) === 'Admission AA', 'nav marks Admission AA as current');
    t.ok(/nothing waiting/i.test(await g.page.textContent('#aa-list')), 'empty state when nothing has been sent');
  } finally { await g.browser.close(); }

  /* Tab A: cards, countdown, overdue ordering, tick deletes. */
  const seed = { aa_items: [
    { id: 'fresh', kind: 'fiv', animal_ids: ['A100'], payload: { result: 'FIV negative' }, sent_by: 'AB', sent_at: ago(1 * H) },
    { id: 'late', kind: 'microchip_uv', animal_ids: ['A200'], payload: { chip_number: '985112000123456', implanter: 'CD', uv_result: 'Clear' }, sent_by: 'CD', sent_at: ago(26 * H) },
    { id: 'vacc', kind: 'vaccination', animal_ids: ['A1', 'A2', 'A3'], payload: { vaccine: 'F3', date: '2026-10-17' }, sent_by: 'EF', sent_at: ago(21 * H + 30 * M) },
    { id: 'xss', kind: 'fiv', animal_ids: ['<img src=x onerror=window.__pwned=1>'], payload: { result: '"><script>window.__pwned=1</script>' }, sent_by: 'AB', sent_at: ago(2 * H) }
  ] };
  const a = await open(seed, 'admission-aa.html');
  try {
    const order = await a.page.$$eval('.aa-card', els => els.map(e => e.dataset.id));
    t.ok(order[0] === 'late', 'the overdue card is first: ' + order.join(','));
    t.ok(order.indexOf('vacc') < order.indexOf('fresh'), 'oldest first among the on-time cards');
    const late = await a.page.textContent('.aa-card[data-id="late"]');
    t.ok(/Overdue by 2h/.test(late), 'overdue card says how late: ' + late.replace(/\s+/g, ' ').slice(0, 120));
    t.ok(/A200/.test(late) && /985112000123456/.test(late) && /implanted by CD/.test(late) && /UV: Clear/.test(late), 'microchip + UV card shows ID, chip number, implanter and UV result');
    t.ok(/overdue/i.test(await a.page.textContent('#aa-overdue-count')) && /1/.test(await a.page.textContent('#aa-overdue-count')), 'top counter shows 1 overdue');
    t.ok(/2h 30m left/.test(await a.page.textContent('.aa-card[data-id="vacc"]')), 'on-time card shows time left');
    t.ok(/A1, A2, A3/.test(await a.page.textContent('.aa-card[data-id="vacc"]')) && /3 animals/.test(await a.page.textContent('.aa-card[data-id="vacc"]')), 'vaccination card lists every ID');
    t.ok(await a.page.evaluate(() => window.__pwned === undefined), 'hostile text is escaped, not executed');

    await a.page.click('.aa-card[data-id="late"] .aa-done');   // harness auto-accepts the confirm()
    await a.page.waitForFunction(() => !document.querySelector('.aa-card[data-id="late"]'));
    const db = await a.db();
    t.ok(!db.aa_items.some(r => r.id === 'late'), 'ticking removes the row from the database completely');
    t.ok(db.aa_items.length === 3, 'other items are untouched');
    t.ok(/0 overdue|^\s*$/i.test(await a.page.textContent('#aa-overdue-count')) || (await a.page.isHidden('#aa-overdue-count')), 'overdue counter clears');

    // Another device already ticked it: our delete matches 0 rows, no error dialog, list refreshes.
    let dialogs = 0; a.page.on('dialog', () => { dialogs++; });
    await a.page.evaluate(() => { window.__db.aa_items = window.__db.aa_items.filter(r => r.id !== 'fresh'); });
    await a.page.click('.aa-card[data-id="fresh"] .aa-done');
    await a.page.waitForFunction(() => !document.querySelector('.aa-card[data-id="fresh"]'));
    t.ok(a.errors.length === 0, 'no page errors: ' + a.errors.join('; '));
  } finally { await a.browser.close(); }

  /* Tab B: a new item arriving while the page is open raises the banner with a count. */
  const b = await open({ aa_items: [{ id: 'old', kind: 'fiv', animal_ids: ['A1'], payload: { result: 'neg' }, sent_by: 'AB', sent_at: ago(1 * H) }] }, 'admission-aa.html');
  try {
    t.ok(await b.page.isHidden('#new-item-banner'), 'nothing already open alerts on load');
    await b.page.evaluate(() => {
      const now = new Date().toISOString();
      ['n1', 'n2', 'n3'].forEach((id, i) => window.__db.aa_items.push({ id, kind: 'uv', animal_ids: ['B' + i], payload: { result: 'Clear' }, sent_by: 'XY', sent_at: now }));
    });
    await b.page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await b.page.waitForSelector('#new-item-banner', { state: 'visible', timeout: 70000 });
    t.ok(/3 new items sent through/.test(await b.page.textContent('#new-item-banner-text')), 'banner summarises with a count: ' + await b.page.textContent('#new-item-banner-text'));
  } finally { await b.browser.close(); }
  t.done();
})();
```

Implementation note for the executor: the stub's `channel().on().subscribe()` records listeners but nothing fires them on a raw push into `window.__db`; check how `vets-page.test.js` triggers a "new request arrives" in Tab B-style tests (it calls the page's `loadAll()` or a stub helper) and use the same mechanism instead of the `focus` line above. If no helper exists, call `await b.page.evaluate(() => loadAll())` (it is a top-level function in the page) and drop the 70 s timeout to 5 s.

- [ ] **Step 2: Run to verify it fails**

Run: `NODE_PATH=<playwright path> node tests/ui/admission-aa.test.js`
Expected: FAIL (page file does not exist / gate not found).

- [ ] **Step 3: Implement `admission-aa.html`**

Structure (script portion; HTML shell copied from `nurses.html` as described above):

```html
<aside>
  <h2>LDH Shift Ops</h2>
  <div id="ops-nav" style="margin-bottom:18px;"></div>
  <p class="hint">Enter each item in ShelterMate, then tick it off here. Ticked items are deleted from the database straight away. Anything left for 24 hours turns red.</p>
  <span id="signout-link">Sign out</span>
</aside>
<main>
  <div id="new-item-banner" class="alert-banner" style="display:none;">
    <span id="new-item-banner-text"></span>
    <button type="button" id="new-item-banner-dismiss" class="alert-banner-dismiss" aria-label="Dismiss">&times;</button>
  </div>
  <div class="page-head">
    <div><h1>Admission AA</h1><p>Sent by the nurses. Enter in ShelterMate, then tick off.</p></div>
    <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
      <span id="aa-overdue-count" class="lvl lvl-red" style="display:none;"></span>
      <button type="button" id="sound-chip" class="sound-off">🔕 Tap here to turn on the alert sound</button>
    </div>
  </div>
  <section class="card"><h2>To enter in ShelterMate</h2><div id="aa-list"></div></section>
</main>
```

Script:

```js
<script>
  let sb = null;
  const esc = OpsCore.esc;
  let ITEMS = [];
  let doneThisSession = 0;               // count only; no patient data is kept in the browser

  function cardHtml(it, now) {
    const c = LDHLogic.aaCountdown(it, now);
    return `<div class="attn-item aa-card" data-id="${esc(it.id)}">
      <div>
        <div class="aname">${esc(it.animal_ids.join(', '))} <span class="tag-med">${esc(LDHLogic.AA_KINDS[it.kind] || it.kind)}</span></div>
        <div class="ameta">${esc(LDHLogic.aaSummary(it))} · sent ${esc(new Date(it.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}${it.sent_by ? ' by ' + esc(it.sent_by) : ''}</div>
      </div>
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <span class="lvl lvl-${esc(c.level === 'ok' ? 'ok' : c.level)}">${esc(c.label)}</span>
        <button type="button" class="aa-done" data-id="${esc(it.id)}">Entered in ShelterMate ✓</button>
      </div></div>`;
  }
  function render() {
    const now = Date.now();
    const sorted = LDHLogic.aaSortItems(ITEMS, now);
    document.getElementById('aa-list').innerHTML = sorted.map(i => cardHtml(i, now)).join('')
      || '<p class="empty-state">Nothing waiting. New items from the nurses will appear here with a sound.</p>';
    const late = sorted.filter(i => LDHLogic.aaCountdown(i, now).overdue).length;
    const el = document.getElementById('aa-overdue-count');
    el.style.display = late ? '' : 'none';
    el.textContent = late + ' overdue';
  }
  document.getElementById('aa-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('.aa-done'); if (!btn) return;
    if (!confirm('Have you entered this in ShelterMate? Ticking removes it from here for good.')) return;
    btn.disabled = true;
    const { error } = await sb.from('aa_items').delete().eq('id', btn.dataset.id);   // already gone elsewhere = 0 rows, not an error
    if (error) { btn.disabled = false; alert('Could not tick this off: ' + error.message); return; }
    doneThisSession++;
    loadAll();
  });

  /* ---------- new-item banner + sound (same shared module as Vets/Nurses) ---------- */
  const alertSound = OpsCore.createAlertSound('sound-chip');
  const BASE_TITLE = document.title;
  let seen = new Set(), seenInitialised = false, pendingNew = 0, titleFlashTimer = null;
  function hideBanner() {
    document.getElementById('new-item-banner').style.display = 'none';
    pendingNew = 0;
    if (titleFlashTimer) { clearInterval(titleFlashTimer); titleFlashTimer = null; }
    document.title = BASE_TITLE;
  }
  document.getElementById('new-item-banner-dismiss').addEventListener('click', hideBanner);
  function checkForNewItems() {
    const fresh = ITEMS.filter(i => !seen.has(i.id));
    ITEMS.forEach(i => seen.add(i.id));
    if (!seenInitialised) { seenInitialised = true; return; }     // nothing already open alerts on page load
    if (!fresh.length) return;
    pendingNew += fresh.length;
    document.getElementById('new-item-banner-text').textContent = `🔔 ${pendingNew} new item${pendingNew > 1 ? 's' : ''} sent through — enter in ShelterMate below.`;
    document.getElementById('new-item-banner').style.display = 'flex';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    alertSound.play();
    if (!titleFlashTimer) {
      let on = false;
      titleFlashTimer = setInterval(() => { on = !on; document.title = on ? '🔔 NEW ITEM — Admission AA' : BASE_TITLE; }, 1000);
    }
  }

  async function loadAll() {
    const { data } = await sb.from('aa_items').select('*').order('sent_at', { ascending: true });
    ITEMS = data || [];
    checkForNewItems();
    render();
  }
  setInterval(render, 60000);          // countdowns tick even with no data change

  (async function () {
    const { sb: client } = await OpsCore.init({ page: 'aa', gateRole: 'aa' });
    sb = client;
    document.getElementById('app-root').style.display = 'grid';
    await loadAll();
    OpsCore.subscribe(['aa_items'], loadAll);
    document.getElementById('signout-link').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });
  })();
</script>
```

CSS to include (copy `.card`, `.attn-item`, `.aname`, `.ameta`, `.tag-med`, `.lvl*`, `.alert-banner*`, `#new-item-banner`, `#sound-chip`, `.empty-state`, layout/aside rules verbatim from `nurses.html`; it is fine to link none of the nurse-only classes). Add: `.aa-card .aa-done { background: var(--green); color: #fff; }`.

`doneThisSession` is intentionally unused beyond the counter (spec: a done-today count is kept in the session only); if it stays unused, show it in the sidebar hint: `Done this session: N`. Update that text inside `render()`.

- [ ] **Step 4: Run to verify it passes**

Run: `NODE_PATH=<playwright path> node tests/ui/admission-aa.test.js`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add admission-aa.html tests/ui/admission-aa.test.js
git commit -m "feat: Admission AA page (own passcode, 24 h countdown, tick deletes)"
```

---

### Task 5: Nurses page: "Send to Admission AA" card

**Files:**
- Modify: `nurses.html` (new card in the Processing nurse column; prefill buttons on misc rows and nurse-request rows; script block)
- Test: `tests/ui/nurses-send-aa.test.js`

**Interfaces:**
- Consumes: `LDHLogic.AA_KINDS/aaBuildItem`, `myInitials()` (existing), `sb.from('aa_items').insert`.
- Produces: DOM `#aa-send-card`, fields `#aa-kind`, `#aa-ids`, `#aa-result`, `#aa-chip`, `#aa-uv`, `#aa-vaccine`, `#aa-vdate`, button `#aa-send`, error `#aa-error`; function `prefillAaSend(kind, ids)`; prefill buttons `.aa-prefill[data-kind][data-ids]` on microchip/UV/FIV rows.

Field visibility per kind: `fiv`/`uv` → result; `microchip` → chip number; `microchip_uv` → chip number + UV result; `vaccination` → vaccine + date (default today via `LDHLogic.localISO(new Date())`) and the IDs box is labelled "Animal ID(s), several allowed"; for all other kinds the label is "Animal ID". Chip text on success: "Sent to the Admission AA ✓" for 4 seconds; fields cleared except kind.

- [ ] **Step 1: Write the failing test** (`tests/ui/nurses-send-aa.test.js`)

```js
// Nurses page: Send to Admission AA card (FIV, microchip, UV, Microchip + UV, bulk vaccination update).
const { open } = require('./harness');
const t = require('./check')('nurses-send-aa');
const LDHLogic = require('../../lib/ldh-logic');
const todayISO = LDHLogic.localISO(new Date());

(async () => {
  const seed = {
    noga_requests: [{ animal_id: 'FOS-9', location: 'Pathway', task: 'microchip', done: false }],
    nurse_requests: [{ kind: 'microchip_uv', location: 'Pathway', species: 'cat', animal_count: 1, animal_id: 'FOS-7', arrived_at: new Date().toISOString() }]
  };
  const p = await open(seed, 'nurses.html');
  try {
    await p.page.fill('#initials-input', 'ab');

    // Bulk vaccination update: messy IDs, several animals, one card for the AA.
    await p.page.selectOption('#aa-kind', 'vaccination');
    t.ok(await p.page.isVisible('#aa-vaccine') && !(await p.page.isVisible('#aa-chip')), 'vaccination shows vaccine fields, not chip fields');
    t.ok((await p.page.inputValue('#aa-vdate')) === todayISO, 'vaccination date defaults to today');
    await p.page.fill('#aa-ids', 'a1, A2  a3\na1');
    await p.page.click('#aa-send');
    t.ok(/vaccine/i.test(await p.page.textContent('#aa-error')), 'vaccine is required: ' + await p.page.textContent('#aa-error'));
    await p.page.fill('#aa-vaccine', 'F3');
    await p.page.click('#aa-send');
    await p.page.waitForFunction(() => window.__db.aa_items.length === 1);
    let row = (await p.db()).aa_items[0];
    t.ok(row.kind === 'vaccination' && JSON.stringify(row.animal_ids) === '["A1","A2","A3"]', 'one row, cleaned IDs: ' + JSON.stringify(row.animal_ids));
    t.ok(row.payload.vaccine === 'F3' && row.payload.date === todayISO && row.sent_by === 'AB', 'payload and initials recorded');
    t.ok((await p.page.inputValue('#aa-ids')) === '', 'form clears after sending');

    // Microchip: one animal only, digits validated, implanter = initials.
    await p.page.selectOption('#aa-kind', 'microchip');
    await p.page.fill('#aa-ids', 'A5 A6');
    await p.page.fill('#aa-chip', '985 112 000 123 456');
    await p.page.click('#aa-send');
    t.ok(/one animal/i.test(await p.page.textContent('#aa-error')), 'two animals refused for microchip');
    await p.page.fill('#aa-ids', 'A5');
    await p.page.fill('#aa-chip', '12AB');
    await p.page.click('#aa-send');
    t.ok(/digits/i.test(await p.page.textContent('#aa-error')), 'bad chip number refused');
    await p.page.fill('#aa-chip', '985 112 000 123 456');
    await p.page.click('#aa-send');
    await p.page.waitForFunction(() => window.__db.aa_items.length === 2);
    row = (await p.db()).aa_items[1];
    t.ok(row.payload.chip_number === '985112000123456' && row.payload.implanter === 'AB', 'chip stored as digits with implanter initials');

    // Microchip + UV and FIV and UV.
    await p.page.selectOption('#aa-kind', 'microchip_uv');
    t.ok(await p.page.isVisible('#aa-chip') && await p.page.isVisible('#aa-uv'), 'combined type shows chip and UV fields');
    await p.page.fill('#aa-ids', 'A7'); await p.page.fill('#aa-chip', '985112000123457'); await p.page.fill('#aa-uv', 'Clear');
    await p.page.click('#aa-send');
    await p.page.waitForFunction(() => window.__db.aa_items.length === 3);
    await p.page.selectOption('#aa-kind', 'fiv');
    await p.page.fill('#aa-ids', 'A8'); await p.page.fill('#aa-result', 'FIV negative');
    await p.page.click('#aa-send');
    await p.page.waitForFunction(() => window.__db.aa_items.length === 4);
    t.ok((await p.db()).aa_items[3].payload.result === 'FIV negative', 'FIV result sent');

    // Prefill buttons on a microchip task and a Microchip + UV request.
    await p.page.click('.noga-item .aa-prefill');
    t.ok((await p.page.inputValue('#aa-kind')) === 'microchip' && (await p.page.inputValue('#aa-ids')) === 'FOS-9', 'misc microchip row prefills type and ID');
    await p.page.click('.nr-item .aa-prefill');
    t.ok((await p.page.inputValue('#aa-kind')) === 'microchip_uv' && (await p.page.inputValue('#aa-ids')) === 'FOS-7', 'Microchip + UV request prefills type and ID');

    // No initials -> prompt answer is used (harness answers JX); empty prompt -> refused.
    t.ok(p.errors.length === 0, 'no page errors: ' + p.errors.join('; '));
  } finally { await p.browser.close(); }
  t.done();
})();
```

- [ ] **Step 2: Run to verify it fails**

Run: `NODE_PATH=<playwright path> node tests/ui/nurses-send-aa.test.js`
Expected: FAIL (`#aa-kind` not found).

- [ ] **Step 3: Implement in `nurses.html`**

(a) Card, placed at the top of the Processing nurse column (find `id="processing-col"` / its first `<section class="card">`; put this before it):

```html
<section class="card" id="aa-send-card">
  <h2>Send to Admission AA</h2>
  <p class="subtle">The Admission AA enters it in ShelterMate and ticks it off. Your initials are recorded.</p>
  <select id="aa-kind">
    <option value="vaccination">Vaccination update</option>
    <option value="microchip">Microchip</option>
    <option value="microchip_uv">Microchip + UV</option>
    <option value="uv">UV result</option>
    <option value="fiv">FIV result</option>
  </select>
  <label id="aa-ids-label" for="aa-ids" style="font-size:0.78rem; font-weight:700;">Animal ID(s), several allowed</label>
  <textarea id="aa-ids" rows="2" placeholder="e.g. A123, A124, A125"></textarea>
  <div id="aa-f-result"><input id="aa-result" placeholder="Result, e.g. FIV negative"></div>
  <div id="aa-f-chip"><input id="aa-chip" inputmode="numeric" placeholder="Microchip number (15 digits)"></div>
  <div id="aa-f-uv"><input id="aa-uv" placeholder="UV result, e.g. No fluorescence"></div>
  <div id="aa-f-vacc"><input id="aa-vaccine" placeholder="Vaccine given, e.g. F3"><input id="aa-vdate" type="date"></div>
  <p id="aa-error" class="oc-modal-error" style="display:none;"></p>
  <button type="button" id="aa-send">Send to Admission AA</button>
  <span id="aa-sent" class="subtle" style="display:none;">Sent to the Admission AA ✓</span>
</section>
```

(b) Script, inserted before the `loadAll` definition:

```js
  /* ============================================================
     Send to Admission AA (2026-10-17). One row in aa_items per send; the AA enters it in ShelterMate and ticks it off,
     which deletes it. The rules (one ID except vaccination, chip digits, initials) live in LDHLogic.aaBuildItem.
     ============================================================ */
  const AA_SHOW = {
    fiv: ['aa-f-result'], uv: ['aa-f-result'], microchip: ['aa-f-chip'],
    microchip_uv: ['aa-f-chip', 'aa-f-uv'], vaccination: ['aa-f-vacc']
  };
  function syncAaFields() {
    const kind = document.getElementById('aa-kind').value;
    ['aa-f-result', 'aa-f-chip', 'aa-f-uv', 'aa-f-vacc'].forEach(id => { document.getElementById(id).style.display = (AA_SHOW[kind] || []).includes(id) ? '' : 'none'; });
    document.getElementById('aa-ids-label').textContent = kind === 'vaccination' ? 'Animal ID(s), several allowed' : 'Animal ID';
    document.getElementById('aa-result').placeholder = kind === 'uv' ? 'UV result, e.g. No fluorescence' : 'Result, e.g. FIV negative';
    if (kind === 'vaccination' && !document.getElementById('aa-vdate').value) document.getElementById('aa-vdate').value = LDHLogic.localISO(new Date());
  }
  document.getElementById('aa-kind').addEventListener('change', syncAaFields);
  function prefillAaSend(kind, ids) {
    document.getElementById('aa-kind').value = kind;
    document.getElementById('aa-ids').value = ids;
    syncAaFields();
    document.getElementById('aa-send-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.aa-prefill'); if (b) prefillAaSend(b.dataset.kind, b.dataset.ids);
  });
  document.getElementById('aa-send').addEventListener('click', async () => {
    const err = document.getElementById('aa-error'), btn = document.getElementById('aa-send');
    const val = id => document.getElementById(id).value;
    err.style.display = 'none';
    const built = LDHLogic.aaBuildItem({
      kind: val('aa-kind'), idsText: val('aa-ids'), result: val('aa-result'), chipNumber: val('aa-chip'), uvResult: val('aa-uv'),
      vaccine: val('aa-vaccine'), vaccDate: val('aa-vdate'), initials: cleanInitials(document.getElementById('initials-input').value) || myInitials()
    });
    if (built.error) { err.textContent = built.error; err.style.display = 'block'; return; }
    btn.disabled = true;
    const { error } = await sb.from('aa_items').insert(built.row);
    btn.disabled = false;
    if (error) { err.textContent = 'Could not send: ' + error.message; err.style.display = 'block'; return; }
    ['aa-ids', 'aa-result', 'aa-chip', 'aa-uv', 'aa-vaccine'].forEach(id => { document.getElementById(id).value = ''; });
    const ok = document.getElementById('aa-sent'); ok.style.display = ''; setTimeout(() => { ok.style.display = 'none'; }, 4000);
  });
  syncAaFields();
```

(c) Prefill buttons. In `miscRowHtml(r)`, inside the not-done button group, add before the Done button, only for tasks `fiv_test`, `microchip`, `uv`:

```js
${AA_PREFILL_KIND[r.task] ? `<button class="secondary aa-prefill" data-kind="${esc(AA_PREFILL_KIND[r.task])}" data-ids="${esc(r.animal_id)}">Send to AA</button>` : ''}
```

with, near `PROCESSING_MISC_KINDS`:

```js
const AA_PREFILL_KIND = { fiv_test: 'fiv', microchip: 'microchip', uv: 'uv' };
```

In `arrivedRowHtml(r)`, next to the existing Send-back button, only when `r.animal_id` and `r.kind` is one of `fiv`, `microchip`, `uv`, `microchip_uv`:

```js
${r.animal_id && ['fiv','microchip','uv','microchip_uv'].includes(r.kind) ? `<button class="secondary aa-prefill" data-kind="${esc(r.kind)}" data-ids="${esc(r.animal_id)}">Send to AA</button>` : ''}
```

Check `LDHLogic.MISC_TASK_LABELS` keys first (`grep -n MISC_TASK_LABELS lib/ldh-logic.js`) and use the real task keys in `AA_PREFILL_KIND` if they differ from `fiv_test / microchip / uv`.

- [ ] **Step 4: Run to verify it passes, plus the existing nurses suites**

Run: `NODE_PATH=<playwright path> node tests/ui/nurses-send-aa.test.js && NODE_PATH=<playwright path> node tests/ui/nurses-page.test.js`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add nurses.html tests/ui/nurses-send-aa.test.js
git commit -m "feat: nurses Send to Admission AA card with prefill buttons"
```

---

### Task 6: Passcode instructions, docs, full run, PR

**Files:**
- Modify: `supabase/rotate-codes.sql`
- Modify: `tests/README.md`

- [ ] **Step 1: Add the AA passcode step to `rotate-codes.sql`** (before the "Check" block; keep the placeholder style, no real value):

```sql
-- 3. Admission AA passcode (the AA page). Run migration 0017 first; it creates this role with a random code nobody knows.
update public.role_passcodes
   set code_hash = extensions.crypt('REPLACE_WITH_AA_CODE', extensions.gen_salt('bf'))
 where role = 'aa';
```

and in the check block add `-- select public.check_passcode('aa', 'REPLACE_WITH_AA_CODE');`. Update the header "Code structure" list with: `* Admission AA passcode: extra code for the Admission AA page only.`

- [ ] **Step 2: Update `tests/README.md`** Node suites list: add `admission-aa-migration`; UI list: add `admission-aa.test.js`, `nurses-send-aa.test.js`.

- [ ] **Step 3: Full run**

Run both full commands from Global Constraints.
Expected: everything green except the three known pre-existing failures.

- [ ] **Step 4: Secrets check before pushing**

Run: `git diff main --stat && git diff main | grep -nE "REPLACE_WITH|aa-test|sample-code"`
Expected: only placeholders (`REPLACE_WITH_*`) and the obviously fake test values (`aa-test`, `sample-code`) in files under `tests/`. No real codes anywhere.

- [ ] **Step 5: Commit, push, open PR (do not merge)**

```bash
git add supabase/rotate-codes.sql tests/README.md
git commit -m "docs: AA passcode step and test list"
git push -u origin HEAD
gh pr create --title "Admission AA page (phase 1)" --body "Adds admission-aa.html, aa_items (migration 0017), nurse Send to Admission AA card. Ticked = deleted; 24 h countdown with overdue warning. Needs migration 0017 and an AA passcode set in the SQL editor before use. Phase 2 (vet medication charts/notes from the shift tools) is separate."
```

Hand-off to Juliana (not a code step): run `0017_admission_aa.sql`, then set the AA passcode with the `rotate-codes.sql` step 3 **in the editor only**, then say "merge it". Use fictional animals for the first run-through; IT sign-off is still required before real patient data goes through.
