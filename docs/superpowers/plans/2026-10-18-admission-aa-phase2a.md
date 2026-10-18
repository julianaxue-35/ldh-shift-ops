# Admission AA Phase 2a (Processing notes → Admission AA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A vet in the Processing shift tool flips one "Share this shift with Admission AA" switch; from then on every animal she registers as finished appears on the Admission AA page as a task (animal ID + notes to view/copy/download as Word), with a visible NOT SENT / Resend safety net so the chain never silently breaks.

**Architecture:** Two repos. In `ldh-shift-ops`: migration 0018 (new kinds, `source_key` for update-not-duplicate, `updated_at`), a new `aa` request shape in the `sync-completion` Edge Function (validated, replies `{ok:true}`), and note cards on `admission-aa.html`. In `ldh-shift-tools`: a small shared `aa-share.js` (pure status/payload helpers + confirmed send) and a Processing integration (switch, status card, red bar, hooks at the three registration points, export/clear guards). A send only counts as sent when the Edge Function confirms it saved.

**Tech Stack:** Static HTML + inline JS, Supabase Postgres + Edge Function (Deno/TypeScript), PGlite migration tests, node:test, Playwright with a stubbed endpoint.

**Spec:** `docs/superpowers/specs/2026-10-18-admission-aa-phase2-design.md` (in `ldh-shift-ops`). This plan is **Phase 2a** only: Processing notes. Sick & Injured notes (2b) and medication charts (2c) get their own plans and reuse `aa-share.js`.

## Global Constraints

- Public repos: **no real codes, no real patient text, in any file, test, or commit message.** Test data is obviously fictional (IDs like `T-100`).
- Rollout order is fixed: migration 0018 → Edge Function deploy → dashboard merge → shift-tools merge. An old Edge Function rejects unknown shapes with 400, so the tools must not ship first.
- Sent = the Edge Function replied HTTP 200 with JSON `{ "ok": true }`. Anything else (offline, 401, 400, 500, timeout, non-JSON) = NOT SENT. Nothing is queued in the background; the vet resends manually.
- Ticked = deleted (Phase 1 rule unchanged). Unticked cards stay with the red overdue warning. A resend of a note that is still on the AA page **updates that card** (`updated_at` set, "updated hh:mm" shown); if the AA already ticked it, the resend becomes a new card.
- Size limits: `text` ≤ 20 000 characters; `docx_b64` ≤ 1 200 000 characters; whole payload ≤ 1 500 000 characters. Over the limit = refused with a clear message, shown as NOT SENT with the reason.
- Shift-tools rules: bump `APP_VERSION` in every tool file edited (`const APP_VERSION` in `processing.html`); any new animal field gets a default in `normalizeAnimal` so old saved shifts still open; keep the IP-notice header/footer untouched.
- The switch is stored per tool on the phone (`localStorage` key `ldh_aa_share_processing`), default OFF, and is turned OFF when "Clear list" empties the shift.
- Test commands:
  - ldh-shift-ops Node suites: `node --test tests/*.test.mjs`; UI suites: `NODE_PATH=/Users/jxue/.npm/_npx/e41f203b7505f1fb/node_modules node tests/ui/run-all.js` (all green at the start of this plan).
  - ldh-shift-tools (new in Task 5): `node --test tests/*.test.mjs` and `NODE_PATH=/Users/jxue/.npm/_npx/e41f203b7505f1fb/node_modules node tests/processing-aa.test.js`.

## Review Focus

- A phone that is offline all shift: every registered animal NOT SENT, red bar stays, export/clear warn, nothing crashes, nothing is lost, Resend works the moment signal returns (Tasks 5, 6).
- Note edited after it was sent: status flips to "changed since sent" and a resend updates (not duplicates) the card (Tasks 2, 5, 6).
- Same animal registered, un-registered and registered again; two vets sharing the same animal ID on one day → one live card per animal per day (Tasks 1, 2).
- Hostile or huge note text (`<script>`, quotes, 100 000 characters, a base64 blob that is not base64) → rejected or rendered inert, never executed (Tasks 2, 4).
- Switch turned on mid-shift with animals already registered → they are all sent once, none twice (Task 6).
- A registered animal with no animal ID → shown as "no ID, can't send", never sent as a blank card (Tasks 5, 6).

---

## File Structure

| File | Repo | Responsibility |
|---|---|---|
| `supabase/migrations/0018_aa_notes.sql` (create) | ops | kinds, `source_key`, `updated_at`, payload size check |
| `tests/aa-notes-migration.test.mjs` (create) | ops | PGlite test of 0018 |
| `supabase/functions/sync-completion/index.ts` (modify) | ops | new `aa` shape + `validateAaShare` block |
| `tests/aa-edge-validate.test.mjs` (create) | ops | unit test of the validation block |
| `lib/ldh-logic.js` (modify) | ops | `AA_KINDS` + `aaSummary` for note kinds, `aaChangeKey` |
| `admission-aa.html` (modify) | ops | note cards (View/Copy/Download), "updated" marker, alert on update |
| `tests/ui/admission-aa-notes.test.js` (create) | ops | UI test of note cards |
| `aa-share.js` (create) | tools | pure helpers + confirmed send |
| `tests/aa-share.test.mjs` (create) | tools | node tests of the helpers |
| `processing.html` (modify) | tools | switch, status card, red bar, hooks, guards, one-animal Word |
| `tests/processing-aa.test.js` (create) | tools | Playwright test with stubbed endpoint |
| `README.md` (modify) | tools | document the feature and tests |

---

## Part A: ldh-shift-ops (branch `aa-phase2a`, from `main`)

Run once: `cd ~/ldh-shift-ops && git checkout main && git pull && git checkout -b aa-phase2a`

### Task 1: Migration 0018

**Files:**
- Create: `supabase/migrations/0018_aa_notes.sql`
- Create: `tests/aa-notes-migration.test.mjs`

**Interfaces:**
- Produces: `aa_items.kind` also allows `processing_note`, `si_note`, `med_chart`; new columns `source_key text` (unique), `updated_at timestamptz` (null until first update); size check on `payload`.

- [ ] **Step 1: Write the failing test** (`tests/aa-notes-migration.test.mjs`). Copy the `SHIM`, `load`, `db()` and `rejects` helpers verbatim from `tests/admission-aa-migration.test.mjs`, set `CHAIN` to the same list as that file with `'0018_aa_notes.sql'` appended after `'0017_admission_aa.sql'`, then:

