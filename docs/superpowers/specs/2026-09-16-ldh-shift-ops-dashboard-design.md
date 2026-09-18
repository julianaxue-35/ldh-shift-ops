# LDH Shift Ops Dashboard — Design

**Date:** 2026-09-16
**Status:** Draft, pending Juliana's review, then LDH IT security review before any real (non-fictional) data is entered.

## Background

This is a redesign of the "LDH Shift Ops dashboard" — originally prototyped as a
single self-contained HTML file published via Claude's artifact hosting, using
a Claude-specific live-database capability for real-time sync between viewers.
That sync mechanism only exists inside Claude.ai's artifact runtime, so a
standalone version needs a real backend to reproduce "everyone sees updates
live" behaviour.

The dashboard is meant to replace three separate offline note-writing tools
(`processing.html`, `sick-injured.html`, `surgery.html` — see
`~/ldh-shift-tools`) with a shared live task board for shift coordination.

**The core constraint driving this design:** some animals tracked through the
dashboard are council-seized. Their medical records must never be readable by
the public. Animals are already identified by kennel/animal number rather than
name, so there is no "identity" field to protect — the sensitive content is
medical history/notes, not who the animal is.

## Scope decision: separate from ShelterNexus

LDH already has `~/shelter-platform` (ShelterNexus) — a multi-tenant SaaS
(Next.js + Supabase, with RLS and an invitations/grants system) intended for
multiple AU shelters. This dashboard stays a **separate, LDH-only app**,
decoupled from that platform — no shared tenancy, code, or database. This
keeps the mental model simple (no multi-tenant complexity) at the cost of not
reusing ShelterNexus's existing auth work.

## Deliverable

Two things, not one:

1. **This spec**, for LDH IT to review/build from or sign off on before real
   data goes near it.
2. **A working prototype**, built by Claude Code, using **fictional/placeholder
   data only** — mirroring how the original Claude-artifact version was
   scoped. No real animal numbers or real medical notes go into it before IT
   review is complete.

## Architecture

A dedicated Supabase project — its own URL, its own Postgres database, not
shared with `shelter-platform`. Frontend is a single lightweight HTML/JS page
(no build step, no external font/asset dependencies — matching the style of
the existing `ldh-shift-tools` and `ldh-tools` family), using the Supabase JS
client for both data access and realtime sync.

