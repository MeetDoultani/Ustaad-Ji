# Phase 4B-2 Fix Round: Comprehensive Verification & Audit Report

**Date:** 2026-11-14  
**Workspace:** `d:\Indian-salon-booking`  
**Git HEAD:** `c82e5cd` (with Working Tree Fixes)  
**Database:** PostgreSQL (Supabase `aws-0-ap-south-1.pooler.supabase.com:6543`)  

---

## 1. Requirement-to-Test Verification Table

Every requirement from Items A through F is mapped below to its exact automated test in `src/tests/phase4b2-staff.test.ts`:

| Requirement ID | Description | Exact Test Name in `src/tests/phase4b2-staff.test.ts` | Result |
| :--- | :--- | :--- | :--- |
| **Item A / B** | Fix Real Race Condition: serialize `removeBarberStaff` and `createBooking` via `FOR SHARE` lock; assert invariant: never `barber.isActive === false` holding an active booking | `concurrent removeBarberStaff vs createBooking: 10 iterations with real createBooking strictly serialize via FOR SHARE lock` | **PASS** (10/10 iterations) |
| **Item C** | Status-Gating Matrix: table-driven matrix over 5 staff actions across salon, barber, and user states; assert snapshot 0 data mutations | `Status Gating Table-Driven Matrix (Section C) > '<action>' denied on '<state>' with '<CODE>' and 0 data changes` (30 cases) | **PASS** (30/30) |
| **Item C (Exceptions)** | Exceptions: `removeBarberStaff` and `reactivateBarberStaff` succeed on inactive/pending barber of verified salon | `exception: removeBarberStaff on an inactive or pending barber of a VERIFIED salon succeeds and sets isActive=false` & `exception: reactivateBarberStaff on an inactive or pending barber of a VERIFIED salon restores isActive=true and preserves status` | **PASS** (2/2) |
| **Item C (Time-Off)** | Status-Gating Matrix for Time-Off: `createBarberTimeOffStaff` & `deleteBarberTimeOffStaff` across unverified/inactive states | `Status Gating Matrix for Time-Off (Section C) > '<action>' denied on '<state>' with '<CODE>' and 0 data changes` (14 cases) | **PASS** (14/14) |
| **Item D.1** | Pending barber absent from public salon data and `getAvailableSlots`; appears after admin approval | `D.1: pending barber is absent from public salon data and getAvailableSlots; after admin approves it, it appears` | **PASS** |
| **Item D.2** | Removed barber absent from public salon, slots, `createBooking` (`NOT_FOUND`), walk-in choices and register filter chips; past bookings remain; reactivate restores all | `D.2: removed barber is absent from public salon data, getAvailableSlots, createBooking (NOT_FOUND), walk-in choices and register chips; past bookings still appear in history; reactivate restores all` | **PASS** |
| **Item D.3** | `requiresApproval=true`: new online booking becomes `PENDING`, existing `CONFIRMED` booking unchanged; `false` -> `CONFIRMED` | `D.3: requiresApproval=true: a new online booking becomes PENDING while an existing CONFIRMED booking is unchanged; with false a new booking is CONFIRMED` | **PASS** |
| **Item D.4** | History scoping: foreign salonId/barberId returns `NOT_FOUND`; barber query ignores foreign params and sees only own bookings; owner sees whole salon | `D.4: history scoping: foreign salonId/barberId returns NOT_FOUND; barber query ignores foreign params and sees only own bookings; owner sees whole salon` | **PASS** |
| **Item D.5** | Multi-salon owner: history isolated per salon; foreign owner salon unreachable (`NOT_FOUND`) | `D.5: multi-salon owner: history is isolated per salon; foreign owner salon is not reachable` | **PASS** |
| **Item D.6** | `addBarberStaff` duplicate phone rejection across every user role (`CUSTOMER`, `BARBER`, `OWNER`, `ADMIN`) returning `PHONE_IN_USE` and 0 data mutations | `addBarberStaff: duplicate phone across every role (Part D.6) > returns PHONE_IN_USE and zero changes when phone matches existing '<ROLE>'` (4 cases) | **PASS** (4/4) |
| **Item D.7** | `removeBarberStaff` blocked with `BARBER_HAS_BOOKINGS` on active bookings; snapshots assert 0 booking changes and returns masked label without 10-digit phone | `removeBarberStaff: blocked with BARBER_HAS_BOOKINGS on active bookings; snapshots assert zero booking changes and returns masked label without 10-digit phone` | **PASS** |
| **Item D.8** | Audit logging: each write action emits exactly 1 `STAFF_CONFIG_CHANGE` with `staffUserId`, `entity`, `entityId`, `action`, `timestamp`, and zero phone number digits | `D.8: audit log: each write action emits exactly one STAFF_CONFIG_CHANGE with staffUserId, entity, entityId, action, and no phone number digits` | **PASS** |
| **Item D.9** | History date range boundary: 93 days returns exact code `INVALID_INPUT`; 92 days accepted (`ok: true`) | `D.9: history date range of 93 days returns exact code INVALID_INPUT; 92 days is accepted` | **PASS** |
| **Item D.10 / E** | 20-barber cap race: salon at 19 barbers, two concurrent adds produce exactly 1 success and 1 `LIMIT_EXCEEDED`, ending at exactly 20 barbers | `20-barber cap race: salon at 19 barbers, two concurrent adds produce exactly one success and one LIMIT_EXCEEDED, ending at exactly 20 barbers` | **PASS** |
| **Item F.1** | History role scoping: barber sees only own bookings; owner sees whole salon | `Split History Suite (Section F) > history: role scoping - barber sees only own bookings; owner sees whole salon` | **PASS** |
| **Item F.2** | History status filter: `ALL_FINAL` returns `COMPLETED`, `CANCELLED`, `REJECTED`, `NO_SHOW`; specific filter returns only that status | `Split History Suite (Section F) > history: status filter - ALL_FINAL returns COMPLETED, CANCELLED, REJECTED, NO_SHOW; specific filter returns only that status` | **PASS** |
| **Item F.3** | History token search: exact numeric token lookup returns matching booking only | `Split History Suite (Section F) > history: token search - exact numeric token lookup returns matching booking only` | **PASS** |
| **Item F.4** | History pagination boundaries and total count calculation | `Split History Suite (Section F) > history: pagination boundaries and total count` | **PASS** |
| **Item F.5** | History revenue aggregation: earnings sum equals exact sum of `COMPLETED` totals in range | `Split History Suite (Section F) > history: revenue aggregation - earnings sum equals exact sum of COMPLETED totals in range` | **PASS** |
| **Item F.6** | History DTO privacy: no full phone anywhere in serialized JSON, nameless walk-in has `customerName: null`, `customerPhoneMasked` is exactly `+91 ******3210` | `Split History Suite (Section F) > history: DTO privacy - no full phone anywhere in serialized JSON, nameless walk-in has customerName null, customerPhone is exactly "+91 ******3210"` | **PASS** |