```js
test('0018: the three new kinds are accepted, unknown kinds still refused', async () => {
  const d = await db();
  for (const k of ['processing_note', 'si_note', 'med_chart'])
    await d.exec(`insert into public.aa_items (kind, animal_ids, payload, sent_by) values ('${k}', array['T-100'], '{"text":"x"}'::jsonb, 'AB')`);
  assert.equal((await d.query(`select count(*)::int n from public.aa_items`)).rows[0].n, 3);
  assert.match(await rejects(d, `insert into public.aa_items (kind, animal_ids, payload, sent_by) values ('bogus', array['T-100'], '{}'::jsonb, 'AB')`) || '', /check/i);
});

test('0018: source_key is unique (one live card per shift/animal/kind) but optional', async () => {
  const d = await db();
  await d.exec(`insert into public.aa_items (kind, animal_ids, payload, source_key) values ('fiv', array['A1'], '{}'::jsonb, null), ('fiv', array['A2'], '{}'::jsonb, null)`);
  await d.exec(`insert into public.aa_items (kind, animal_ids, payload, source_key) values ('processing_note', array['T-100'], '{}'::jsonb, 'processing_note|2026-10-18|T-100')`);
  assert.match(await rejects(d, `insert into public.aa_items (kind, animal_ids, payload, source_key) values ('processing_note', array['T-100'], '{}'::jsonb, 'processing_note|2026-10-18|T-100')`) || '', /unique|duplicate/i);
});

test('0018: updated_at starts null; oversize payloads are refused', async () => {
  const d = await db();
  await d.exec(`insert into public.aa_items (kind, animal_ids, payload) values ('fiv', array['A1'], '{}'::jsonb)`);
  assert.equal((await d.query(`select updated_at from public.aa_items`)).rows[0].updated_at, null);
  const big = 'x'.repeat(1600000);
  assert.match(await rejects(d, `insert into public.aa_items (kind, animal_ids, payload) values ('processing_note', array['A1'], jsonb_build_object('text','${big}'))`) || '', /check|payload/i);
});

test('0018: re-running is safe and keeps existing rows', async () => {
  const d = await db();
  await d.exec(`insert into public.aa_items (kind, animal_ids, payload, source_key) values ('processing_note', array['T-100'], '{}'::jsonb, 'k1')`);
  await d.exec(load('0018_aa_notes.sql'));
  assert.equal((await d.query(`select count(*)::int n from public.aa_items`)).rows[0].n, 1);
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `node --test tests/aa-notes-migration.test.mjs`
Expected: FAIL (`ENOENT … 0018_aa_notes.sql`).

- [ ] **Step 3: Write the migration** (`supabase/migrations/0018_aa_notes.sql`)

```sql
-- 2026-10-18: Admission AA Phase 2a. Vets' shift tools send finished notes to the AA page.
-- Run this whole file as ONE script. Safe to run more than once.
-- Run it BEFORE deploying the updated Edge Function.

-- 1. Three more kinds of card.
alter table public.aa_items drop constraint if exists aa_items_kind_check;
alter table public.aa_items add constraint aa_items_kind_check
  check (kind in ('fiv','microchip','uv','microchip_uv','vaccination','processing_note','si_note','med_chart'));

-- 2. One live card per shift/animal/kind: a resend UPDATES the card instead of adding a second one.
--    NULL for the nurse-sent kinds (NULLs never clash). updated_at stays NULL until a card is first updated.
alter table public.aa_items add column if not exists source_key text;
alter table public.aa_items add column if not exists updated_at timestamptz;
create unique index if not exists aa_items_source_key_idx on public.aa_items (source_key);

-- 3. Belt and braces behind the Edge Function's own limit (about 1.5 MB of JSON per card).
alter table public.aa_items drop constraint if exists aa_items_payload_size_check;
alter table public.aa_items add constraint aa_items_payload_size_check check (octet_length(payload::text) <= 1600000);
```

- [ ] **Step 4: Run, expect PASS** (4 tests): `node --test tests/aa-notes-migration.test.mjs`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0018_aa_notes.sql tests/aa-notes-migration.test.mjs
git commit -m "feat: migration 0018 (note card kinds, source_key, updated_at)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Edge Function `aa` shape

**Files:**
- Modify: `supabase/functions/sync-completion/index.ts`
- Create: `tests/aa-edge-validate.test.mjs`

**Interfaces:**
- Consumes: `aa_items` columns from Task 1.
- Produces: request `{ aa: { kind, animal_id, location, sent_by, payload } }` → `200 {"ok":true,"updated":boolean}` or `400 {"error":"<plain-English reason>"}`. `payload` for notes: `{ text: string, docx_b64?: string }`. Validation lives between the markers `// aa-validate-start` and `// aa-validate-end` as **plain JavaScript (no TypeScript annotations)** so the test can run it.

The deployed function is a single file pasted/deployed as one unit, so the validation block stays inside `index.ts`.

- [ ] **Step 1: Write the failing test** (`tests/aa-edge-validate.test.mjs`)

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const src = fs.readFileSync(path.resolve(import.meta.dirname, '../supabase/functions/sync-completion/index.ts'), 'utf8');
const block = src.split('// aa-validate-start')[1].split('// aa-validate-end')[0];
const { validateAaShare, aaSourceKey } = new Function(block + '\nreturn { validateAaShare, aaSourceKey };')();

const ok = (over = {}) => ({ kind: 'processing_note', animal_id: 't-100', location: 'Pound 1', sent_by: 'ab', payload: { text: 'Exam normal.' }, ...over });

