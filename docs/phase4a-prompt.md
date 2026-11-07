# PHASE 4A: Staff Dashboard (Register, Status Changes, Walk-in Tokens, Staff Cancel)

### CRITICAL EXECUTION RULES (MANDATORY)
1. **DO NOT SPAWN SUB-AGENTS (`self` / parallel background tasks).** Execute all blocks sequentially in this single chat thread to conserve quota.
2. **Zero Schema Changes:** Do NOT touch `prisma/schema.prisma` or run `prisma migrate` / `prisma db push`. All required columns (`walkInName`, `walkInPhone`, `source`, `checkedInAt`, `startedAt`, `completedAt`) already exist in the database schema.
3. **RAW UNEDITED TEST OUTPUT:** In Section N, write the test output directly to `test-output.txt` using `npx vitest run --reporter=verbose > test-output.txt 2>&1`, read the file, and output its complete, unedited content without truncating errors, console logs, or summaries.

Phases 0 to 3B are done (Supabase database, themed public pages, phone + OTP login, roles and policies, real slot booking, Ustaad-Ji branding, English / Hindi switching). Now build **Phase 4A only**: the barber and owner dashboard for running the day. This phase has two parts: **Part 1, small fixes** (do these first) and **Part 2, the dashboard**.

Do NOT build Phase 4B items: barber profile editor, service and price editor, weekly hours and availability editor, time-off editor, adding or removing barbers. Do NOT build reminders, home visits, payments, or live queue and wait-time features. The existing `docs/decisions.md` Phase 4 backlog stays as the list for 4B.

Work in the order below. After each lettered block run lint and tests, fix problems, and give me a 2-line status. At the end give the final report described in section N. Do not claim anything works unless you ran it and saw the output. Before you start, re-read `docs/project-spec.md`, `docs/design-brief.md`, `docs/decisions.md` and `docs/i18n-glossary.md`. If this prompt conflicts with them, this prompt wins; record the conflict in `docs/decisions.md`.

---

# PART 1: SMALL FIXES FIRST

## A. Honest data and wording (public screens)
These are all small. Do each one and list what you changed:
1. **Real numbers only:** The home page stats ("Verified Salons", "Expert Barbers", "Tokens Issued") must come from real database counts (`prisma.salon.count({ where: { status: 'VERIFIED' } })`, `prisma.barber.count({ where: { status: 'VERIFIED', isActive: true } })`, `prisma.booking.count()`). If a count is zero, hide that stat. Report where each number comes from.
2. **No invented wait times:** Hide the "Estimated wait" badge on salon cards and any placeholder `LiveQueueBoard` numbers on public pages until real queue data exists (Phase 7). Keep the component files, remove the fake display. If any such number is hardcoded, state where.
3. **Remove the false offline claim:** In the offline page text (both languages), delete the sentence saying saved bookings remain accessible. Keep only: check your internet connection and try again.
4. **Dev hint gating:** The login hint about the fixed test OTP (`auth.devHint`) must render only when `APP_ENV !== 'production'` AND `ALLOW_TEST_OTP === 'true'`. Show the code path and add a test.
5. **"Guaranteed" wording:** Replace "guaranteed digital tokens" (English) and "गारंटीड डिजिटल टोकन" (Hindi) with "confirmed digital token" / "पक्का डिजिटल टोकन".
6. **Remove internal labels from the UI** (English and Hindi), replacing them as follows:
   - "Register Diary Slot Picker" becomes "Pick a time" / "समय चुनें"
   - "Rate Card Board" becomes "Rate Card" / "रेट कार्ड"
   - "Customer Reviews & Pinned Slips" becomes "Customer Reviews" / "ग्राहकों की राय"
   - Delete every mention of "Phase 4" / "चरण 4" and the "Role verified: ... Status: Active" line from user-facing text; the dashboard shell texts will be replaced in Part 2 anyway.
   - "Salons Management" / "Barbers Management" become "Manage Salons" / "Manage Barbers"; "User Phone" becomes "Phone"; "Verify & Enter" becomes "Verify".