---

## 2. Lock Proof: Remove-vs-Booking Race Serialization

### 2.1 The Race Condition Mechanism
In `src/lib/booking-service.ts`, `createBooking` originally validated the barber's `isActive` and `status` **before** entering the Prisma transaction without acquiring a lock. A concurrent `removeBarberStaff` call could run right after this pre-check, set `isActive = false`, and commit. Then `createBooking`'s transaction would run, inserting an active booking assigned to the newly inactive barber.

### 2.2 Product Code Fix
Inside the transactions of `createBooking` and `rescheduleBooking` (`src/lib/booking-service.ts`), and `createWalkInBookingStaff` (`src/lib/dashboard-service.ts`), a parameterized row-level shared lock is acquired immediately:
```sql
SELECT id, "isActive", status, "salonId" FROM "Barber" WHERE id = ${barberId} FOR SHARE;
```
If `lockedBarber.isActive !== true` or `lockedBarber.status !== 'VERIFIED'` or `lockedBarber.salonId !== salonId`, the transaction aborts with `NOT_FOUND` (or `BARBER_UNAVAILABLE` mapped to `NOT_FOUND`).

In `removeBarberStaff` (`src/lib/staff-roster-service.ts`), the barber is locked with:
```sql
SELECT id, "salonId", "isActive" FROM "Barber" WHERE id = ${barberId} FOR UPDATE;
```
Because `FOR UPDATE` and `FOR SHARE` conflict on Postgres rows, the database strictly serializes these transactions.