test('a good processing note is accepted and normalised', () => {
  const r = validateAaShare(ok());
  assert.deepEqual(r.row, { kind: 'processing_note', animal_ids: ['T-100'], payload: { text: 'Exam normal.', location: 'Pound 1' }, sent_by: 'AB' });
});
test('docx_b64 is kept when it is base64', () => {
  assert.equal(validateAaShare(ok({ payload: { text: 'x', docx_b64: 'UEsDBBQ=' } })).row.payload.docx_b64, 'UEsDBBQ=');
});
test('refuses unknown kind, missing animal ID, missing text', () => {
  assert.match(validateAaShare(ok({ kind: 'fiv' })).error, /kind/i);
  assert.match(validateAaShare(ok({ animal_id: '  ' })).error, /animal/i);
  assert.match(validateAaShare(ok({ payload: { text: '   ' } })).error, /text/i);
  assert.match(validateAaShare(ok({ payload: null })).error, /payload|text/i);
  assert.match(validateAaShare(null).error, /request/i);
});
test('refuses oversize text, oversize or non-base64 docx', () => {
  assert.match(validateAaShare(ok({ payload: { text: 'x'.repeat(20001) } })).error, /too long/i);
  assert.match(validateAaShare(ok({ payload: { text: 'x', docx_b64: 'A'.repeat(1200001) } })).error, /too large/i);
  assert.match(validateAaShare(ok({ payload: { text: 'x', docx_b64: '<script>alert(1)</script>' } })).error, /base64/i);
});
test('med_chart needs lines instead of text', () => {
  const r = validateAaShare({ kind: 'med_chart', animal_id: 'T-100', sent_by: 'AB', payload: { lines: ['Drug A 1 tablet BID x 5 days'] } });
  assert.deepEqual(r.row.payload.lines, ['Drug A 1 tablet BID x 5 days']);
  assert.match(validateAaShare({ kind: 'med_chart', animal_id: 'T-100', payload: { lines: [] } }).error, /lines/i);
});
test('sent_by is trimmed, upper-cased and limited to 4 characters; hostile text is kept as plain data', () => {
  assert.equal(validateAaShare(ok({ sent_by: ' abcdef ' })).row.sent_by, 'ABCD');
  assert.equal(validateAaShare(ok({ payload: { text: '<script>alert(1)</script>' } })).row.payload.text, '<script>alert(1)</script>');
});
test('aaSourceKey is kind|date|ANIMAL', () => {
  assert.equal(aaSourceKey('processing_note', '2026-10-18', 'T-100'), 'processing_note|2026-10-18|T-100');
});
```

- [ ] **Step 2: Run, expect FAIL** (`Cannot read properties of undefined (reading 'split')`): `node --test tests/aa-edge-validate.test.mjs`

- [ ] **Step 3: Implement in `index.ts`**

Insert this block just above `Deno.serve(async (req) => {`:

```ts
// aa-validate-start
// Admission AA (Phase 2): a vet's shift tool sends a finished note / medication chart. Plain JavaScript on purpose
// (no type annotations) so tests/aa-edge-validate.test.mjs can run exactly this block.
const AA_NOTE_KINDS = ['processing_note', 'si_note', 'med_chart'];
function aaSourceKey(kind, dateISO, animalId) { return kind + '|' + dateISO + '|' + animalId; }
function validateAaShare(a) {
  if (!a || typeof a !== 'object') return { error: 'Bad request.' };
  if (AA_NOTE_KINDS.indexOf(a.kind) === -1) return { error: 'Unknown kind.' };
  const id = typeof a.animal_id === 'string' ? a.animal_id.trim().toUpperCase() : '';
  if (!id || id.length > 40) return { error: 'An animal ID (up to 40 characters) is required.' };
  const sentBy = typeof a.sent_by === 'string' ? a.sent_by.trim().toUpperCase().slice(0, 4) : '';
  const p = a.payload && typeof a.payload === 'object' ? a.payload : null;
  if (!p) return { error: 'Missing payload / text.' };
  let payload;
  if (a.kind === 'med_chart') {
    const lines = Array.isArray(p.lines) ? p.lines.filter((l) => typeof l === 'string' && l.trim()).map((l) => l.trim().slice(0, 500)).slice(0, 20) : [];
    if (!lines.length) return { error: 'A medication chart needs at least one line.' };
    payload = { lines: lines };
  } else {
    const text = typeof p.text === 'string' ? p.text.trim() : '';
    if (!text) return { error: 'The note text is empty.' };
    if (text.length > 20000) return { error: 'The note is too long (limit 20,000 characters).' };
    payload = { text: text };
    if (p.docx_b64 != null && p.docx_b64 !== '') {
      if (typeof p.docx_b64 !== 'string' || p.docx_b64.length > 1200000) return { error: 'The Word file is too large to send.' };
      if (!/^[A-Za-z0-9+\/=]+$/.test(p.docx_b64)) return { error: 'The Word file is not valid base64.' };
      payload.docx_b64 = p.docx_b64;
    }
  }
  const location = typeof a.location === 'string' ? a.location.trim().slice(0, 80) : '';
  if (location) payload.location = location;
  return { row: { kind: a.kind, animal_ids: [id], payload: payload, sent_by: sentBy } };
}
// aa-validate-end

```

Insert this branch inside the handler, directly after `const supabase = createClient(PROJECT_URL, SERVICE_KEY);` (before the `body.delete` branch):

```ts
  // Shape 7 (2026-10-18): { aa: { kind, animal_id, location, sent_by, payload } } — a vet's shift tool shares a
  // finished note with the Admission AA page. One live card per kind + Melbourne day + animal: a resend UPDATES it.
  // Replies {ok:true} only once the row is saved — the tool treats anything else as NOT SENT.
  if (body.aa && typeof body.aa === 'object') {
    const v = validateAaShare(body.aa);
    if (v.error) return new Response(JSON.stringify({ error: v.error }), { status: 400, headers: CORS_HEADERS });
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne' }).format(new Date());
    const key = aaSourceKey(v.row.kind, day, v.row.animal_ids[0]);
    const { data: found, error: fe } = await supabase.from('aa_items').select('id').eq('source_key', key).limit(1);
    if (fe) return new Response(JSON.stringify({ error: fe.message }), { status: 500, headers: CORS_HEADERS });
    if (found && found.length) {
      const { error } = await supabase.from('aa_items')
        .update({ payload: v.row.payload, sent_by: v.row.sent_by, updated_at: new Date().toISOString() }).eq('id', found[0].id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS_HEADERS });
      return new Response(JSON.stringify({ ok: true, updated: true }), { status: 200, headers: CORS_HEADERS });
    }
    const { error } = await supabase.from('aa_items').insert(Object.assign({}, v.row, { source_key: key }));
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS_HEADERS });
    return new Response(JSON.stringify({ ok: true, updated: false }), { status: 200, headers: CORS_HEADERS });
  }

```

Also add to the header comment list: `//   7. { aa: {kind, animal_id, location, sent_by, payload} } — (2026-10-18) share a finished note with the Admission AA page.`

- [ ] **Step 4: Run, expect PASS** (7 tests): `node --test tests/aa-edge-validate.test.mjs`

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/sync-completion/index.ts tests/aa-edge-validate.test.mjs
git commit -m "feat: sync-completion accepts aa note shares (validated, confirmed, updates in place)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Logic for note cards

**Files:**
- Modify: `lib/ldh-logic.js` (`AA_KINDS`, `aaSummary`, new `aaChangeKey`, export it)
- Test: `tests/logic.test.mjs`

**Interfaces:**
- Produces: `AA_KINDS.processing_note = 'Processing notes'`, `si_note = 'Sick & injured notes'`, `med_chart = 'Medication chart'`; `aaSummary` for those; `aaChangeKey(item) -> string` = `item.id + '|' + (item.updated_at || '')`, so the page can tell "new" from "updated".

- [ ] **Step 1: Failing tests** (append to `tests/logic.test.mjs`)

```js
test('AA_KINDS and aaSummary cover the note and chart cards', () => {
  assert.equal(L.AA_KINDS.processing_note, 'Processing notes');
  assert.equal(L.AA_KINDS.si_note, 'Sick & injured notes');
  assert.equal(L.AA_KINDS.med_chart, 'Medication chart');
  assert.equal(L.aaSummary({ kind: 'processing_note', animal_ids: ['T-100'], payload: { text: 'Line one\nLine two' } }), 'Notes to enter in ShelterMate (2 lines)');
  assert.equal(L.aaSummary({ kind: 'si_note', animal_ids: ['T-100'], payload: { text: 'One line' } }), 'Notes to enter in ShelterMate (1 line)');
  assert.equal(L.aaSummary({ kind: 'med_chart', animal_ids: ['T-100'], payload: { lines: ['a', 'b'] } }), 'Medication chart (2 medications)');
  assert.equal(L.aaSummary({ kind: 'processing_note', animal_ids: ['T-100'], payload: null }), 'Notes to enter in ShelterMate (0 lines)');
});
test('aaChangeKey changes when a card is updated', () => {
  assert.notEqual(L.aaChangeKey({ id: 'a', updated_at: null }), L.aaChangeKey({ id: 'a', updated_at: '2026-10-18T01:00:00Z' }));
  assert.equal(L.aaChangeKey({ id: 'a' }), L.aaChangeKey({ id: 'a', updated_at: null }));
});
```

- [ ] **Step 2: Run, expect FAIL**: `node --test tests/logic.test.mjs` (new tests fail: `aaChangeKey is not a function`).

- [ ] **Step 3: Implement.** In `lib/ldh-logic.js`: add the three entries to `AA_KINDS`; in `aaSummary` add before `default`:

```js
      case 'processing_note':
      case 'si_note': {
        const lines = String(p.text || '').split('\n').filter(l => l.trim()).length;
        return `Notes to enter in ShelterMate (${lines} line${lines === 1 ? '' : 's'})`;
      }
      case 'med_chart': {
        const m = (p.lines || []).length;
        return `Medication chart (${m} medication${m === 1 ? '' : 's'})`;
      }
```

and add, next to `aaSortItems`:

```js
  function aaChangeKey(item) { return item.id + '|' + (item.updated_at || ''); }
```

then add `aaChangeKey` to the final `return { … }`.

- [ ] **Step 4: Run, expect PASS**; **Step 5: Commit** `git add lib/ldh-logic.js tests/logic.test.mjs && git commit -m "feat: AA summaries for note and chart cards" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"`

---

### Task 4: Note cards on the AA page

**Files:**
- Modify: `admission-aa.html`
- Create: `tests/ui/admission-aa-notes.test.js`

