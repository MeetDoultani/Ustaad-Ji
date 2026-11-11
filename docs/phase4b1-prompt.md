<USER_REQUEST>
# PHASE 4B-1: Staff Rate Card, Salon Hours, Availability and Time-Off Management

### CRITICAL EXECUTION RULES (MANDATORY)
1. **DO NOT SPAWN SUB-AGENTS (`self` / parallel background tasks).** Work strictly sequentially in this single chat thread to conserve quota.
2. **ZERO SCHEMA CHANGES:** Do NOT touch `prisma/schema.prisma` and do NOT run `prisma migrate` or `prisma db push`. All required tables (`Service`, `BarberService`, `SalonHours`, `Availability`, `TimeOff`, `Barber`, `Salon`, `Booking`, `BookingItem`) and database constraints already exist in Supabase Postgres. If you believe a schema change is needed, STOP and ask before proceeding.
3. **PRESERVE ALL EXISTING TESTS:** Do not weaken, edit, or delete any existing test. All earlier tests must continue to pass cleanly under standard, `npm run test:utc`, and `npm run test:ist` test runs.
4. **RAW UNEDITED TERMINAL DUMPS & ZERO FABRICATION:** Do not claim anything works unless you executed it and inspected the real output. Never fabricate or summarize test outputs or command outputs. When reporting test results, pipe directly to `test-output.txt` via `npx vitest run --reporter=verbose > test-output.txt 2>&1` and print the raw file unedited. Never invent data: when referencing test accounts, quote the exact lines of `prisma/seed.ts`.
5. **DETERMINISTIC TESTS (NO SYSTEM CLOCK DEPENDENCY):** Never depend on the unmanaged system clock (`new Date()`, `Date.now()`). Inject an explicit `now` parameter into every function, validator, and test that handles time or date calculations.
6. **STRICT SCOPE BOUNDARIES:** Do NOT build Phase 4B-2 or later features: adding or removing barbers, barber or salon profile editors, customer booking history page, reminders, home visits, payments, live queue, or wait times. Do NOT show, edit, or toggle the `homeVisitOk` field.

---

## SCOPE OF PHASE 4B-1 (Staff Routes)
- `/dashboard/services`: Rate card and service catalog editor (salon owner only).
- `/dashboard/hours`: Salon weekly operating schedule editor (salon owner only).
- `/dashboard/availability`: Weekly working windows per barber (barber edits their own; salon owner edits any barber of their salon).
- `/dashboard/time-off`: Scheduled leave and break windows per barber (same permissions as availability).
- Shared staff dashboard navigation: A persistent, accessible, mobile-first navigation component integrated into all `/dashboard/*` views.
  - Salon Owner views: Register (`/dashboard`), Walk-in (`/dashboard/walk-in`), Services (`/dashboard/services`), Hours (`/dashboard/hours`), Availability (`/dashboard/availability`), Time Off (`/dashboard/time-off`).
  - Barber views: Register (`/dashboard`), Walk-in (`/dashboard/walk-in`), Availability (`/dashboard/availability`), Time Off (`/dashboard/time-off`).
  - Layout constraint: Must fit and remain comfortable for one-handed operation on mobile screens down to `360px` width.

---

## A. SECURITY AND AUTHORIZATION (FIRST PRIORITY)
1. **Server Action & Route Pipeline:** Every server action and route handler must enforce:
   - Zod validation of all incoming inputs.
   - Session resolution via `getCurrentUser()` from `src/lib/auth-server.ts`.
   - Explicit database lookup of target records (verifying tenant association).
   - Central authorization policy evaluation via `src/lib/policies.ts`.
   - Delegation to domain logic in `src/lib/dashboard-service.ts` or dedicated service modules.
   - Never trust client-supplied `salonId`, `barberId`, `serviceId`, or `role` as proof of authorization.
2. **Context & Verification Gating:** Reuse `getStaffDashboardContext` to ensure staff belonging to a `PENDING`, `REJECTED`, or `SUSPENDED` salon, or unverified or inactive barbers, cannot perform any mutation and receive the themed "awaiting verification / suspended" screen with no mutable forms.
3. **Tenant & Record Isolation:**
   - Any attempt to access or modify a record belonging to another salon or another barber must return `404` (`NOT_FOUND`), never `403`, to prevent resource enumeration.
   - A logged-in user whose role lacks access to a section (e.g., a `BARBER` attempting to access `/dashboard/services` or `/dashboard/hours`) must receive the themed 403 forbidden page.