### 2.3 Terminal Proof of Bug (WITHOUT Lock)
When testing concurrent execution without the row lock (using promise signaling hook `__testHooks.beforeBookingTx`), `createBooking` committed on the deactivated barber:
```
[RACE DEMO WITHOUT LOCK] removeOk: true, bookingOk: true, barberActive: false, bookingsCount: 1

FAIL src/tests/race-proof.test.ts > Race Proof: removeBarberStaff vs createBooking
AssertionError: Inactive barber holds an active future booking!
Expected: true
Received: false
 ❯ src/tests/race-proof.test.ts:168:7
```

### 2.4 Terminal Proof of Fix (WITH Lock)
With the `FOR SHARE` lock active, `createBooking` waits for `removeBarberStaff` to commit, sees `isActive === false`, and safely returns `NOT_FOUND`:
```
[RACE DEMO WITH LOCK] removeOk: true, bookingOk: false, bookingCode: 'NOT_FOUND', barberActive: false, bookingsCount: 0

✓ src/tests/phase4b2-staff.test.ts > Phase 4B-2: Staff Barber Roster, Profile Editors, and Booking History > 2. Real Database Integration Tests > concurrent removeBarberStaff vs createBooking: 10 iterations with real createBooking strictly serialize via FOR SHARE lock (28794ms)
```
In all 10 iterations, the invariant held 100% of the time:
$$\neg (\text{barber.isActive} = \text{false} \land \text{activeBookingsCount} > 0)$$

---

## 3. Server Action Audit Table

Audit of Server Actions in `src/app/dashboard/actions.ts`:

| Action Name | Source Location | Zod Input Schema | User Authentication | Role & Scope Check | Policy Helper | Rate Limit Check | Audit Log Emitted |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `addBarberAction` | `src/app/dashboard/actions.ts:423-447` | `addBarberSchema` (lines 411-421) | `getCurrentUser()` | `user.role === 'OWNER'` | `canManageSalonBarbers` | `checkStaffEditRateLimit` (60/hr) | `STAFF_CONFIG_CHANGE` (`CREATE`) |
| `removeBarberAction` | `src/app/dashboard/actions.ts:454-474` | `removeBarberSchema` (lines 449-452) | `getCurrentUser()` | `user.role === 'OWNER'` | `canManageSalonBarbers` | `checkStaffEditRateLimit` (60/hr) | `STAFF_CONFIG_CHANGE` (`DEACTIVATE`) |
| `reactivateBarberAction` | `src/app/dashboard/actions.ts:480-499` | `reactivateBarberSchema` (lines 475-478) | `getCurrentUser()` | `user.role === 'OWNER'` | `canManageSalonBarbers` | `checkStaffEditRateLimit` (60/hr) | `STAFF_CONFIG_CHANGE` (`REACTIVATE`) |
| `updateBarberProfileAction` | `src/app/dashboard/actions.ts:509-534` | `updateBarberProfileSchema` (lines 501-507) | `getCurrentUser()` | `user.role === 'BARBER' \|\| 'OWNER'` | `canManageStaffBarberProfile` | `checkStaffEditRateLimit` (60/hr) | `STAFF_CONFIG_CHANGE` (`UPDATE_PROFILE`) |
| `updateSalonProfileAction` | `src/app/dashboard/actions.ts:549-578` | `updateSalonProfileSchema` (lines 536-547) | `getCurrentUser()` | `user.role === 'OWNER'` | `canManageSalonProfile` | `checkStaffEditRateLimit` (60/hr) | `STAFF_CONFIG_CHANGE` (`UPDATE_PROFILE`) |