**Interfaces:**
- Consumes: `LDHLogic.aaChangeKey`, `aaSummary`, kinds from Task 3; `payload.text`, `payload.docx_b64`, `payload.lines`, `payload.location`, `updated_at`.
- Produces (DOM): inside `.aa-card[data-id]`: `.aa-view` button toggling a `<pre class="aa-notes">`, `.aa-copy`, `.aa-docx` (only if `docx_b64`), `.aa-updated` text.

- [ ] **Step 1: Write the failing test** (`tests/ui/admission-aa-notes.test.js`)

```js
// Admission AA page: note cards (view, copy, Word download), "updated" marker, alert on update.
const { open } = require('./harness');
const t = require('./check')('admission-aa-notes');
const H = 3600 * 1000;
const ago = ms => new Date(Date.now() - ms).toISOString();
const DOCX = Buffer.from('PK-fake-docx-bytes').toString('base64');

(async () => {
  const seed = { aa_items: [
    { id: 'n1', kind: 'processing_note', animal_ids: ['T-100'], sent_by: 'AB', sent_at: ago(2 * H), payload: { text: 'Exam normal.\nWeight 12 kg.', docx_b64: DOCX, location: 'Pound 1' } },
    { id: 'n2', kind: 'processing_note', animal_ids: ['T-200'], sent_by: 'AB', sent_at: ago(3 * H), updated_at: ago(10 * 60 * 1000), payload: { text: '<img src=x onerror=window.__pwned=1>' } },
    { id: 'm1', kind: 'med_chart', animal_ids: ['T-300'], sent_by: 'CD', sent_at: ago(1 * H), payload: { lines: ['Drug A 1 tablet BID x 5 days', 'Drug B 0.5 mL SID x 3 days'] } }
  ] };
  const a = await open(seed, 'admission-aa.html');
  try {
    const n1 = await a.page.textContent('.aa-card[data-id="n1"]');
    t.ok(/T-100/.test(n1) && /Processing notes/.test(n1) && /Pound 1/.test(n1), 'note card shows ID, type and location');
    t.ok(await a.page.isHidden('.aa-card[data-id="n1"] .aa-notes'), 'notes are collapsed until View is pressed');
    await a.page.click('.aa-card[data-id="n1"] .aa-view');
    t.ok(/Exam normal\.\s*Weight 12 kg\./.test(await a.page.textContent('.aa-card[data-id="n1"] .aa-notes')), 'View shows the note text');
    t.ok(await a.page.locator('.aa-card[data-id="n2"] .aa-docx').count() === 0, 'no Download Word button when the tool sent no Word file');

    const dl = a.page.waitForEvent('download');
    await a.page.click('.aa-card[data-id="n1"] .aa-docx');
    const d = await dl;
    t.ok(d.suggestedFilename() === 'T-100_notes.docx', 'download is named after the animal: ' + d.suggestedFilename());
    const bytes = require('fs').readFileSync(await d.path());
    t.ok(bytes.toString() === 'PK-fake-docx-bytes', 'downloaded bytes are the decoded Word file');

    await a.page.evaluate(() => { navigator.clipboard.writeText = async (s) => { window.__copied = s; }; });
    await a.page.click('.aa-card[data-id="n1"] .aa-copy');
    t.ok(await a.page.evaluate(() => window.__copied) === 'Exam normal.\nWeight 12 kg.', 'Copy puts the exact note text on the clipboard');

    t.ok(/updated/i.test(await a.page.textContent('.aa-card[data-id="n2"]')), 'an updated card says so');
    t.ok(!/updated/i.test(n1), 'a never-updated card does not');
    await a.page.click('.aa-card[data-id="n2"] .aa-view');
    t.ok(await a.page.evaluate(() => window.__pwned === undefined), 'hostile note text is shown as text, not executed');
    const m1 = await a.page.textContent('.aa-card[data-id="m1"]');
    t.ok(/Drug A 1 tablet BID x 5 days/.test(m1) && /Drug B 0.5 mL SID x 3 days/.test(m1), 'medication chart lines are listed on the card');

    // An update to a card already on screen raises the banner (it needs entering again).
    t.ok(await a.page.isHidden('#new-item-banner'), 'no banner for what was already there on load');
    await a.page.evaluate(() => sb.from('aa_items').update({ updated_at: new Date().toISOString(), payload: { text: 'Exam normal.\nWeight 12.5 kg.' } }).eq('id', 'n1'));
    await a.page.waitForSelector('#new-item-banner', { state: 'visible', timeout: 5000 });
    t.ok(/1 new item/.test(await a.page.textContent('#new-item-banner-text')), 'an updated card raises the banner');
    t.ok(a.errors.length === 0, 'no page errors: ' + a.errors.join('; '));
  } finally { await a.browser.close(); }
  t.done();
})();
```

- [ ] **Step 2: Run, expect FAIL**: `NODE_PATH=/Users/jxue/.npm/_npx/e41f203b7505f1fb/node_modules node tests/ui/admission-aa-notes.test.js`

- [ ] **Step 3: Implement in `admission-aa.html`**

