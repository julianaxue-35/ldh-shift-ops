# For IT: "Send to Behaviour" (Phase B) — what is stored, where, and when it is deleted

A vet can press **Send to Behaviour** on an animal in the Processing, Sick & Injured or Surgery shift tools. This sends:

- the animal ID, its location, a reason, a time frame and the vet's initials, and
- the **whole current clinical note** for that animal (plain text, up to 20,000 characters). No microchip numbers are sent as separate data; whatever the vet wrote in the note is sent as written.

**Where it goes:** the existing Edge Function (`sync-completion`, new request shape `behaviour`), protected by the same shared code check as the Admission AA sends, into one new column, `behaviour_tasks.attached_note`, in the existing Supabase project. Only the signed-in dashboard (passcode) can read it; the offline-tool service account (`sync_writer`) cannot.

**Who sees it:** the Behaviour page (read-only). The Shelter board's own query never asks for the column, **but** the Shelter board listens for live updates on the same table, and Supabase's live-update message carries the whole changed row, so an open Shelter board screen receives the note in that message (visible in browser developer tools; it is never displayed). It is the same dashboard login, so nobody gains access they did not already have. If IT does not accept this, the note can be moved to its own table that is not in the live-update publication.

**Microchip numbers:** the tools remove any "Microchip: …" line and any 15-digit number from the note before sending. A resend by a different vet on the same day replaces the note and records who re-sent it in the card's history.

**When it is deleted (enforced by the database, not the web page):**
1. the moment the Behaviour team ticks **Done** (a before-update trigger sets the column to null, whatever sent the update);
2. otherwise within **7 days**: the cleanup runs whenever anyone adds or changes a behaviour task, so on a completely quiet stretch an old note can remain until the next activity.
The team's Done comment is kept for 7 days and also shown on the Shelter board for 24 hours.

**Not logged:** the Edge Function never logs the note text and never echoes it in an error message.

**Until sign-off:** use fictional animals only (IDs like "BEH-1"). Do not send real notes until IT has approved this. The feature is a button per animal: nothing is sent unless a vet presses it.

**Migration:** `supabase/migrations/0029_behaviour_attached_note.sql` (adds two columns, a unique index and two triggers; safe to run more than once).