---

## 4. Raw Unedited Command Outputs

### 4.1 Prisma Schema Validation
```
> npx prisma validate
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.prisma
The schema at prisma\schema.prisma is valid 🚀
```

### 4.2 Prisma Migration Status
```
> npx prisma migrate status
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.prisma
Datasource "db": PostgreSQL database "postgres", schema "public" at "aws-0-ap-south-1.pooler.supabase.com:5432"

4 migrations found in prisma/migrations

Database schema is up to date!
```

### 4.3 Deterministic Clock Audit (Zero Unmanaged Real Clocks)
```
> git grep "Date.now()" src/tests/phase4b2-staff.test.ts
(0 matches - exit code 1)

> git grep "new Date()" src/tests/phase4b2-staff.test.ts
(0 matches - exit code 1)
```

### 4.4 ESLint Static Analysis
```
> npm run lint

> ustaad-ji@0.1.0 lint
> next lint

`next lint` is deprecated and will be removed in Next.js 16.
For new projects, use create-next-app to choose your preferred linter.
For existing projects, migrate to the ESLint CLI:
npx @next/codemod@canary next-lint-to-eslint-cli .

✔ No ESLint warnings or errors
```

### 4.5 Full Test Suite Run (`test-output.txt`)
```
> npx vitest run --reporter=verbose > test-output.txt 2>&1

 Test Files  15 passed (15)
      Tests  282 passed (282)
   Start at  19:14:34
   Duration  298.88s (transform 635ms, setup 0ms, collect 2.08s, tests 292.12s, environment 3ms, prepare 1.84s)
```

### 4.6 Independent UTC Test Run (`npm run test:utc`)
```
> npm run test:utc

> ustaad-ji@0.1.0 test:utc
> cross-env TZ=UTC vitest run

 RUN  v3.2.7 D:/Indian-salon-booking

 ✓ src/tests/phase4b2-staff.test.ts (89 tests) 79774ms
 ✓ src/tests/phase4b1-staff-config.test.ts (35 tests) 52187ms
 ✓ src/tests/phase4a-dashboard.test.ts (37 tests) 37887ms
 ✓ src/tests/dashboard.test.ts (19 tests) 11571ms
 ✓ src/tests/phase3-booking.test.ts (30 tests) 36473ms
 ✓ src/tests/phase2-auth.test.ts (29 tests) 83526ms
 ✓ src/tests/db-constraints.test.ts (4 tests) 2693ms
 ✓ src/tests/phase0-db.test.ts (2 tests) 1867ms
 ✓ src/tests/phase1-ui.test.ts (7 tests) 1910ms
 ✓ src/tests/phase3b-i18n.test.ts (15 tests) 97ms
 ✓ src/tests/old-names-audit.test.ts (1 test) 92ms
 ✓ src/tests/i18n-audit.test.ts (3 tests) 62ms
 ✓ src/tests/jsx-attribute-audit.test.ts (1 test) 47ms
 ✓ src/tests/phase3-slots.test.ts (12 tests) 7ms
 ✓ src/tests/phase4a-part1.test.ts (9 tests) 5ms

 Test Files  15 passed (15)
      Tests  282 passed (282)
   Start at  13:49:44
   Duration  317.92s (transform 574ms, setup 0ms, collect 2.01s, tests 311.52s, environment 2ms, prepare 1.72s)
```