Add CSS (in the page's `<style>`): `.aa-notes { white-space: pre-wrap; background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; font: inherit; font-size: 0.85rem; margin: 8px 0 0; display: none; } .aa-notes.open { display: block; } .aa-extra { display:flex; gap:6px; flex-wrap:wrap; margin-top:6px; }`

Replace `cardHtml` with a version that adds, below `.ameta`, only for note/chart kinds:

```js
  function extraHtml(it) {
    const p = it.payload || {};
    if (it.kind === 'processing_note' || it.kind === 'si_note') {
      return `<div class="aa-extra">
          <button type="button" class="secondary aa-view" data-id="${esc(it.id)}">View notes</button>
          <button type="button" class="secondary aa-copy" data-id="${esc(it.id)}">Copy</button>
          ${p.docx_b64 ? `<button type="button" class="secondary aa-docx" data-id="${esc(it.id)}">Download Word</button>` : ''}
        </div><pre class="aa-notes" data-id="${esc(it.id)}">${esc(p.text || '')}</pre>`;
    }
    if (it.kind === 'med_chart') return `<ul class="aa-lines">${(p.lines || []).map(l => `<li>${esc(l)}</li>`).join('')}</ul>`;
    return '';
  }
```

and in `cardHtml` change the left column to:

```js
      <div>
        <div class="aname">${esc(it.animal_ids.join(', '))} <span class="tag-med">${esc(LDHLogic.AA_KINDS[it.kind] || it.kind)}</span></div>
        <div class="ameta">${esc(LDHLogic.aaSummary(it))}${it.payload && it.payload.location ? ' · ' + esc(it.payload.location) : ''} · sent ${esc(new Date(it.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}${it.sent_by ? ' by ' + esc(it.sent_by) : ''}${it.updated_at ? ' · <b class="aa-updated">updated ' + esc(new Date(it.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) + '</b>' : ''}</div>
        ${extraHtml(it)}
      </div>
```

Keep open/closed state across the 60 s re-render and realtime refresh: add `const openNotes = new Set();` and in `render()` after setting `innerHTML`, `openNotes.forEach(id => { const el = document.querySelector('.aa-notes[data-id="' + CSS.escape(id) + '"]'); if (el) el.classList.add('open'); });`.

Add click handling (extend the existing `aa-list` click listener; handle these before the `.aa-done` early return):

```js
    const view = e.target.closest('.aa-view');
    if (view) { const id = view.dataset.id; openNotes.has(id) ? openNotes.delete(id) : openNotes.add(id); render(); return; }
    const copy = e.target.closest('.aa-copy');
    if (copy) { const it = ITEMS.find(x => x.id === copy.dataset.id); if (it) copyText((it.payload || {}).text || ''); return; }
    const dx = e.target.closest('.aa-docx');
    if (dx) { const it = ITEMS.find(x => x.id === dx.dataset.id); if (it) downloadDocx(it); return; }
```

and helpers:

```js
  async function copyText(s) {
    try { await navigator.clipboard.writeText(s); }
    catch (e) { const ta = document.createElement('textarea'); ta.value = s; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e2) { /* nothing more to try */ } ta.remove(); }
  }
  function downloadDocx(it) {
    const bin = atob((it.payload || {}).docx_b64 || '');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
    a.download = (it.animal_ids[0] || 'notes') + '_notes.docx';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
```

Change the new-item detection to also fire on updates: replace `let seen = new Set()` and `checkForNewItems` body so `seen` is a `Set` of `LDHLogic.aaChangeKey(item)` strings:

```js
    const fresh = ITEMS.filter(i => !seen.has(LDHLogic.aaChangeKey(i)));
    ITEMS.forEach(i => seen.add(LDHLogic.aaChangeKey(i)));
```

(the banner wording already says "new item(s) sent through").

- [ ] **Step 4: Run, expect PASS**: the new test, then `admission-aa.test.js`, then the whole UI suite.

- [ ] **Step 5: Commit** `git add admission-aa.html tests/ui/admission-aa-notes.test.js && git commit -m "feat: AA page note and chart cards (view, copy, Word download, updated marker)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"`

### Part A wrap-up
- [ ] Run both full suites (all green). Push `aa-phase2a`, open the PR **without merging** titled "Admission AA phase 2a: dashboard and Edge Function side", noting the rollout order. **Do not deploy the Edge Function from here:** Juliana deploys it (paste `index.ts` into the Supabase function editor, or her usual route) after running 0018.

---

## Part B: ldh-shift-tools (branch `aa-share-processing`, from `main`)

Run once: `cd ~/ldh-shift-tools && git checkout main && git pull && git checkout -b aa-share-processing && mkdir -p tests`

### Task 5: `aa-share.js` helpers

**Files:**
- Create: `aa-share.js`
- Create: `tests/aa-share.test.mjs`

**Interfaces (all on global `AAShare`, also `module.exports` for Node):**
- `sig(text) -> string`: stable short fingerprint of note text.
- `status(animal, noteText) -> 'na'|'noid'|'notsent'|'stale'|'sent'`: `na` = not registered; `noid` = registered, no `animalId`; `notsent` = never confirmed; `stale` = confirmed but the note changed since (`animal.aaSig !== sig(noteText)`); `sent`.
- `summary(animals, noteOf) -> { sent, notsent, stale, noid, unsent }` where `unsent = notsent + stale + noid` (registered animals only).
- `needsSend(animals, noteOf) -> animal[]`: registered, has ID, status `notsent` or `stale`.
- `buildBody({ kind, animal, noteText, docxB64, sentBy }) -> {aa:{…}} | null` (null when no animal ID).
- `send(body, fetcher?) -> Promise<boolean>`: true only for HTTP ok + JSON `{ok:true}`; every failure is `false`, never throws.
- `isOn(tool, storage?) -> boolean`, `setOn(tool, on, storage?)`: key `ldh_aa_share_<tool>` = `'1'`; storage failures read as off.

- [ ] **Step 1: Failing tests** (`tests/aa-share.test.mjs`)

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const A = createRequire(import.meta.url)('../aa-share.js');

const reg = (extra = {}) => Object.assign({ id: 'x1', animalId: 'T-100', location: 'Pound 1', registered: true }, extra);
const noteOf = a => a.note || 'note';

test('sig is stable and changes with the text', () => {
  assert.equal(A.sig('abc'), A.sig('abc'));
  assert.notEqual(A.sig('abc'), A.sig('abd'));
  assert.equal(typeof A.sig(undefined), 'string');
});
test('status: not registered -> na; no ID -> noid; never confirmed -> notsent; edited since -> stale; matching -> sent', () => {
  assert.equal(A.status(reg({ registered: false }), 'note'), 'na');
  assert.equal(A.status(reg({ animalId: '  ' }), 'note'), 'noid');
  assert.equal(A.status(reg(), 'note'), 'notsent');
  assert.equal(A.status(reg({ aaSentAt: '2026-10-18T01:00:00Z', aaSig: A.sig('note') }), 'note'), 'sent');
  assert.equal(A.status(reg({ aaSentAt: '2026-10-18T01:00:00Z', aaSig: A.sig('old note') }), 'note'), 'stale');
});
test('summary counts only registered animals; unsent = notsent + stale + noid', () => {
  const animals = [reg({ id: 'a', aaSentAt: 'x', aaSig: A.sig('note') }), reg({ id: 'b' }), reg({ id: 'c', animalId: '' }),
    reg({ id: 'd', registered: false }), reg({ id: 'e', aaSentAt: 'x', aaSig: 'old' })];
  assert.deepEqual(A.summary(animals, noteOf), { sent: 1, notsent: 1, stale: 1, noid: 1, unsent: 3 });
});
test('needsSend returns only sendable animals (registered, has ID, not sent or stale)', () => {
  const animals = [reg({ id: 'a', aaSentAt: 'x', aaSig: A.sig('note') }), reg({ id: 'b' }), reg({ id: 'c', animalId: '' }), reg({ id: 'e', aaSentAt: 'x', aaSig: 'old' })];
  assert.deepEqual(A.needsSend(animals, noteOf).map(a => a.id), ['b', 'e']);
});
test('buildBody makes the aa request; no ID gives null', () => {
  const b = A.buildBody({ kind: 'processing_note', animal: reg(), noteText: 'Exam normal.', docxB64: 'UEsDBA==', sentBy: 'ab' });
  assert.deepEqual(b, { aa: { kind: 'processing_note', animal_id: 'T-100', location: 'Pound 1', sent_by: 'ab', payload: { text: 'Exam normal.', docx_b64: 'UEsDBA==' } } });
  assert.equal(A.buildBody({ kind: 'processing_note', animal: reg({ animalId: '' }), noteText: 'x' }), null);
  assert.equal('docx_b64' in A.buildBody({ kind: 'processing_note', animal: reg(), noteText: 'x', docxB64: '' }).aa.payload, false);
});
test('send is true only for ok + {ok:true}; every failure is false and never throws', async () => {
  const body = { aa: {} };
  const reply = (ok, json) => async () => ({ ok, json: async () => json });
  assert.equal(await A.send(body, reply(true, { ok: true })), true);
  assert.equal(await A.send(body, reply(true, { ok: false })), false);
  assert.equal(await A.send(body, reply(true, {})), false);
  assert.equal(await A.send(body, reply(false, { ok: true })), false);
  assert.equal(await A.send(body, async () => { throw new Error('offline'); }), false);
  assert.equal(await A.send(body, async () => ({ ok: true, json: async () => { throw new Error('not json'); } })), false);
  assert.equal(await A.send(body, async () => null), false);
});
test('switch is off by default, remembered per tool, and a broken storage reads as off', () => {
  const mem = {}; const storage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; }, removeItem: k => { delete mem[k]; } };
  assert.equal(A.isOn('processing', storage), false);
  A.setOn('processing', true, storage);
  assert.equal(A.isOn('processing', storage), true);
  assert.equal(A.isOn('sick_injured', storage), false);
  A.setOn('processing', false, storage);
  assert.equal(A.isOn('processing', storage), false);
  assert.equal(A.isOn('processing', { getItem() { throw new Error('blocked'); } }), false);
});
```

- [ ] **Step 2: Run, expect FAIL** (`Cannot find module '../aa-share.js'`): `node --test tests/aa-share.test.mjs`

- [ ] **Step 3: Write `aa-share.js`**

```js
/* LDH Shift Tools: share finished notes with the Admission AA page (2026-10-18).
   Shared by the tools (Processing now; Sick & Injured and medication charts later). The page-specific wiring lives
   in each tool; everything here is plain, testable logic. A send only counts as sent when the dashboard's Edge
   Function replies HTTP 200 with {"ok":true} — anything else is "not sent" and the vet is shown a Resend button.
   Nothing is queued in the background. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(globalThis);
  else root.AAShare = factory(root);
})(typeof self !== 'undefined' ? self : this, function (g) {
  var KEY_PREFIX = 'ldh_aa_share_';

  function sig(text) {
    var s = String(text == null ? '' : text), h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return s.length + ':' + h.toString(36);
  }
  function hasId(a) { return !!(a && String(a.animalId == null ? '' : a.animalId).trim()); }
  function status(a, noteText) {
    if (!a || !a.registered) return 'na';
    if (!hasId(a)) return 'noid';
    if (!a.aaSentAt) return 'notsent';
    return a.aaSig === sig(noteText) ? 'sent' : 'stale';
  }
  function summary(animals, noteOf) {
    var s = { sent: 0, notsent: 0, stale: 0, noid: 0, unsent: 0 };
    animals.forEach(function (a) {
      var st = status(a, a && a.registered ? noteOf(a) : '');
      if (st in s) { s[st]++; if (st !== 'sent') s.unsent++; }
    });
    return s;
  }
  function needsSend(animals, noteOf) {
    return animals.filter(function (a) { var st = status(a, a && a.registered ? noteOf(a) : ''); return st === 'notsent' || st === 'stale'; });
  }
  function buildBody(o) {
    if (!hasId(o.animal)) return null;
    var payload = { text: String(o.noteText == null ? '' : o.noteText) };
    if (o.docxB64) payload.docx_b64 = o.docxB64;
    return { aa: { kind: o.kind, animal_id: String(o.animal.animalId).trim(), location: o.animal.location || '', sent_by: o.sentBy || '', payload: payload } };
  }
  function send(body, fetcher) {
    var f = fetcher || function (opts) { return g.LDHSync.fetch(opts); };
    return Promise.resolve().then(function () { return f({ method: 'POST', body: JSON.stringify(body) }); })
      .then(function (res) { if (!res || !res.ok) return false; return res.json().then(function (j) { return !!(j && j.ok === true); }); })
      .catch(function () { return false; });
  }
  function store(storage) { if (storage) return storage; try { return g.localStorage; } catch (e) { return null; } }
  function isOn(tool, storage) {
    try { var s = store(storage); return !!s && s.getItem(KEY_PREFIX + tool) === '1'; } catch (e) { return false; }
  }
  function setOn(tool, on, storage) {
    try { var s = store(storage); if (!s) return; if (on) s.setItem(KEY_PREFIX + tool, '1'); else s.removeItem(KEY_PREFIX + tool); } catch (e) { /* storage blocked: switch stays off */ }
  }
  return { sig: sig, status: status, summary: summary, needsSend: needsSend, buildBody: buildBody, send: send, isOn: isOn, setOn: setOn };
});
```

- [ ] **Step 4: Run, expect PASS** (7 tests): `node --test tests/aa-share.test.mjs`

- [ ] **Step 5: Commit** `git add aa-share.js tests/aa-share.test.mjs && git commit -m "feat: aa-share.js (status, payload, confirmed send, per-tool switch)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"`

---

### Task 6: Processing integration

**Files:**
- Modify: `processing.html`
- Create: `tests/processing-aa.test.js`
- Modify: `README.md`

**Interfaces:**
- Consumes: `AAShare` (Task 5), `LDHSync.fetch`, existing `state.animals`, `saveShift()`, `assembleNote(a)`, `a.noteEdited`, `buildWordFile()`, `renderShiftList()`, `#vetInit`.
- Produces (DOM ids the test uses): `#aaShareCard`, `#aaShareToggle` (checkbox), `#aaShareSummary`, `#aaShareList` with `.aa-resend[data-id]` buttons, `#aaResendAll`, `#aaRedBar`. New animal fields `aaSentAt` (ISO string|null) and `aaSig` (string|null). Functions `aaNoteOf(a)`, `aaSendAnimal(a)`, `aaAfterRegister(a)`, `renderAaShare()`, `aaGuard(action)`.