7. **Plain error messages:** Rewrite the technical ones: "Cannot book a slot in the past or with less than 15 minutes lead time" becomes "Please pick a time at least {minutes} minutes from now."; "Appointment start time must be aligned to the 15-minute grid" becomes "Please pick a time from the list."; "This booking is in a status that cannot be updated" becomes "This booking can't be changed right now." Provide good natural Hindi for each.
8. **Numbers in messages come from config:** Messages that mention 60 minutes, 14 days, 5 active bookings, or 15 minutes must use placeholders (`{minutes}`, `{days}`, `{count}`) filled from `src/lib/booking-config.ts`, in both languages. Add a test that renders each such message with the config value.
9. **Category label:** `BRIDAL` shows as "Groom Styling" (English) and "दूल्हा स्टाइलिंग" (Hindi). The enum value does not change.

## B. Terminology and Hindi spelling consistency
- English: the word for a barber is **Barber** everywhere (remove "Master Barber" / "Our Master Barbers"; use "Our Barbers").
- Hindi: people-facing screens use **उस्ताद** for a barber (cards, roles, admin, dashboard). "नाई" remains only in marketing copy such as the hero subtitle. Remove "उस्ताद कारीगर" and "उस्ताद नाई".
- Hindi spelling: always use the nukta forms (फ़ोन, अंग्रेज़ी, इंतज़ार, प्रोफ़ाइल, ज़रूर) and the chandrabindu forms (पाएँ, सेवाएँ, जाँच, कहीं). Fix every mixed spelling in `hi.json` and update `docs/i18n-glossary.md`.

## C. Real i18n audit
1. Add a Vitest audit test (`src/tests/i18n-audit.test.ts`) that scans every `.ts` and `.tsx` file under `src/` and fails if it finds Devanagari characters (`[ऀ-ॿ]`) outside `src/messages/hi.json`, seed data and test files. List exceptions with a reason (for example the first-visit picker title, which intentionally shows both languages).
2. Enable the ESLint rule `react/jsx-no-literals` (or an equivalent) as an error or check script, with sensible exceptions (punctuation, symbols, numbers, brand constants). Fix violations or document intentional exceptions.
3. Run a repository-wide search for old names and leftovers: `देसी`, `Indian Salon`, `Indian-salon`, `Dekhein`, `Pakka`, `Aapka`, `Hinglish`. Show the results.
4. Show the exact message-count and parity test output after your changes.

---

# PART 2: THE DASHBOARD