4. **Role Permissions:**
   - Salon services, pricing, and operating hours: Only the `OWNER` of that specific salon.
   - Barber availability and time off: The `BARBER` for their own profile, or the `OWNER` for barbers belonging to their owned salon. Reuse `canManageBarberAvailability` in `src/lib/policies.ts` (add auxiliary policy functions only if necessary, with dedicated unit tests).
   - Platform `ADMIN` and `CUSTOMER` roles are denied access to staff configuration actions.
5. **Staff Rate Limiting:** Apply an in-memory rate limit of 60 edit actions per staff user per hour using `src/lib/rate-limit.ts`. When exceeded, return error code `EDIT_LIMIT` (localized in both languages). Document in `docs/decisions.md` that this counter is per-instance and must transition to a distributed store (e.g., Upstash Redis) prior to production deployment.
6. **Audit Logging:** Emit a structured JSON log line for every mutation on the server: `staffUserId`, `entity`, `entityId`, `action`, and timestamp. Never log full phone numbers or secrets.

---

## B. SERVICES AND RATE CARD EDITOR (`/dashboard/services`)
1. **Visual Styling:** List all salon services (both active and hidden) styled in the physical painted rate card aesthetic (`RateCardBoard` visual metaphor). Group services by category (`ServiceCategory`). Never render a generic SaaS data table.
2. **Mutation Rules:** Support service creation and editing with fields: `category`, `name`, `nameHi` (optional), `durationMin`, `priceRupees`, and `isActive`.
   - Validation: `name` between 2 and 60 characters; `priceRupees` integer between 1 and 50,000; `durationMin` a multiple of 15 between 15 and 240 minutes; maximum 60 services per salon.
3. **Soft-Delete Only:** Never hard-delete a `Service` row. Deletion must set `isActive = false` (hidden). Hidden services can be reactivated.
   - Hidden services must not appear on the public rate card or booking flow.
   - Inactive service validation rules must continue to block booking attempts of hidden services (verify with an integration test).
4. **Deterministic Ordering:** Implement manual reordering using "Move Up" / "Move Down" buttons updating `sortOrder` integers atomically in a single transaction. Do not introduce external drag-and-drop libraries.
5. **Barber Assignment Mapping:** Render checkboxes for all active barbers of the salon, persisting selections to the `BarberService` join table atomically inside the transaction.
   - Display a warning chip on any active service not assigned to any active barber, indicating that the service cannot currently be booked online.
6. **Historical Immutability:** Updating `priceRupees` or `durationMin` on a service must never modify historical or already booked appointments (since `BookingItem` snapshots price and duration at checkout). Prove via an integration test that modifying service pricing leaves existing bookings intact while applying the updated price to subsequent bookings.
7. **Cross-Tenant Guard:** Attempting to update or reorder a service using a `serviceId` from another salon must return `NOT_FOUND`.

---

## C. SALON OPENING HOURS EDITOR (`/dashboard/hours`)
1. **Schedule Presentation:** Display 7 weekday rows starting with Monday (note: schema maps `weekday: 0` as Sunday, `1` as Monday, up to `6` as Saturday). Each row provides:
   - Closed toggle (`isClosed`).
   - `openMin` and `closeMin` selection on a 15-minute grid.
   - Validation: `closeMin > openMin`, bounded between 0 and 1440 minutes.
   - A client-side "Copy to all days" helper utility.
2. **Atomic Persistence:** Save all 7 days within a single interactive database transaction using upserts keyed by `salonId_weekday`.
3. **Non-Blocking Schedule Conflict Detection:**
   - Saving updated salon hours must NEVER automatically cancel or modify existing bookings.
   - Implement a pure conflict detection helper that checks future active bookings (`PENDING`, `CONFIRMED`, `CHECKED_IN`, `IN_PROGRESS`) against the new hours.
   - If conflicts exist, display a non-blocking informational banner listing the affected bookings with deep links to their detail views (`/dashboard/bookings/[id]`).

---

## D. BARBER AVAILABILITY EDITOR (`/dashboard/availability`)
1. **Target Barber Scope:** A salon owner selects among barbers of their salon via filter chips; an individual barber is restricted to their own availability.
2. **Shift Configuration:** Per weekday, allow one or more working windows (supporting split shifts, e.g., morning and evening) aligned to the 15-minute grid.
   - Validation: `endMin > startMin`, values within 0 to 1440, windows on the same weekday must not overlap, maximum 4 windows per day.
   - Include a "Copy this day to other days" action.
