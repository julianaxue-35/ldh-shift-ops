# Register in Sick & Injured closes the animal's request

**Why:** a vet picked up a case, registered it in S&I without sending to the Admission AA, and the board still showed it claimed.
Since migration 0044 the plain completion only closes the 'list' row, never the request row.

**Rules (approved by the lead vet, 2026-11-28)**
- Register in S&I closes that animal's open request(s), matched on animal ID (last 7 days).
- Picked-up cases close; unclaimed requests close too (as sending to the AA does).
- An unclaimed follow-up (followup > 0) stays open. So does anything raised after the Register press.
- Medication cases move to "Waiting on medication" (same as Done on the board).
- Offline: retried later. Undoing a registration does not reopen the request.
- Processing and Surgery are unchanged.

**Approaches**
1. Register closes the request (chosen): nothing extra to remember.
2. Separate "Mark done on board" button: more control, one more step to forget.

**Left to the builder:** the tool records when Register was pressed and sends it; the Edge Function closes only requests
created at or before that time. No database migration.