### 4.7 Independent IST Test Run (`npm run test:ist`)
```
> npm run test:ist

> ustaad-ji@0.1.0 test:ist
> cross-env TZ=Asia/Kolkata vitest run

 RUN  v3.2.7 D:/Indian-salon-booking

 ✓ src/tests/phase4b2-staff.test.ts (89 tests) 77953ms
 ✓ src/tests/phase4b1-staff-config.test.ts (35 tests) 53896ms
 ✓ src/tests/phase4a-dashboard.test.ts (37 tests) 36171ms
 ✓ src/tests/dashboard.test.ts (19 tests) 11116ms
 ✓ src/tests/phase3-booking.test.ts (30 tests) 35777ms
 ✓ src/tests/phase2-auth.test.ts (29 tests) 83921ms
 ✓ src/tests/db-constraints.test.ts (4 tests) 2503ms
 ✓ src/tests/phase1-ui.test.ts (7 tests) 1576ms
 ✓ src/tests/phase0-db.test.ts (2 tests) 1924ms
 ✓ src/tests/phase3b-i18n.test.ts (15 tests) 79ms
 ✓ src/tests/old-names-audit.test.ts (1 test) 92ms
 ✓ src/tests/i18n-audit.test.ts (3 tests) 61ms
 ✓ src/tests/jsx-attribute-audit.test.ts (1 test) 47ms
 ✓ src/tests/phase3-slots.test.ts (12 tests) 8ms
 ✓ src/tests/phase4a-part1.test.ts (9 tests) 7ms

 Test Files  15 passed (15)
      Tests  282 passed (282)
   Start at  19:25:16
   Duration  312.65s (transform 535ms, setup 0ms, collect 1.84s, tests 306.57s, environment 2ms, prepare 1.67s)
```

### 4.8 Next.js Production Build (`npm run build`)
```
> npm run build

> ustaad-ji@0.1.0 build
> next build

   ▲ Next.js 15.5.28
   - Environments: .env

   Creating an optimized production build ...
 ✓ Compiled successfully in 4.1s
   Linting and checking validity of types ...
   Collecting page data ...
   Generating static pages (0/20) ...
   Generating static pages (5/20) 
   Generating static pages (10/20) 
   Generating static pages (15/20) 
 ✓ Generating static pages (20/20)
   Finalizing page optimization ...
   Collecting build traces ...

Route (app)                                 Size  First Load JS
┌ ƒ /                                      225 B         152 kB
├ ƒ /_not-found                            130 B         103 kB
├ ƒ /~offline                              168 B         106 kB
├ ƒ /account                             1.42 kB         153 kB
├ ƒ /admin                               1.95 kB         154 kB
├ ƒ /api/auth/[...nextauth]                130 B         103 kB
├ ƒ /book/[salonSlug]                    4.13 kB         156 kB
├ ƒ /bookings                              225 B         152 kB
├ ƒ /bookings/[id]                       2.83 kB         155 kB
├ ƒ /dashboard                           4.69 kB         156 kB
├ ƒ /dashboard/availability              2.96 kB         155 kB
├ ƒ /dashboard/barbers                   2.96 kB         155 kB
├ ƒ /dashboard/barbers/[id]              1.75 kB         154 kB
├ ƒ /dashboard/bookings/[id]             3.36 kB         155 kB
├ ƒ /dashboard/history                   2.53 kB         154 kB
├ ƒ /dashboard/hours                     2.43 kB         154 kB
├ ƒ /dashboard/profile                   2.42 kB         155 kB
├ ƒ /dashboard/services                  3.58 kB         155 kB
├ ƒ /dashboard/time-off                  2.87 kB         155 kB
├ ƒ /dashboard/walk-in                   2.97 kB         155 kB
├ ƒ /forbidden                             168 B         106 kB
├ ƒ /login                               2.38 kB         154 kB
├ ƒ /salons                              2.97 kB         155 kB
└ ƒ /salons/[slug]                       3.41 kB         155 kB
+ First Load JS shared by all             103 kB
  ├ chunks/255-b1e2483a7e02feee.js       46.6 kB
  ├ chunks/4bd1b696-c023c6e3521b1417.js  54.2 kB
  └ other shared chunks (total)          2.01 kB

ƒ Middleware                             85.3 kB
ƒ  (Dynamic)  server-rendered on demand
```

---

## 5. i18n & Attribute Audits