**Why Supabase over a hand-rolled backend:** it gives real websocket-based
live sync (true push, not polling — reproducing the "live, shared across
everyone" feel of the original) and lets the access-control rule be enforced
at the database layer via Row-Level Security, rather than in application code
that could have a bug. LDH also already has working RLS patterns from
`shelter-platform` to draw on. Free tier easily covers a shelter task board's
traffic.

## Access control — the actual protection mechanism

**The rule:** public gets nothing; any authenticated LDH staff member gets
everything. There is no per-role data restriction (attendants and vets/nurses
see the same data — the existing role dropdown only changes which *actions*
are offered, e.g. only attendants can submit new requests, only vets/nurses
can pick up/complete tasks and post memos).

**Enforcement:**

- One shared Supabase Auth account (email + password) for LDH staff. The page
  ships with no data until a valid session exists — the login screen appears
  first, and nothing is fetched before authentication succeeds.
- Row-Level Security policies on every table (`tasks`, `memos`, `roster`)
  require `auth.role() = 'authenticated'`. An anonymous/public request
  returns **zero rows**, enforced by Postgres itself — not by frontend JS
  choosing not to render data that's already sitting in a public response.
  This is the critical difference from the current `ldh-tools`/
  `ldh-shift-tools` pattern, where the "gate" is a client-side passcode check
  on a public GitHub Pages URL (their own READMEs already flag this as "not
  real security").
- The Supabase anon key is safe to expose in frontend JS by design — it only
  grants the *ability to ask*; RLS is what actually decides what comes back.
- This was verified conceptually, not just via the UI: testing must include
  an anonymous query directly against the live Supabase project (no session)
  confirming it returns zero rows, independent of what the frontend renders.

**Frontend hosting:** can still be public GitHub Pages. The page itself is an
empty shell with no embedded data — safe to serve publicly, since it fetches
nothing until authenticated.

## Data model

- **`tasks`**: title, location, shift, type (check/recheck, medication,
  other), origin (scheduled vs. add-on), urgency (routine/soon/urgent), done
  (bool), completed_by_role, completed_at, note (short, non-clinical — see
  below)
- **`memos`**: author (role-level, e.g. "Vet team"), text, created_at
- **`roster`**: shift, staff_name, date — named individuals per shift (this is
  about staffing, not login identity, so real names here are fine)

No `sensitive`/flag field on animals or tasks — unnecessary, since animals are
already tracked by number rather than name, and the public/staff boundary
applies uniformly to all records via RLS.

## The online/offline split (the key privacy design choice)

Rather than relying solely on RLS to protect clinical content, the design
keeps clinical content **out of the cloud database entirely**:

- **Lives in the cloud (Supabase, live-synced to every viewer):** task title,
  location, shift, type, urgency, origin, done/not-done, who claimed it,
  timestamps. Purely operational/coordination data — an animal number plus a
  task category plus a status flag. Not medically sensitive even if somehow
  exposed.
- **Stays offline (in the existing `processing.html` / `sick-injured.html` /
  `surgery.html` tools, localStorage only):** the actual clinical detail —
  exam findings, treatment given, medical history — never leaves these
  tools. The substance of what happened is written here, exactly as it is
  today. (As of the 2026-09-18 amendment below, these tools do gain one
  narrow outbound write — a completion signal carrying only animal ID,
  location, and shift — but that's operational metadata, not clinical
  content, and it's the same category of data the cloud side already holds.)
- **The "Recently completed" panel** on the live board shows status plus a
  short free-text note (e.g. "needs recheck tomorrow", "moved to Cat Room
  2") — intended for coordination only, **not** clinical detail. This is a
  staff-discipline boundary, not a technical one: RLS still keeps the field
  itself away from the public, but nothing stops a staff member from typing
  clinical content into it. Worth a one-line reminder in the UI placeholder
  text (e.g. "coordination note only — clinical detail goes in [offline
  tool]") to reduce the chance of that happening.

**Progress/documentation tracking:** the live board's shift-progress charts
(done vs. remaining, percent complete, urgency breakdown) are driven by the
`done` flag and work as in the original spec. But "done" only means the
physical task was handled — it does not confirm the vet wrote up the medical
record in the offline tool; those are two separate acts. The animal ID, which
exists on both sides, is the cross-reference: a supervisor can check the live
board's "done" list for a shift against that day's offline-tool export by
animal ID to confirm documentation exists. This is a manual periodic check,
not an automated one — deliberately kept simple rather than adding a
self-attested "documented" flag, since that would add schema complexity for a
guarantee that's still just self-reported either way.

## Roles

Self-selected dropdown, unchanged from the original spec:

- **Animal Attendant:** can log new task requests only. Cannot pick up/
  complete tasks, cannot post to the memo board.
- **Vet/Nurse:** can pick up and complete tasks, post to the memo board.
  Cannot submit new requests (attendant-only, to prevent an unfiltered flood).

This is a *workflow* role (which buttons are shown), separate from the
*security* boundary (logged in or not) — it does not gate data.

## Shifts, locations, shift-progress visuals

Unchanged from the original spec:

- Three shifts — Processing, Sick & Injured, Surgery — each with a different
  chart type tied to its shift colour: Processing (paired bar, Done vs.
  Remaining), Sick & Injured (donut, percent complete), Surgery (horizontal
  bars, remaining tasks by urgency).
- Locations for physical routing: Cat Room 1-3, Adoption 1-2, FIR Room, Pound
  1-4, Transport. Open queue groups by location, urgent-first within each
  group.

## Error handling / edge cases

- No session or expired session → login screen; no data is ever fetched, not
  fetched-then-hidden.
- Realtime disconnect (e.g. wifi drop mid-shift) → falls back to fetch-on-
  reconnect, with a small "reconnecting…" indicator, so no one is stuck on
  stale state.
- Concurrent edits (two staff mark the same task done) → last-write-wins.
  Matches the original spec's simplicity; no conflict resolution needed for
  this workflow.

## Testing

Fictional/placeholder data only, matching the original artifact prototype.
Testing explicitly includes a direct anonymous query against the live
Supabase project confirming RLS returns zero rows — not just that the
frontend UI doesn't render data, since a UI-only check wouldn't catch a
misconfigured policy.

## Rollout checklist (before any real, non-fictional data)

1. LDH IT/security review of the Supabase project config, RLS policies, and
   the shared-password approach.
2. Decide password rotation/storage practice: who holds it, how it's shared
   with new staff, how it's changed if someone leaves.
3. Confirm frontend hosting (public GitHub Pages is fine — the page is an
   empty shell without a session).
4. Explicit sign-off before the first real (non-fictional) task is logged.

## Open items carried from the original prototype (unresolved, not blocking this spec)

- Roster is a manually-edited list, not imported from anywhere.
- Design system (light neumorphic soft-UI, amber/green/royal-blue accents
  per shift — Processing green, Sick & Injured amber, Surgery blue) carries
  over from the most recent iteration of the original prototype; system font
  stack only, no external dependencies.

## Amendment (2026-09-18): narrow, one-directional completion sync from the offline tools

Resolves the open item above about whether the dashboard should connect to
`processing.html` / `sick-injured.html` / `surgery.html`. Decided: yes, but
only this much —

- **What crosses the wire:** exactly three fields — animal ID, location,
  shift — plus an implicit `done = true` and `completed_at = now()`. Nothing
  else. No exam findings, no treatment notes, no medical history.
- **When it fires:** only the moment an item is ticked **Completed** inside
  one of the three offline tools. Loading/registering the day's list does
  **not** push anything — there is no "here's today's roster" sync, only a
  "this one's done" sync. This keeps the tools' default state unchanged:
  silent and local unless a completion actually happens.
- **What never crosses the wire:** the Word/Excel exports. They stay exactly
  as they are today — generated locally, never touching Supabase. This isn't
  an export-parsing integration; it's a write triggered directly by the
  "Completed" action in the tool's own UI, at the moment it happens.
- **Matching:** the push is an upsert against the `tasks` table keyed on
  (title = animal ID, location, shift). If a matching open task already
  exists (logged earlier via the dashboard's own "New task request" form),
  it flips to done. If none exists — the common case, since attendants won't
  always have pre-logged everything — a new, already-done task row is
  inserted, so it still shows up in "Cases flagged"/completion history
  without anyone having double-entered it.
- **Why this doesn't break the online/offline privacy split:** the three
  fields sent are the same category of "operational metadata" the dashboard
  already holds in the cloud for manually-logged tasks (see "The
  online/offline split" above) — an animal number, a location, a shift. No
  new sensitive surface is created; the offline tools just gain one narrow,
  outbound-only write path instead of being entirely silent.
- **What this requires of the offline tools (not yet built):** they currently
  have zero network calls. This adds the Supabase project URL + anon key
  (safe to embed, same as the dashboard — RLS is the real gate) plus
  whatever satisfies `auth.role() = 'authenticated'` under the shared-password
  scheme, so the tools can authenticate the same way the dashboard does. The
  write must be best-effort and non-blocking: if there's no connectivity at
  the moment of ticking "Completed" (shelter wifi is not guaranteed), the
  local completion still succeeds and the sync either retries quietly or is
  simply skipped — it must never stop a vet from finishing their local
  record because the dashboard couldn't be reached.
- **Not yet decided:** retry/queueing behaviour on failed sync, and whether a
  failed sync is surfaced to the user at all (leaning toward: no, keep it
  silent, since the offline tool's own record is always the source of truth
  and this is a convenience mirror, not the system of record).