## D. Staff access and scoping (security first)
- Only active `BARBER` and `OWNER` users reach `/dashboard`. Keep the existing middleware plus server-side `requireRole()`.
- **Scope is decided on the server, never by the client.** A barber sees only bookings assigned to their own barber profile. An owner sees bookings for salons they own (support several salons: if an owner owns more than one, show a salon switcher; the selected salon comes from a query parameter that is validated against the owner's salons; default to the first).
- The dashboard works only for a VERIFIED salon and a VERIFIED, active barber. If the salon is PENDING, REJECTED or SUSPENDED (or the barber is), show a themed "awaiting verification" / "suspended" message and no data.
- Never accept `salonId`, `barberId` or `role` from the client as proof of anything. Every action loads the session user via `getCurrentUser()`, loads the record from the database, and checks the central policy.
- Add `canCreateWalkIn(user, barber)` to `src/lib/policies.ts`: a barber for their own profile, an owner for barbers of their own salon; nobody else (admin does not operate chairs). Add `canViewStaffDashboard(user)`.
- Respond 404 (not 403) for records that belong to someone else's salon.

## E. Booking status rules (`src/lib/booking-status.ts`, a pure state machine)
Allowed transitions (anything else is rejected with `INVALID_TRANSITION`):
- PENDING to CONFIRMED, REJECTED, CANCELLED
- CONFIRMED to CHECKED_IN, IN_PROGRESS, NO_SHOW, CANCELLED
- CHECKED_IN to IN_PROGRESS, NO_SHOW, CANCELLED
- IN_PROGRESS to COMPLETED
- COMPLETED, CANCELLED, REJECTED, NO_SHOW are final: no transitions out.
Extra rules:
- NO_SHOW is allowed only after the booking's `startsAt` has passed (`NO_SHOW_TOO_EARLY` otherwise).
- A barber can have only ONE booking IN_PROGRESS at a time (`CHAIR_BUSY` otherwise).
- Setting a status records the right timestamp: `checkedInAt`, `startedAt` (also set `checkedInAt` if it was skipped), `completedAt`, and `cancelledAt` + `cancelReason` for cancellations.
- CANCELLED always uses the existing `cancelBooking` with a mandatory non-empty reason (3 to 200 characters). REJECTED requires no reason.
- **Race safety:** every update sends the `expectedStatus` the staff member was looking at, and is applied as one atomic conditional update (`updateMany` where `id` and `status = expectedStatus`, check the affected count). If the status has already changed, return `STATUS_CONFLICT` with no change, and the UI refreshes the row.
- Log each status change on the server as a structured line (staff user id, booking id, from, to), with no phone numbers.
- Put transition logic in `src/lib/dashboard-service.ts` (database) and `src/lib/booking-status.ts` (pure). Server actions stay thin: validate with Zod, `getCurrentUser()`, policy, service.

## F. Today's register (`/dashboard`)
Ledger-style salon register working one-handed on mobile (large tap targets >= 48px) and desktop:
- **Date:** defaults to today (IST). Buttons for previous and next day (allow 7 days before and 14 days after today). Show selected date in active language.
- **Barber filter (owners):** chips for "All" and each barber in the selected salon. Barbers see only themselves.
- **Summary strip:** counts for today's tokens, waiting (CONFIRMED + CHECKED_IN), in the chair (IN_PROGRESS), done (COMPLETED), cancelled / no-show; and today's earnings (sum of `totalRupees` of COMPLETED bookings).
- **Register list:** ordered by `startsAt`. Each line shows big token number (Special Elite), time, customer name (or "Walk-in" with name), services summary, barber (for owners), total ₹, source tag (Online / Walk-in), and status stamp. Phone numbers masked as `+91 ******3210`. Tapping a line opens the detail view.
- **Action buttons on lines:** based on status:
  - PENDING: Accept / Reject
  - CONFIRMED: Check in / Start / No-show / Cancel
  - CHECKED_IN: Start / No-show / Cancel
  - IN_PROGRESS: Complete
  Cancel opens a themed dialog with a required reason.
- **"Next customer" button** (large, sticky at bottom on mobile): if a booking is IN_PROGRESS for the viewer's scope, complete it; otherwise start the next waiting booking for today, preferring CHECKED_IN (earliest first), then earliest CONFIRMED. For owners with several barbers, applies to the selected barber filter (disabled when "All" is selected).
- **Freshness:** auto-refresh every 30 seconds via `router.refresh()` (pause when tab is hidden), manual refresh button, and "Updated at HH:MM" indicator.
- Empty states, loading skeletons, and error states in the salon theme. Date and barber filter preserved across language switches.

## G. Booking detail for staff (`/dashboard/bookings/[id]`)
- Loaded via `getBookingForUser`; another salon's booking returns themed 404.
- Shows token, status stamp, customer name, full phone number with call button (visible to authorized staff only), services with prices, total ₹, barber, date and time, notes, and timeline (`createdAt`, `checkedInAt`, `startedAt`, `completedAt` or `cancelledAt` with reason).
- Contains valid action buttons matching the register.

## H. Walk-in tokens (`/dashboard/walk-in`)
- Form: barber (fixed for barbers; owners select active verified barber of that salon), one or more active services performed by that barber, customer name (optional, max 60 chars), phone (optional, E.164).
- On submit, create in ONE transaction: `source = WALK_IN`, status `CHECKED_IN`, `customerId = null`, `walkInName` / `walkInPhone`. **Never link to an existing user account by phone number.**
- Time: earliest free start for that barber at or after now (round up to 15-minute grid) where duration fits, using slot-generation rules without the 15-minute lead time, within today's working hours. If none free, return `NO_FREE_TIME`.
- Token comes from same `DailyTokenCounter` transaction.
- Success shows large token screen with a print-friendly button and "Add another".
- Rate limit: 60 walk-ins per staff user per hour.

## I. Customer-facing status updates
- Token slip page and `/bookings` show correct stamps and labels for all statuses: PENDING, CONFIRMED, CHECKED_IN, IN_PROGRESS, COMPLETED, CANCELLED, REJECTED, NO_SHOW in both languages.
- Cancelled by salon shows "Cancelled by the salon" with reason.
- Freed slots (cancelled, rejected, no-show) reappear in public slot lists.

## J. Language and design
- All text in message files. Translated error codes: `INVALID_TRANSITION`, `STATUS_CONFLICT`, `CHAIR_BUSY`, `NO_SHOW_TOO_EARLY`, `NO_FREE_TIME`, `WALKIN_LIMIT`.
- Hindi: barber = उस्ताद, check-in = पहुँच गए, in the chair = कुर्सी पर, done = पूरा, no-show = नहीं आए, walk-in = सीधे आए ग्राहक.
- Palette, contrast, tap targets >= 48px, and reduced-motion rules strictly applied.

## K. Seed data
- Today's date has a realistic mix across statuses (CONFIRMED, CHECKED_IN, IN_PROGRESS, COMPLETED, CANCELLED, PENDING) so the register is populated on load. Test accounts and production guards remain.

## L. Tests (Vitest)
Unit tests:
- State machine: valid transitions, invalid table, final states, NO_SHOW timing, timestamps.
- Policies: `canCreateWalkIn`, `canViewStaffDashboard`, and status policies.
Integration tests against dev database (isolated fixtures, deleted cleanly afterwards, production guard):
- Barber A cannot read/change Barber B's bookings in the same salon; cross-salon owner isolation; customer blocked from staff actions; unverified/suspended staff blocked.
- Atomic conditional update with `expectedStatus` (stale status yields `STATUS_CONFLICT`).
- `CHAIR_BUSY` when starting a second booking for a busy barber; `NO_SHOW_TOO_EARLY` before start time; final states cannot change.
- Staff cancel requires reason and frees slot.
- Walk-in: creates `WALK_IN` / `CHECKED_IN` booking with `customerId = null`; sequential token numbers; earliest free slot; blocks online booking; does not link to existing user; checks rate limit.
- Multi-salon owner switcher isolation.
- Part 1 tests: dev-hint gating (A.4), message placeholders (A.8), message parity for all new keys.
All previous tests must still pass under normal, `TZ=UTC`, and `TZ=Asia/Kolkata` runs.

## M. Database and security notes
- No schema change.
- CSP remains strictly enforced.
- Server actions validate via Zod, verify session and policy, and return typed results.

## N. Verify and report
Run in this order, fix every failure, and paste REAL unedited output:
1. `npx prisma validate` and `npx prisma migrate status`
2. `npm run lint` (raw output)
3. Full test run: `npx vitest run --reporter=verbose > test-output.txt 2>&1` (paste whole file unedited), plus `npm run test:utc` and `npm run test:ist` summaries
4. `npm run build` (raw output including route list)
5. Search and audit results from block C
6. Final CSP string

End with an honest "could not verify" section and a manual browser verification checklist matching Section N.
Do not start Phase 4B.