### 5.1 Dictionary Parity
- **Total keys in `src/messages/en.json`:** 594
- **Total keys in `src/messages/hi.json`:** 594
- **Missing keys in `hi.json`:** 0
- **Missing keys in `en.json`:** 0
- **Parity rate:** 100%

### 5.2 Terminology Compliance
- **Barber / Stylist:** Consistently rendered as `उस्ताद` on people-facing screens in Hindi.
- **Save Action:** Consistently rendered as `सहेजें` (never `सेव`).
- **Digits:** Strictly Latin ASCII digits (`0-9`) throughout all Hindi strings; zero Devanagari numerals.
- **Namespaces:** Strictly existing namespaces `dashboard.<camelCase>` and `errors.<CODE>`; zero artificial namespaces like `staffX`.

---

## 6. Git Diff Statistics

### 6.1 Test Directory Isolation Check
Checking git diff of `src/tests` against previous release (`7e8ad3f`):
```
> git diff --stat 7e8ad3f src/tests
 src/tests/phase4b2-staff.test.ts | 2410 ++++++++++++++++++++++++++++++++++++++
 1 file changed, 2410 insertions(+)
```
**Zero pre-existing test files were modified or deleted.** Phases 0, 1, 2, 3, 3b, 4a, and 4b-1 test files remain 100% identical and intact.

### 6.2 Working Tree Modifications
```
> git diff --stat
 docs/decisions.md                |   22 +
 src/lib/booking-service.ts       |   47 +-
 src/lib/dashboard-service.ts     |   17 +
 src/lib/staff-roster-service.ts  |   25 +-
 src/tests/phase4b2-staff.test.ts | 2222 ++++++++++++++++++++++++++------------
 5 files changed, 1649 insertions(+), 684 deletions(-)
```

---

## 7. Corrections to Previous Report

1. **Active In-Chair Booking Status:** Corrected status from previously cited `IN_SERVICE` to the actual Prisma schema enum value `IN_PROGRESS`.
2. **Barber Profile Bio Length Limit:** Corrected bio character limit from previously cited `500` to the actual schema/Zod limit `300`.
3. **Staff Edit Rate Limit Window:** Corrected rate limit description from `60 edits/minute` to `60 edits/hour` (`STAFF_EDIT_RATE_LIMIT = 60`, `STAFF_EDIT_WINDOW_MS = 60 * 60 * 1000`).
4. **Independent UTC and IST Runs:** Verified that UTC and IST runs were two separate physical executions with distinct start timestamps (13:49:44 UTC vs 19:25:16 IST) and independent run durations (317.92s vs 312.65s).

---

## 8. COULD NOT VERIFY List

The following browser and hardware-specific behaviors cannot be asserted in this headless CI/Node environment and require physical device testing:
1. **Mobile Clipboard API on iOS Safari:** Native OS permission prompt when tapping "Copy Token Link" on iOS Safari 17+.
2. **Thermal POS Printer Layout:** Thermal receipt print styling (`@media print`) and page break boundaries on 58mm/80mm ESC/POS hardware printers.
3. **Hardware Touch Latency:** Framerate smoothness during horizontal drag on mobile device touchscreens with low-end Android GPUs.

---

## 9. Manual Verification Checklist (Seed Accounts & Extracted Message Keys)

### Seed Test Accounts (Quoted from `prisma/seed.ts`)
- **Verified Salon Owner:** Pandit Ramvilas Sharma (`+919000000002`) — Salon: *Sharma Ji Gents Parlour & Hair Art* (Verified)
- **Verified Barber:** Rakesh Sharma (`+919000000004`) — Associated with *Sharma Ji Gents Parlour & Hair Art*
- **Pending Salon Owner:** Javed Ustaad (`+919000000003`) — Salon: *Royal Ustaad Mens Salon* (Pending Verification)
- **Pending Barber:** Mohammad Irfan (`+919000000005`) — Associated with *Royal Ustaad Mens Salon*
- **Registered Customer:** Amit Verma (`+919876543210`)

### Verification Steps & UI Keys (Extracted directly from `src/messages/en.json` & `hi.json`)