**Test harness notes (Step 1):** the test seeds `localStorage` before load with `ldhGateOk_v2='1'`, `ldh_sync_code_v1='test'` and the shift list under `ldh_processing_shift_v1` (the gate then opens without network), routes `**/functions/v1/clever-endpoint` to a fake that records bodies and answers `{ok:true}` (or aborts to simulate offline), and aborts every other external request. Animals are seeded with `noteEdited` set so notes do not depend on the exam form. Use `page.on('dialog', d => d.accept())` for `alert`/`confirm`.

- [ ] **Step 1: Write the failing test** (`tests/processing-aa.test.js`)

```js
// Processing tool: share-with-Admission-AA switch, auto-send on register, NOT SENT safety net, guards.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('processing-aa');
const FILE = 'file://' + path.resolve(__dirname, '../processing.html');

const animal = (id, animalId, extra) => Object.assign({
  id, animalId, location: 'Pound 1', species: 'dog', registered: false, noteEdited: 'Note for ' + animalId, weight: '10'
}, extra || {});

async function start(animals, { online = true, shared = false } = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const sent = [];
  let up = online;
  await ctx.route('**/functions/v1/clever-endpoint', async (route) => {
    let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch (e) {}
    if (!up) return route.abort();
    if (body.aa) sent.push(body.aa);
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body.aa ? { ok: true } : {}) });
  });
  await ctx.route(/^https?:\/\/(?!functions)/, (r) => (r.request().url().includes('/functions/v1/clever-endpoint') ? r.fallback() : r.abort()));
  await ctx.addInitScript((seed) => {
    localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test');
    localStorage.setItem('ldh_processing_shift_v1', JSON.stringify(seed.animals));
    localStorage.setItem('ldh_processing_shift_v1_date', new Date().toDateString());
    if (seed.shared) localStorage.setItem('ldh_aa_share_processing', '1');
  }, { animals, shared });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  await page.goto(FILE);
  await page.waitForTimeout(400);
  return { browser, page, sent, errors, dialogs, setOnline: (v) => { up = v; } };
}

(async () => {
  /* 1. Off by default: registering sends nothing and nothing nags. */
  let s = await start([animal('a', 'T-100', { registered: true })]);
  try {
    t.ok(!(await s.page.isChecked('#aaShareToggle')), 'the switch is off by default');
    t.ok(await s.page.isHidden('#aaRedBar'), 'no red bar while the switch is off');
    t.ok(s.sent.length === 0, 'nothing is sent while the switch is off');
  } finally { await s.browser.close(); }

  /* 2. Switch on mid-shift: already-registered animals are sent once each (catch-up), pending ones are not. */
  s = await start([animal('a', 'T-100', { registered: true }), animal('b', 'T-101', { registered: true }), animal('c', 'T-102')]);
  try {
    await s.page.check('#aaShareToggle');
    await s.page.waitForFunction(() => document.querySelector('#aaShareSummary').textContent.includes('2 sent'));
    t.ok(s.sent.length === 2 && s.sent.every(x => x.kind === 'processing_note'), 'catch-up sent the 2 registered animals only: ' + s.sent.map(x => x.animal_id));
    t.ok(s.sent.some(x => x.animal_id === 'T-100' && x.payload.text === 'Note for T-100' && x.payload.docx_b64), 'payload has the note text and a Word file');
    t.ok(await s.page.isHidden('#aaRedBar'), 'no red bar when everything is sent');
    await s.page.check('#aaShareToggle').catch(() => {});
    t.ok(s.sent.length === 2, 'nothing is sent twice');

    /* 3. Registering another animal sends it automatically. */
    await s.page.evaluate(() => { const a = state.animals.find(x => x.id === 'c'); a.registered = true; saveShift(); aaAfterRegister(a); });
    await s.page.waitForFunction(() => document.querySelector('#aaShareSummary').textContent.includes('3 sent'));
    t.ok(s.sent.length === 3 && s.sent[2].animal_id === 'T-102', 'a newly registered animal is sent automatically');

    /* 4. Edited after sending: flagged, then resend updates. */
    await s.page.evaluate(() => { const a = state.animals.find(x => x.id === 'a'); a.noteEdited = 'Edited note'; saveShift(); renderAaShare(); });
    t.ok(/changed since sent/i.test(await s.page.textContent('#aaShareList')), 'an edited note shows as changed since sent');
    t.ok(await s.page.isVisible('#aaRedBar'), 'the red bar appears for a changed note');
    await s.page.click('.aa-resend[data-id="a"]');
    await s.page.waitForFunction(() => document.querySelector('#aaShareSummary').textContent.includes('3 sent'));
    t.ok(s.sent[3].animal_id === 'T-100' && s.sent[3].payload.text === 'Edited note', 'resend carries the edited text');
    t.ok(await s.page.isHidden('#aaRedBar'), 'red bar clears after the resend');

    /* 5. Guards on Clear list; switching off after clear. */
    await s.page.click('#clearListBtn');
    t.ok(await s.page.isChecked('#aaShareToggle') === false, 'Clear list turns the switch off');
    t.ok(s.errors.length === 0, 'no page errors: ' + s.errors.join('; '));
  } finally { await s.browser.close(); }

  /* 6. Offline all shift: NOT SENT, red bar, guards warn, Resend works when signal returns. */
  s = await start([animal('a', 'T-100', { registered: true }), animal('n', '', { registered: true })], { online: false, shared: true });
  try {
    await s.page.waitForFunction(() => document.querySelector('#aaShareSummary').textContent.length > 0);
    t.ok(/not sent/i.test(await s.page.textContent('#aaShareList')), 'an unsent animal is listed as NOT SENT');
    t.ok(/no ID/i.test(await s.page.textContent('#aaShareList')), 'a registered animal with no ID is listed as "no ID, can\'t send"');
    t.ok(await s.page.isVisible('#aaRedBar') && /not sent/i.test(await s.page.textContent('#aaRedBar')), 'the red bar names the problem');
    t.ok(s.sent.length === 0, 'nothing reached the dashboard while offline');
    s.dialogs.length = 0;
    await s.page.evaluate(() => { document.querySelector('#exportWordBtn').click(); });
    await s.page.waitForTimeout(300);
    t.ok(s.dialogs.some(d => /NOT been sent to the Admission AA/i.test(d)), 'exporting while unsent asks first: ' + s.dialogs.join(' | ').slice(0, 120));
    s.setOnline(true);
    await s.page.click('#aaResendAll');
    await s.page.waitForFunction(() => document.querySelector('#aaShareSummary').textContent.includes('1 sent'));
    t.ok(s.sent.length === 1 && s.sent[0].animal_id === 'T-100', 'Resend all sends what it can once signal returns');
    t.ok(await s.page.isVisible('#aaRedBar'), 'the no-ID animal keeps the red bar up until it has an ID');
  } finally { await s.browser.close(); }
  t.done();
})();
```