3. **Atomic Replacement & Race Protection:**
   - Save the entire week's availability within ONE interactive database transaction.
   - Concurrency Rule: To prevent concurrent updates from creating duplicate or overlapping records, lock the target `Barber` record using parameterized tagged-template `$queryRaw` (`SELECT id FROM "Barber" WHERE id = ${barberId} FOR UPDATE;` without string concatenation), delete the existing `Availability` rows for that barber, and insert the replacement windows.
   - Verify with a concurrent `Promise.all` test that two simultaneous submissions result in a consistent, non-overlapping final schedule.
4. **Conflict & Boundary Warnings:**
   - Provide a non-blocking warning listing future active bookings that fall outside the revised availability.
   - Display an inline advisory note if an availability window extends beyond the salon's configured operating hours (reminding staff that `generateSlots` automatically clips shifts to salon hours).

---

## E. TIME OFF EDITOR (`/dashboard/time-off`)
1. **Time-Off Entries:** Allow creation of leave periods using start and end date/time inputs entered in IST and converted to UTC via `src/lib/time.ts`. Include an optional text reason (up to 100 characters).
   - Validation: `endsAt > startsAt`, `endsAt` must be in the future relative to `now`, maximum duration 90 days, maximum 50 future time-off entries per barber.
   - List active and upcoming entries with a delete action.
2. **Booking Preservation & Slot Impact:**
   - Creating time off must NEVER cancel existing bookings automatically. Display a non-blocking warning detailing any overlapping active bookings with direct links.
   - The slot engine (`generateSlots` and `createBooking`) must immediately cease offering slots overlapping active `TimeOff` ranges. Prove this via unit and integration tests.

---

## F. INTERNATIONALIZATION, DESIGN SYSTEM & ATTRIBUTE PURITY
1. **Translation Keys & Parity:** All UI labels, validation feedback, and server error codes must exist in `src/messages/en.json` and `src/messages/hi.json` with strict parity. Required error codes to translate:
   - `NOT_FOUND`, `EDIT_LIMIT`, `INVALID_HOURS`, `OVERLAPPING_WINDOWS`, `INVALID_TIMEOFF_RANGE`, `TIMEOFF_IN_PAST`.
2. **Glossary & Linguistic Standards:** Adhere strictly to `docs/i18n-glossary.md`:
   - Use Latin digits (`0-9`) exclusively in both languages.
   - Currency rendered as `₹` prefixed directly to the number without whitespace.
   - Standardize Hindi spelling: preserve nukta (फ़ोन, इंतज़ार) and chandrabindu (सेवाएँ, जाँच). No letter-spacing on Devanagari script. Use "उस्ताद" for barber on people-facing screens. Eliminate bilingual slash strings (e.g., no "Services / सेवाएँ").
   - Recommended vocabulary: Services = सेवाएँ, Opening hours = खुलने का समय, Working hours = काम का समय, Time off = छुट्टी, Closed = बंद, Hidden = छिपा हुआ, Save = सहेजें. Update `docs/i18n-glossary.md` with every new term introduced.
3. **Audit Compliance:**
   - `react/jsx-no-literals` must be configured to `"error"`.
   - The JSX attribute audit (`src/tests/jsx-attribute-audit.test.ts`), Devanagari source audit (`src/tests/i18n-audit.test.ts`), and old-names audit (`src/tests/old-names-audit.test.ts`) must pass with zero unapproved exceptions.
   - Services, DTO builders, and server actions must return structured keys and message codes, never raw English display strings.
4. **Physical Design Language:** Use tokens and metaphors from `docs/design-brief.md` (`paper`, `tile`, `maroon`, `tealDeep`, `marigold`, `ink`). All touch targets must measure at least `48px`. Time selection controls must be fully usable one-handed on mobile viewports. Selected and modified states must never rely on color alone. Respect `prefers-reduced-motion`.

---

## G. TEST SUITE (VITEST & REAL DATABASE INTEGRATION)
Write tests with one clear assertion per test case. Real database tests must use isolated test fixtures, clean up after execution, and enforce the production guard (`APP_ENV === 'production' || NODE_ENV === 'production'`).
1. **Pure Unit Tests:**
   - Input validators for services, operating hours, availability windows, and time-off boundaries (testing minimums, maximums, step increments, and negative values).
   - Conflict detection pure functions verifying accurate identification of conflicting booking intervals.
   - Category-based sorting and `sortOrder` calculation helpers.
