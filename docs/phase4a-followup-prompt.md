# PHASE 4A FOLLOW-UP: close the gaps in your report (do not start Phase 4B)

Your Phase 4A report shows 136 passing tests, a clean lint, and a good build. But it leaves out things the Phase 4A prompt required, and the dashboard test file covers much less than block L asked for. Fix the items below. Do not edit or weaken an existing test to make anything pass. Do not claim anything works unless you ran it and saw the output.

## 1. Requirement-to-test table (do this first)
Give me a table with one row per bullet in block L of the Phase 4A prompt (every pure-unit and every integration bullet, and each walk-in item on its own row). Columns: requirement | test file and exact test name | "TESTED" or "NOT TESTED". Be honest. A row is TESTED only if a test fails when that behaviour breaks.

## 2. Write the missing tests (real database tests, isolated fixtures, same style as `dashboard.test.ts`)
Write one separate test per line. Start from the NOT TESTED rows. At minimum I expect these:
1. A customer calling the staff status update and the walk-in creation service directly is denied. This must be at service level, not only the policy function.
2. A PENDING, REJECTED or SUSPENDED salon, or a non-VERIFIED or inactive barber, cannot change a status or create a walk-in.
3. The owner of salon A cannot change (write) a booking of salon B, not only read it. A foreign `salonId` in the dashboard query is ignored or rejected for an owner with two salons, and the owner can switch between their own two salons.
4. Two simultaneous status changes on the same booking (`Promise.all`): exactly one succeeds and the other returns `STATUS_CONFLICT`.
5. Two simultaneous START actions on two different bookings of the same barber (`Promise.all`): exactly one succeeds and the other returns `CHAIR_BUSY`. See section 3.
6. Timestamps: `checkedInAt`, `startedAt`, `completedAt`, and `cancelledAt` + `cancelReason` are each set correctly for their transition.
7. Staff cancel frees the slot: after the cancel, `generateSlots` / the public slot list shows that time as available again. The same for REJECTED and NO_SHOW.
8. Walk-in, each as its own test: creates `WALK_IN` / `CHECKED_IN` with `customerId = null`; the token continues the same sequence after online bookings; takes the next free start; that time is blocked in the online slot list; returns `NO_FREE_TIME` when the barber is fully booked or the salon is closed; never links to an existing user with the same phone and exposes nothing about that user; rejects services of another salon, inactive services, and services the barber does not perform; the 61st creation within an hour by one staff user returns `WALKIN_LIMIT`.
9. The register list data sent to the browser never contains a full phone number. See section 4.
10. Customer-facing status: the token slip and "My bookings" data layer returns the right label key for all 8 statuses, and for a salon-cancelled booking returns the reason. (If this is only possible as a UI test, say so under "could not verify".)

## 3. Chair-busy race
`CHAIR_BUSY` is checked in application code. Two staff devices starting different bookings of the same barber at the same moment can both pass that check. Do this:
- Paste the body of the existing test "enforces chair busy and prevents two concurrent IN_PROGRESS bookings for the same barber" and tell me honestly whether it runs the two updates in parallel or one after the other.
- I authorise ONE database change for this, as a raw SQL migration in the same style as `booking_constraints.sql`: a partial unique index, one per barber, on `"Booking"("barberId") WHERE status = 'IN_PROGRESS'`. No new table, so no RLS work is needed. Map the Postgres unique violation (`23505`) to `CHAIR_BUSY` in `dashboard-service.ts`. Keep the application check as the friendly first line.
- Make sure the seed and all existing tests still pass with the index. Show raw `npx prisma migrate status` and the raw test for the index.

## 4. Phone masking must happen on the server
Show me the code of the query / data-transfer object that feeds the register list. The masked value (`+91 ******3210`) must be produced on the server and the full number must not be in the data sent to the browser for the list. The full phone may appear only on `/dashboard/bookings/[id]`, for authorised staff. If the list currently receives full numbers and masks them in the browser, fix it and tell me.

## 5. Missing audit items from block C
- C.2: Did you enable `react/jsx-no-literals`? Show the exact ESLint config lines, the exceptions you allowed, and the raw `npm run lint` output with the rule enabled. If it is not enabled, enable it, fix the violations or list each intentional exception with a reason.
- C.1: Print the full list of files the Devanagari audit allows as exceptions, and the reason for each.
- C.3: Show the exact command you ran and the folders it covered (it must include `src/`, `docs/`, `README.md`, `package.json`, `public/`, `prisma/`). Paste the raw output.
- C.4: Paste the raw output that shows the message key count in `en.json` and `hi.json`.

## 6. Walk-in details
Show me the code for (a) finding the earliest free start for a walk-in, including how it rounds to the 15-minute grid and how it handles the retry after `SLOT_TAKEN`, and (b) the hourly limit (what store it uses). If it is an in-memory counter, say so plainly, and add a line to `docs/decisions.md` that it must move to a shared store before deployment.

## 7. Production guard for the OTP sender
The test output prints OTP codes through `ConsoleOtpSender`. Show me the code that makes sure `ConsoleOtpSender` can never be used when `APP_ENV=production` or `NODE_ENV=production` (startup error or refusal), and add a test if there is none.

## 8. Final report format
1. Raw `npx prisma validate`, `npx prisma migrate status`, `npm run lint`.
2. `npx vitest run --reporter=verbose > test-output.txt 2>&1`, whole file pasted, plus the `test:utc` and `test:ist` summaries, and `npm run build` with the route list.
3. The requirement-to-test table from section 1, updated at the end.
4. A section named "COULD NOT VERIFY" listing every UI behaviour you have not seen in a browser (register layout, one-handed use at 360px, 30-second refresh, pause when the tab is hidden, print slip, language switch keeping date and filter, stamps on the customer pages).
5. The manual checklist from block N of the Phase 4A prompt, with the exact English and Hindi texts to look for.

Do not start Phase 4B.