Also create `tests/check.js` as a copy of `~/ldh-shift-ops/tests/ui/check.js` (the small PASS/FAIL helper, 8 lines).

- [ ] **Step 2: Run, expect FAIL**: `NODE_PATH=/Users/jxue/.npm/_npx/e41f203b7505f1fb/node_modules node tests/processing-aa.test.js` → FAIL (`#aaShareToggle` not found).

- [ ] **Step 3: Implement in `processing.html`** (use one Python script for the string replacements; assert each target occurs exactly once)

(a) Load the helper: next to `<script src="medchart.js"></script>` (line ~406) add `<script src="aa-share.js"></script>` **before** it.

(b) Version: `const APP_VERSION = '2026-10-13.3';` → `'2026-10-18.1'`.

(c) `normalizeAnimal`: before `return a;` add
`if(a.aaSentAt == null) a.aaSentAt = null; if(a.aaSig == null) a.aaSig = null;`

(d) HTML: insert immediately before `<div class="card" id="shiftListCard">`:

```html
  <div class="card" id="aaShareCard">
    <label style="display:flex;gap:10px;align-items:center;font-weight:600;cursor:pointer">
      <input type="checkbox" id="aaShareToggle" style="width:20px;height:20px">
      Share this shift with Admission AA
    </label>
    <p style="font-size:12px;color:var(--ink-soft);margin:6px 0 0;line-height:1.5">While this is on, each animal you register is sent to the Admission AA as a task to enter in ShelterMate. Finish the notes <b>before</b> you register. Off = nothing is sent.</p>
    <p id="aaShareSummary" style="font-size:13px;margin:8px 0 0"></p>
    <div id="aaShareList"></div>
    <div class="row-actions hidden" id="aaResendRow"><button class="btn small" id="aaResendAll">Resend all</button></div>
  </div>
```