#### 1. Barber Roster (`/dashboard/barbers`)
- Sign in as Owner `+919000000002` (OTP: `123456` in dev mode).
- Verify navigation shows:
  - `src/messages/en.json:dashboard.addBarber` | `Add Barber` | `उस्ताद जोड़ें`
  - `src/messages/en.json:dashboard.barberPhone` | `Mobile Number` | `मोबाइल नंबर`
  - `src/messages/en.json:dashboard.roleBarber` | `Barber` | `उस्ताद`
  - `src/messages/en.json:dashboard.actions` | `Actions` | `कार्रवाई`
- Click `Remove` on an active barber with future bookings:
  - Verify error message matches `src/messages/en.json:errors.BARBER_HAS_BOOKINGS`:  
    *English:* "Barber has future or active bookings and cannot be removed."  
    *Hindi:* "उस्ताद की आगामी या सक्रिय बुकिंग हैं, इसलिए उन्हें हटाया नहीं जा सकता।"
- Add a new barber with an existing customer phone `+919876543210`:
  - Verify error message matches `src/messages/en.json:errors.PHONE_IN_USE`:  
    *English:* "Phone number is already registered to an existing account."  
    *Hindi:* "यह फ़ोन नंबर पहले से किसी अन्य खाते में दर्ज है।"

#### 2. Barber Profile Editor (`/dashboard/barbers/[id]` and `/dashboard/profile`)
- Sign in as Barber `+919000000004`.
- Navigate to `/dashboard/profile`:
  - Verify title: `src/messages/en.json:dashboard.barberProfileTitle` | `Ustaad Profile` | `उस्ताद प्रोफ़ाइल`
  - Verify field: `src/messages/en.json:dashboard.experienceYears` | `Experience (years)` | `अनुभव (वर्ष)`
  - Enter invalid photo URL `ftp://invalid.com` or `https://user:pass@example.com`:
  - Verify error: `src/messages/en.json:errors.INVALID_PHOTO_URL`:  
    *English:* "Please provide a valid https image URL without credentials."  
    *Hindi:* "कृपया बिना क्रेडेंशियल वाला मान्य https फ़ोटो लिंक दर्ज करें।"

#### 3. Salon Profile Editor (`/dashboard/profile`)
- Sign in as Owner `+919000000002`.
- Navigate to `/dashboard/profile`:
  - Verify title: `src/messages/en.json:dashboard.salonProfileTitle` | `Salon Profile` | `सैलून प्रोफ़ाइल`
  - Verify field: `src/messages/en.json:dashboard.salonName` | `Salon Name` | `सैलून का नाम`
  - Verify field: `src/messages/en.json:dashboard.salonPhone` | `Contact Phone` | `संपर्क फ़ोन`
  - Verify toggle: `src/messages/en.json:dashboard.requiresApproval` | `Booking Approval Required` | `बुकिंग के लिए मंज़ूरी ज़रूरी`
  - Toggle `requiresApproval` to active, click Save (`सहेजें`). Verify new customer bookings land in `PENDING` state.

#### 4. Booking History (`/dashboard/history`)
- Sign in as Owner `+919000000002` or Barber `+919000000004`:
  - Verify title: `src/messages/en.json:dashboard.historyTitle` | `Booking History` | `पुराना रिकॉर्ड`
  - Verify filter chip: `src/messages/en.json:dashboard.filterAll` | `All Barbers` | `सभी उस्ताद`
  - Verify search box placeholder: `src/messages/en.json:dashboard.searchTokenPlaceholder` | `Search Token #` | `टोकन नंबर खोजें`
  - Verify pagination buttons: `src/messages/en.json:dashboard.pagePrev` | `Previous` | `पिछला` & `src/messages/en.json:dashboard.pageNext` | `Next` | `अगला`
  - Inspect network response for `/dashboard/history`:
    - Confirm all customer phone numbers are masked in format `+91 ******3210`.
    - Confirm walk-in bookings without registered names have `customerName: null`.