2. **Policy Unit Tests:**
   - Owner-only policy enforcement for services and operating hours.
   - Availability and time-off permissions (allowing barber self-management and salon owner delegation; denying other barbers, customers, and admins).
3. **Integration Tests:**
   1. Multi-tenant isolation: Owner of Salon A cannot create, update, hide, reorder, or alter barber links for a service in Salon B; foreign identifiers return `NOT_FOUND`.
   2. Role boundaries: A barber cannot execute service or salon hour mutations; a barber cannot edit another barber's availability or time off.
   3. Customer denial: Direct invocations of management services by a `CUSTOMER` are rejected at the service layer.
   4. Status gating: Staff associated with `PENDING`, `REJECTED`, or `SUSPENDED` salons or inactive barbers are blocked from making configuration changes.
   5. Pricing snapshot isolation: Changing a service's price or duration leaves historical and pending `BookingItem` records untouched while applying new rates to subsequent bookings.
   6. Soft-delete behavior: Marking a service inactive removes it from public queries and causes `createBooking` validation to reject it; reactivating restores availability.
   7. Atomic barber assignment: Updating `BarberService` mappings reflects immediately in online booking eligibility.
   8. Salon hours impact on slot engine: Modifying opening hours alters available booking intervals; marked closed days yield zero slots.
   9. Availability impact: Adding, modifying, or splitting shifts changes generated slot windows accordingly.
   10. Time-off reservation block: Creating a `TimeOff` entry removes corresponding slots from `generateSlots` and blocks `createBooking`; deleting the entry restores slot availability.
   11. Availability race condition: Concurrent submissions (`Promise.all`) updating a barber's weekly schedule resolve deterministically via row locking without duplicate or overlapping windows.
   12. Non-blocking conflict warnings: Saving schedules with conflicting active appointments generates accurate warning lists without modifying or cancelling bookings.
   13. Staff rate limiting: Executing 61 management actions within an hour by a single staff user triggers the `EDIT_LIMIT` rejection.
   14. Translation completeness: Message key parity tests verify all new error codes and labels exist across `en.json` and `hi.json` with matching placeholder variables.

---

## H. FINAL VERIFICATION & REPORT FORMAT
Execute all verification commands in sequence and paste the REAL, UNEDITED terminal output:
1. **Requirement-to-Test Matrix:** Output a markdown table mapping every single requirement from Section G to its corresponding test file and exact test name, flagged as `TESTED` or `NOT TESTED`.
2. **Database & Linter Outputs:**
   - Raw output of `npx prisma validate`.
   - Raw output of `npx prisma migrate status` (verifying zero new migrations were created).
   - Raw output of `npm run lint` (verifying zero errors with `react/jsx-no-literals: "error"`).
3. **Test Runs:**
   - Execute `npx vitest run --reporter=verbose > test-output.txt 2>&1` and paste the entire, unedited contents of `test-output.txt`.
   - Summaries for `npm run test:utc` and `npm run test:ist`.
   - Full output of `npm run build` including the complete generated route manifest.
4. **Audit Confirmations:**
   - Output results from `src/tests/i18n-audit.test.ts`, `src/tests/jsx-attribute-audit.test.ts`, and `src/tests/old-names-audit.test.ts`.
   - Measured total key counts for `en.json` and `hi.json` (report the exact measured number).
5. **COULD NOT VERIFY:**
   - Provide an honest list of UI and client-side interactions that cannot be validated without an interactive browser runtime (e.g., visual layout at 360px width, one-handed time-picker ergonomics, clipboard copy buttons, drag-free reordering UI transitions, non-blocking warning presentation, responsive drawer navigation per role, and client state retention during language switching).
6. **Manual Verification Guide:**
   - Step-by-step browser testing walkthrough referencing test accounts quoted directly from `prisma/seed.ts`. Explicitly state which owner manages which salon, and confirm that no seeded owner possesses multiple salons.
   - Detail the exact English and Hindi copy expected when testing the rate card editor, salon hours, availability shifts, and time-off records.

Do NOT proceed to Phase 4B-2.
</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-11-11T04:08:37+05:30.
</ADDITIONAL_METADATA>