and, just inside `<body>` content area (after the gate, top of the page wrapper — place right before the first `<div class="wrap`), the bar:
`<div id="aaRedBar" class="hidden" style="position:sticky;top:0;z-index:50;background:#b3261e;color:#fff;padding:10px 14px;font-size:14px;font-weight:600"></div>`
(`.hidden` is the file's existing hide class; confirm with `grep -n "^\.hidden" processing.html`, and if it is not a bare `.hidden{display:none}` rule add `#aaRedBar.hidden{display:none}`).

(e) Script, placed right after `syncListToDashboard` (the sync helpers, ~line 455):

```js
/* ---------- share with Admission AA (2026-10-18) ---------- */
const AA_TOOL = 'processing';
const aaNoteOf = a => (a.noteEdited !== null && a.noteEdited !== undefined) ? a.noteEdited : assembleNote(a);
const aaSending = new Set();
function aaFileToB64(file){
  return new Promise((res, rej)=>{ const r = new FileReader(); r.onload = ()=>res(String(r.result).split(',')[1] || ''); r.onerror = ()=>rej(r.error); r.readAsDataURL(file); });
}
async function aaSendAnimal(a){
  if(aaSending.has(a.id)) return;
  aaSending.add(a.id);
  try{
    const noteText = aaNoteOf(a);
    let docxB64 = '';
    try{ const f = await buildWordFile({only:[a]}); if(f) docxB64 = await aaFileToB64(f); }catch(e){ docxB64 = ''; }
    const body = AAShare.buildBody({kind:'processing_note', animal:a, noteText, docxB64, sentBy:(document.getElementById('vetInit')||{}).value || ''});
    if(!body) return;
    if(await AAShare.send(body)){ a.aaSentAt = new Date().toISOString(); a.aaSig = AAShare.sig(noteText); saveShift(); }
  } finally { aaSending.delete(a.id); renderAaShare(); }
}
function aaAfterRegister(a){ if(AAShare.isOn(AA_TOOL) && a && a.registered) aaSendAnimal(a); }
function aaSendPending(){ AAShare.needsSend(state.animals, aaNoteOf).forEach(aaSendAnimal); }
function renderAaShare(){
  const on = AAShare.isOn(AA_TOOL);
  const toggle = document.getElementById('aaShareToggle');
  if(toggle) toggle.checked = on;
  const bar = document.getElementById('aaRedBar'), list = document.getElementById('aaShareList');
  const sum = document.getElementById('aaShareSummary'), row = document.getElementById('aaResendRow');
  if(!on){ bar.classList.add('hidden'); list.innerHTML = ''; sum.textContent = ''; row.classList.add('hidden'); return; }
  const s = AAShare.summary(state.animals, aaNoteOf);
  sum.textContent = `${s.sent} sent` + (s.unsent ? ` · ${s.unsent} not sent` : '');
  const rows = state.animals.filter(a=>AAShare.status(a, a.registered ? aaNoteOf(a) : '') !== 'sent' && AAShare.status(a, a.registered ? aaNoteOf(a) : '') !== 'na').map(a=>{
    const st = AAShare.status(a, aaNoteOf(a));
    const label = st === 'noid' ? "no ID, can't send" : st === 'stale' ? 'changed since sent' : 'NOT SENT';
    const busy = aaSending.has(a.id);
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 0;border-top:1px solid var(--line)">
      <span><b>${esc(a.animalId || '(no ID)')}</b> — ${esc(label)}</span>
      ${st === 'noid' ? '' : `<button class="btn small aa-resend" data-id="${esc(a.id)}"${busy ? ' disabled' : ''}>${busy ? 'Sending…' : 'Resend'}</button>`}
    </div>`;
  }).join('');
  list.innerHTML = rows;
  row.classList.toggle('hidden', !AAShare.needsSend(state.animals, aaNoteOf).length);
  if(s.unsent){ bar.textContent = `${s.unsent} item${s.unsent>1?'s':''} not sent to the Admission AA — open Shift List to resend.`; bar.classList.remove('hidden'); }
  else bar.classList.add('hidden');
}
function aaGuard(action){
  if(!AAShare.isOn(AA_TOOL)) return true;
  const s = AAShare.summary(state.animals, aaNoteOf);
  if(!s.unsent) return true;
  return confirm(`${s.unsent} animal(s) have NOT been sent to the Admission AA. ${action} anyway?\n\nCancel to go back and press Resend.`);
}
document.getElementById('aaShareToggle').addEventListener('change', (e)=>{
  AAShare.setOn(AA_TOOL, e.target.checked);
  if(e.target.checked) aaSendPending();
  renderAaShare();
});
document.getElementById('aaShareList').addEventListener('click', (e)=>{
  const b = e.target.closest('.aa-resend'); if(!b) return;
  const a = state.animals.find(x=>x.id === b.dataset.id); if(a) aaSendAnimal(a);
});
document.getElementById('aaResendAll').addEventListener('click', aaSendPending);
```

(`esc` and `state` already exist in the file; confirm with `grep -n "^function esc\|^const esc" processing.html`.) Because these helpers reference `state`, `assembleNote` and `buildWordFile` (defined later), they must only be *called* after load: they are, since every use is inside event handlers. Run `renderAaShare()` at the end of `renderShiftList()` (add the call just before its closing `}`).

(f) `buildWordFile`: change `async function buildWordFile(){` to `async function buildWordFile(opts){` and replace

```js
  const toExport = sortedAnimals().filter(a=>a.registered);
  const pending = sortedAnimals().filter(a=>!a.registered && !a.doneElsewhere);
```

with

```js
  const only = opts && opts.only;   // one-animal file for the Admission AA
  const toExport = only ? only : sortedAnimals().filter(a=>a.registered);
  const pending = only ? [] : sortedAnimals().filter(a=>!a.registered && !a.doneElsewhere);
```

(g) Hooks: in the two `markDoneBtn` handlers (lines ~1267 and ~2915) the line `if(a.registered){ alert('Saved to register.'); syncCompletionToDashboard(a, 'processing'); a.dashSynced = true; }` becomes `if(a.registered){ alert('Saved to register.'); syncCompletionToDashboard(a, 'processing'); a.dashSynced = true; aaAfterRegister(a); }` (both occurrences; the `saveShift()` that follows runs first because `aaSendAnimal` is async). In `registerAllBtn`, change the forEach to `pending.forEach(a=>{ a.registered = true; a.dashSynced = true; syncCompletionToDashboard(a, 'processing'); aaAfterRegister(a); });`.

(h) Guards: first line of the `exportWordBtn` handler body (after `async ()=>{`): `if(!aaGuard('Export')) return;`. Same one-line insert at the top of the `exportCsvBtn`, `shareExportBtn`, `clearRegisteredBtn` and `clearListBtn` handlers (find each with `grep -n "getElementById('exportCsvBtn')\|getElementById('shareExportBtn')\|getElementById('clearRegisteredBtn')\|getElementById('clearListBtn')" processing.html`), using the action words `'Export'`, `'Share'`, `'Clear'`, `'Clear'`. In the `clearListBtn` handler, after `state.animals = [];` add `AAShare.setOn(AA_TOOL, false);`.

(i) Register button reminder: where the Mark-done/Register button label is built (search `id="markDoneBtn"`), append `${AAShare.isOn(AA_TOOL) ? '<div style="font-size:11px;color:var(--ink-soft);margin-top:4px">Registering sends these notes to the Admission AA.</div>' : ''}` after the button, in both templates (28-day flow and standard flow).

- [ ] **Step 4: Run, expect PASS**: `NODE_PATH=… node tests/processing-aa.test.js` and `node --test tests/*.test.mjs`. If a click-through step proves flaky because of the gate or `confirmNotDoneElsewhere`, keep the test's direct `aaAfterRegister` call (it exercises the same hook) and record a ledger `Ruling:`. Also open `processing.html` by hand once in a browser to confirm nothing else on the page changed.

- [ ] **Step 5: README + commit.** In `README.md` add a short "Share with Admission AA" section (what the switch does, NOT SENT / Resend, rollout order, tests to run). Then:

```bash
git add aa-share.js processing.html tests README.md
git commit -m "feat: Processing shares registered notes with the Admission AA (switch, status, resend, guards)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Part B wrap-up
- [ ] Both suites green. Push `aa-share-processing`, open the PR **without merging**, titled "Share Processing notes with the Admission AA (phase 2a)", noting it must not be merged until the dashboard PR is merged, migration 0018 has run and the Edge Function is deployed.

---

## Task 7: Hand-off to Juliana (no code)

Give her this exact order, one step at a time, with the SQL on her clipboard when asked:
1. Run `0018_aa_notes.sql` in the Supabase SQL editor.
2. Deploy the updated `sync-completion` Edge Function (paste `supabase/functions/sync-completion/index.ts`, or her usual route). Leave `SYNC_SECRET` alone.
3. Merge the dashboard PR, wait about a minute for GitHub Pages.
4. Merge the shift-tools PR.
5. Fictional-animal trial: Processing tool → add 2 fake animals → switch on → register one → check the AA page card (View, Copy, Download Word) → edit the note and resend → card says "updated" → turn off Wi-Fi, register another → NOT SENT + red bar → back online, Resend.
6. IT sign-off before any real patient notes go through.
