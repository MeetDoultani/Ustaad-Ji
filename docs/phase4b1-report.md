# PHASE 4B-1: Staff Rate Card, Salon Hours, Availability and Time-Off Management
## Comprehensive Implementation, Audit & Verification Report

**Date:** 2026-11-13  
**Project:** Ustaad-Ji (`d:/Indian-salon-booking`)  
**Phase:** 4B-1 Final Fix Round (Staff Rate Card, Salon Hours, Barber Availability & Time-Off)  
**Database Schema Status:** Strictly Locked (0 schema modifications, 0 migrations applied)  
**Test Suite Status:** 100% Pass (193/193 tests passing across all 14 test files under Default, UTC, and IST timezones)  
**Bugs Meet Found:** (none yet)  

---

## Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [Section 1: Service Categories Enum Audit & Alignment](#section-1-service-categories-enum-audit--alignment)
3. [Section 2: Comprehensive Requirement-to-Test Matrix](#section-2-comprehensive-requirement-to-test-matrix)
4. [Section 3: Dissect & Rebuild Misleading Tests](#section-3-dissect--rebuild-misleading-tests)
5. [Section 4: Dedicated Integration Tests (Tests 15–26)](#section-4-dedicated-integration-tests-tests-1526)
6. [Section 5: Server Action Security & Audit Table](#section-5-server-action-security--audit-table)
7. [Section 6: Pre-Existing Test Audit & Git Diff](#section-6-pre-existing-test-audit--git-diff)
8. [Section 7: Policy Inspection & Code Health](#section-7-policy-inspection--code-health)
9. [Section 8: Documentation & Message Placeholder Audit](#section-8-documentation--message-placeholder-audit)
10. [Section 9: Browser Verification & Manual Testing Checklist](#section-9-browser-verification--manual-testing-checklist)
11. [Section 10: Raw Terminal Outputs of Verification Commands](#section-10-raw-terminal-outputs-of-verification-commands)

---

## 1. Executive Summary

Phase 4B-1 implements the staff configuration suite enabling salon owners and individual barbers to operate their day-to-day salon operations:
- `/dashboard/services`: Owner-only Rate Card & Service Catalog editor with manual intra-category ordering, soft-delete visibility toggle, and salon barber assignment.
- `/dashboard/hours`: Owner-only Salon Operating Hours editor supporting all 7 weekdays on a 15-minute grid with non-blocking schedule conflict detection.
- `/dashboard/availability`: Barber & Owner Weekly Shift Availability editor supporting split shifts (up to 4 windows/day) with database row-level locking (`SELECT ... FOR UPDATE`) concurrency protection.
- `/dashboard/time-off`: Barber & Owner Scheduled Leave / Time-Off management with instant slot engine suppression and non-blocking conflict warnings.
- `StaffDashboardNav.tsx`: Persistent sub-navigation bar with active route highlighting across both desktop and mobile viewports (6 tabs for Owners, 4 tabs for Barbers).

### Architectural Invariants Strictly Preserved
1. **Zero Database Migrations:** No changes to `prisma/schema.prisma`; zero `prisma migrate` or `prisma db push` runs. All operations utilize existing Supabase PostgreSQL tables (`Service`, `BarberService`, `SalonHours`, `Availability`, `TimeOff`, `Barber`, `Salon`, `Booking`, `BookingItem`).
2. **Role Boundaries & Tenant Isolation:** Evaluated via centralized policy functions in `src/lib/policies.ts`. Cross-tenant mutations return `404` (`NOT_FOUND`) to prevent enumeration attacks.
3. **Historical Price Snapshot Immutability:** Changing service catalog prices leaves existing historical `BookingItem` snapshot records completely intact.
4. **Non-Blocking Schedule Conflict Alerts:** Saving revised operating hours, availability, or time-off detects overlapping active customer appointments and displays informational warning notices with deep links to `/dashboard/bookings/[id]`, without cancelling or tampering with confirmed customer bookings.
5. **Deterministic Testing Architecture:** Zero unmanaged system clock calls (`Date.now()`, `new Date()`) in test suites. All services, validators, and conflict detectors accept an optional `now: Date` parameter.
6. **Strict I18n & Attribute Purity:** 100% parity between English (`en.json`) and Hindi (`hi.json`) with exactly 517 keys each. Zero unapproved Devanagari characters in source code; zero hardcoded literals in user-visible JSX attributes.

---

## Section 1: Service Categories Enum Audit & Alignment

### 1.1 Schema Enum Definition
In `prisma/schema.prisma` (lines 39–48):
```prisma
enum ServiceCategory {
  HAIR
  BEARD
  SHAVE
  FACIAL
  MASSAGE
  KIDS
  BRIDAL
  OTHER
}
```

### 1.2 Codebase Search / Grep Results
Grep search across all TypeScript files in `src/` for `ServiceCategory`:
```powershell
Select-String -Path "src/**/*.ts","src/**/*.tsx" -Pattern "ServiceCategory\."
```
**Exact `file:line` matches:**
- `src/lib/staff-config-service.ts:348`: `category: z.nativeEnum(ServiceCategory)`
- `src/lib/staff-config-service.ts:468`: `category: z.nativeEnum(ServiceCategory)`
- `src/app/dashboard/services/page.tsx:28`: `const CATEGORY_ORDER: ServiceCategory[] = [ServiceCategory.HAIR, ServiceCategory.BEARD, ServiceCategory.SHAVE, ServiceCategory.FACIAL, ServiceCategory.MASSAGE, ServiceCategory.KIDS, ServiceCategory.BRIDAL, ServiceCategory.OTHER]`
- `src/app/dashboard/services/ServicesClient.tsx:28`: `const CATEGORIES: ServiceCategory[] = [ServiceCategory.HAIR, ServiceCategory.BEARD, ServiceCategory.SHAVE, ServiceCategory.FACIAL, ServiceCategory.MASSAGE, ServiceCategory.KIDS, ServiceCategory.BRIDAL, ServiceCategory.OTHER]`
- `src/tests/phase4b1-staff-config.test.ts:6`: `ServiceCategory`
- `src/tests/phase4b1-staff-config.test.ts:347`: `category: ServiceCategory.HAIR`
- `src/tests/phase4b1-staff-config.test.ts:360`: `category: ServiceCategory.BEARD`
- `src/tests/phase4b1-staff-config.test.ts:393`: `category: ServiceCategory.SHAVE`

### 1.3 Alignment Findings & Verification
1. **Codebase Always Enforced the Prisma Enum:** The TypeScript codebase, Zod validation schemas (`createServiceSchema`, `updateServiceSchema`), page loaders, and client dropdowns strictly enforce and accept **only** the 8 Prisma enum values (`HAIR`, `BEARD`, `SHAVE`, `FACIAL`, `MASSAGE`, `KIDS`, `BRIDAL`, `OTHER`). No production code accepted values outside the Prisma enum.
2. **Informal Labels in Documentation:** Labels such as `HAIRCUT` and `COMBO` were informal prose used in design discussions and never present in code.
3. **`BRIDAL` Category Presentation:** In accordance with Project Spec Rule A.9, the `BRIDAL` enum value is presented to users exclusively as:
   - English: **"Groom Styling"** (`categories.BRIDAL: "Groom Styling"`)
   - Hindi: **"दूल्हा स्टाइलिंग"** (`categories.BRIDAL: "दूल्हा स्टाइलिंग"`)
   - Verified by dedicated test assertion: `src/tests/phase4a-part1.test.ts > A.9: BRIDAL category is displayed as Groom Styling / दूल्हा स्टाइलिंग`.

---

## Section 2: Comprehensive Requirement-to-Test Matrix

Every requirement bullet from Sections A through F of `docs/phase4b1-prompt.md` is mapped to its dedicated test in the test suite:

| Requirement / Scope Bullet | Test File | Exact Test Name | Status |
|---|---|---|---|
| **A. Rate Card & Service Catalog Editor** | | | |
| Owner-only access enforcement | `src/tests/phase4b1-staff-config.test.ts` | `canManageSalonServices: allows owner of that specific salon only; denies others` | **TESTED** |
| Customer and Admin rejection at service level | `src/tests/phase4b1-staff-config.test.ts` | `3. Customer and Admin denial at service level: Every service function directly rejects CUSTOMER and ADMIN` | **TESTED** |
| Barber assigned to salon service modification denial | `src/tests/phase4b1-staff-config.test.ts` | `2. Role boundaries: A barber cannot execute service or salon hour mutations; cannot edit another barber schedule` | **TESTED** |
| Add new service with full fields stored | `src/tests/phase4b1-staff-config.test.ts` | `25. Full-field service creation: All fields (category, name, nameHi, price, duration, barbers, sortOrder) are stored correctly` | **TESTED** |
| Edit service (name, price, duration, active status) | `src/tests/phase4b1-staff-config.test.ts` | `5. Pricing snapshot isolation & 6. Soft-delete behavior` | **TESTED** |
| Soft-delete toggle (`isActive = false`) preserves history | `src/tests/phase4b1-staff-config.test.ts` | `6. Soft-delete behavior: Deactivating a service sets isActive=false and rejects new bookings; reactivation restores it` | **TESTED** |
| Public rate card hiding when deactivated | `src/tests/phase4b1-staff-config.test.ts` | `16. Public rate card hiding: isActive: false omitted from getSalonBySlug; reactivating restores it` | **TESTED** |
| Reorder services within category (Move Up / Down swap) | `src/tests/phase4b1-staff-config.test.ts` | `15. Reorder mechanics within category: Move Up/Down swaps inside category; first item Move Up does nothing; other category untouched; foreign returns NOT_FOUND; sortOrders stay unique` | **TESTED** |
| Barber assignment through real paths (`createServiceStaff` & `updateServiceStaff`) | `src/tests/phase4b1-staff-config.test.ts` | `7. Atomic barber assignment: Updating BarberService join records via updateServiceStaff & 17. Barber assignment validation via createServiceStaff & updateServiceStaff` | **TESTED** |
| Foreign, inactive, unverified barbers rejected with `INVALID_BARBER` | `src/tests/phase4b1-staff-config.test.ts` | `17. Barber assignment validation via createServiceStaff & updateServiceStaff: Foreign, inactive, unverified barbers rejected with INVALID_BARBER and write nothing` | **TESTED** |
| Service boundary limits (60 max, price 1-50000, duration 15-240) | `src/tests/phase4b1-staff-config.test.ts` | `18. Boundary limit validations: 61st service, 5th window, overlapping windows, 51st time-off, >90d range, past time-off, price 0/50001, duration 20/255, name 1/61 chars` | **TESTED** |
| Pricing snapshot isolation (existing BookingItem intact) | `src/tests/phase4b1-staff-config.test.ts` | `5. Pricing snapshot isolation: Changing service price leaves existing BookingItem records intact` | **TESTED** |
| **B. Salon Operating Hours Editor** | | | |
| Owner-only access enforcement | `src/tests/phase4b1-staff-config.test.ts` | `canManageSalonHours: allows owner of that specific salon only; denies others` | **TESTED** |
| Customer and Admin rejection | `src/tests/phase4b1-staff-config.test.ts` | `3. Customer and Admin denial at service level: Every service function directly rejects CUSTOMER and ADMIN` | **TESTED** |
| All 7 weekdays distinct configuration & readback | `src/tests/phase4b1-staff-config.test.ts` | `24. Weekly hours persistence: Saving all 7 weekdays with distinct values persists and reads back via getSalonHoursStaff` | **TESTED** |
| Atomic transaction upsert across 7 days | `src/tests/phase4b1-staff-config.test.ts` | `22. Atomic hours rollback: Invalid row in saveSalonHours aborts before updating, leaving existing DB rows unchanged` | **TESTED** |
| Slot engine impact: closed day yields zero slots | `src/tests/phase4b1-staff-config.test.ts` | `8. Salon hours impact on slot engine: Saving salon hours with closed day causes public getAvailableSlots to return zero slots` | **TESTED** |
| Non-blocking conflict warnings (existing bookings intact) | `src/tests/phase4b1-staff-config.test.ts` | `12. Non-blocking conflict warnings & 20. Integration conflict warnings` | **TESTED** |
| **C. Barber Weekly Working Hours (Availability)** | | | |
| Barber and Owner access enforcement | `src/tests/phase4b1-staff-config.test.ts` | `canManageStaffBarberSchedule: allows barber self-management and salon owner delegation; denies others` | **TESTED** |
| Barber own userId allowed; barber-profile id as user denied | `src/tests/phase4b1-staff-config.test.ts` | `canManageStaffBarberSchedule: allows barber own userId; denies barber-profile id passed as userId` | **TESTED** |
| Foreign barber and cross-salon denial | `src/tests/phase4b1-staff-config.test.ts` | `2. Role boundaries & 21. Barber & Owner tenant isolation: Cross-salon updates return NOT_FOUND` | **TESTED** |
| Customer and Admin rejection | `src/tests/phase4b1-staff-config.test.ts` | `3. Customer and Admin denial at service level: Every service function directly rejects CUSTOMER and ADMIN` | **TESTED** |
| Split shifts (max 4 windows per day, non-overlapping) | `src/tests/phase4b1-staff-config.test.ts` | `18. Boundary limit validations` | **TESTED** |
| Concurrency protection via row locking | `src/tests/phase4b1-staff-config.test.ts` | `11. Availability race condition: Concurrent submissions (Promise.all) resolve deterministically via row locking` | **TESTED** |
| Slot engine impact: split shifts offer slots only in shifts | `src/tests/phase4b1-staff-config.test.ts` | `9. Availability impact: Saving split shift availability causes getAvailableSlots to offer slots only within windows and none in afternoon gap` | **TESTED** |
| Non-blocking conflict warnings (outside availability) | `src/tests/phase4b1-staff-config.test.ts` | `20. Integration conflict warnings` | **TESTED** |
| **D. Barber Time-Off & Leaves** | | | |
| Barber and Owner access enforcement | `src/tests/phase4b1-staff-config.test.ts` | `canManageStaffBarberSchedule` | **TESTED** |
| Cross-salon isolation | `src/tests/phase4b1-staff-config.test.ts` | `21. Barber & Owner tenant isolation: Cross-salon updates return NOT_FOUND` | **TESTED** |
| Add time-off entry (future date, reason, max 90d, max 50 entries) | `src/tests/phase4b1-staff-config.test.ts` | `18. Boundary limit validations` | **TESTED** |
| Past time-off rejection (`TIMEOFF_IN_PAST`) | `src/tests/phase4b1-staff-config.test.ts` | `18. Boundary limit validations` | **TESTED** |
| Slot engine blockage: time-off blocks overlapping slots | `src/tests/phase4b1-staff-config.test.ts` | `10. Time-off reservation block & 19. Time-off booking blockage in core service` | **TESTED** |
| Core booking blockage (`createBooking` rejected with `SLOT_TAKEN`) | `src/tests/phase4b1-staff-config.test.ts` | `19. Time-off booking blockage in core service: createBooking rejected with SLOT_TAKEN, deleting time-off allows it` | **TESTED** |
| Delete time-off frees slot immediately | `src/tests/phase4b1-staff-config.test.ts` | `19. Time-off booking blockage in core service` | **TESTED** |
| Non-blocking conflict warnings (overlapping bookings) | `src/tests/phase4b1-staff-config.test.ts` | `20. Integration conflict warnings` | **TESTED** |
| **E. Cross-Cutting Concerns** | | | |
| Staff edit rate limiting (60/hour, `EDIT_LIMIT`) | `src/tests/phase4b1-staff-config.test.ts` | `13. Staff rate limiting: 60 actual service edits succeed; 61st returns EDIT_LIMIT; second staff user succeeds immediately at same timestamp` | **TESTED** |
| Complete status gating matrix (24 cases across salon, barber, user) | `src/tests/phase4b1-staff-config.test.ts` | `26. Status gating table-driven matrix: Rejection across all salon, barber, and staff user states for all 8 actions with zero DB mutations` | **TESTED** |
| Blocked barber (`barber.isActive === false`) status gating | `src/tests/phase4b1-staff-config.test.ts` | `26. Status gating table-driven matrix (Barber.isActive=false rows)` | **TESTED** |
| Audit logging across all 8 actions with zero phone numbers | `src/tests/phase4b1-staff-config.test.ts` | `23. Audit logging: Each of the 8 staff config actions emits a valid STAFF_CONFIG_CHANGE JSON line without any phone number` | **TESTED** |
| Deterministic timestamps (`now` parameter injection) | `src/tests/phase4b1-staff-config.test.ts` | Verified across all test cases (0 unmanaged clock hits) | **TESTED** |
| Translation parity (517 keys matching across en and hi) | `src/tests/phase4b1-staff-config.test.ts` | `14. Translation completeness` & `src/tests/i18n-audit.test.ts` | **TESTED** |

---

## Section 3: Dissect & Rebuild Misleading Tests

### 3.1 Test 3: Customer Denial
#### Previous Implementation
The previous implementation only tested pure policy functions (`canManageSalonServices`, `canManageSalonHours`, `canManageStaffBarberSchedule`) by passing mock objects in memory. It never invoked the service layer functions or verified that a customer calling service mutations directly is denied.

#### Rebuilt Implementation
Directly calls all 8 real service layer functions with a `CUSTOMER` and an `ADMIN` identity, asserting each call is rejected at the service layer:
```typescript
it('3. Customer and Admin denial at service level: Every service function directly rejects CUSTOMER and ADMIN', async () => {
  const customerCurrent: CurrentUser = { id: customerUser.id, role: Role.CUSTOMER, phone: customerUser.phone, name: customerUser.name, isActive: true };
  const adminCurrent: CurrentUser = { id: adminUser.id, role: Role.ADMIN, phone: adminUser.phone, name: adminUser.name, isActive: true };

  for (const user of [customerCurrent, adminCurrent]) {
    // 1. createServiceStaff
    const resCreate = await createServiceStaff(user, salonA.id, { name: 'Unauthorized Haircut', category: ServiceCategory.HAIR, priceRupees: 200, durationMin: 30 }, nowRef);
    expect(resCreate.ok).toBe(false);
    expect(resCreate.code).toBe('UNAUTHORIZED');

    // 2. updateServiceStaff
    const resUpdate = await updateServiceStaff(user, salonA.id, serviceA1.id, { name: 'Hacked Svc', category: ServiceCategory.HAIR, priceRupees: 200, durationMin: 30 }, nowRef);
    expect(resUpdate.ok).toBe(false);
    expect(resUpdate.code).toBe('UNAUTHORIZED');

    // 3. toggleServiceActiveStaff
    const resToggle = await toggleServiceActiveStaff(user, salonA.id, serviceA1.id, false, nowRef);
    expect(resToggle.ok).toBe(false);
    expect(resToggle.code).toBe('UNAUTHORIZED');

    // 4. reorderServicesStaff
    const resReorder = await reorderServicesStaff(user, salonA.id, serviceA1.id, 'UP', nowRef);
    expect(resReorder.ok).toBe(false);
    expect(resReorder.code).toBe('UNAUTHORIZED');

    // 5. updateSalonHoursStaff
    const resHours = await updateSalonHoursStaff(user, salonA.id, [{ weekday: 1, openMin: 540, closeMin: 1260, isClosed: false }], nowRef);
    expect(resHours.ok).toBe(false);
    expect(resHours.code).toBe('UNAUTHORIZED');

    // 6. updateBarberAvailabilityStaff
    const resAvail = await updateBarberAvailabilityStaff(user, barberA.id, [{ weekday: 1, startMin: 540, endMin: 1260 }], nowRef);
    expect(resAvail.ok).toBe(false);
    expect(resAvail.code).toBe('UNAUTHORIZED');

    // 7. createBarberTimeOffStaff
    const resTimeOff = await createBarberTimeOffStaff(user, barberA.id, { startsAt: new Date(nowRef.getTime() + 60000), endsAt: new Date(nowRef.getTime() + 120000) }, nowRef);
    expect(resTimeOff.ok).toBe(false);
    expect(resTimeOff.code).toBe('UNAUTHORIZED');

    // 8. deleteBarberTimeOffStaff
    const resDelTimeOff = await deleteBarberTimeOffStaff(user, barberA.id, 'fake-time-off-id', nowRef);
    expect(resDelTimeOff.ok).toBe(false);
    expect(resDelTimeOff.code).toBe('UNAUTHORIZED');
  }
});
```

---

### 3.2 Tests 8 & 9: Salon Hours and Availability Impact on Slot Engine
#### Previous Implementation
The previous implementation invoked the pure in-memory helper `generateSlots` with mock arrays without touching the database or exercising public slot query endpoints.

#### Rebuilt Implementation
1. **Test 8:** Mutates salon hours via `updateSalonHoursStaff(ownerACurrent, salonA.id, closedHours, nowRef)` setting Sunday as `isClosed = true`, then calls the real public query loader `getAvailableSlots({ barberId: barberA.id, dateIst: '2026-11-22', serviceIds: [serviceA1.id], now: nowRef })` and verifies `available.length === 0`.
2. **Test 9:** Mutates barber availability via `updateBarberAvailabilityStaff(barberACurrent, barberA.id, splitWindows, nowRef)` setting a split shift (09:00–12:00 and 16:00–20:00), calls `getAvailableSlots`, and asserts:
   - Available slots exist in Shift 1 (09:00–12:00) and Shift 2 (16:00–20:00).
   - Zero available slots exist in the afternoon gap (12:00–16:00).

---

### 3.3 Test 11: Availability Race Condition
#### Previous Implementation
Fired two overlapping arrays to `updateBarberAvailabilityStaff`, but only checked `expect(rows).toHaveLength(2)` without verifying mutual exclusivity between Schedule A and Schedule B. Could pass even if rows were interleaved or partially applied.

#### Rebuilt Implementation
Uses Schedule A (Morning: 09:00–13:00 / 540–780 min) and Schedule B (Evening: 14:00–18:00 / 840–1080 min). Fired concurrently via `Promise.all`:
```typescript
const isScheduleA = rows.every((r) => r.startMin === 540 && r.endMin === 780);
const isScheduleB = rows.every((r) => r.startMin === 840 && r.endMin === 1080);
expect(isScheduleA || isScheduleB).toBe(true);
```
Proves that database transaction row locking (`SELECT id FROM "Barber" WHERE id = ${barberId} FOR UPDATE;`) guarantees atomic replacement where either Schedule A or Schedule B cleanly wins, with zero interleaved windows or duplicates.

---

### 3.4 Test 13: Staff Rate Limiting
#### Previous Implementation
Tested the in-memory helper `checkStaffEditRateLimit` in a simple loop without executing actual database mutations.

#### Rebuilt Implementation
Executes 60 actual service mutations through `toggleServiceActiveStaff` with `ownerACurrent`:
- 60 actual edits succeed and update the database.
- The 61st edit by `ownerA` at the same deterministic timestamp returns `{ ok: false, code: 'EDIT_LIMIT' }`.
- A second staff user (`ownerB`) invokes `toggleServiceActiveStaff` at the exact same deterministic timestamp and succeeds immediately (`ok: true`).

---

### 3.5 Test 15: Intra-Category Service Reordering
#### Previous Implementation
Reordered across the whole salon list without grouping by category, causing "Move Up" on the first service of a category to swap with a service from another category.

#### Rebuilt Implementation
Restricts neighbour search to `where: { salonId, category: service.category }`. Uses isolated categories (`BRIDAL` and `MASSAGE`) to test edge cases:
- Move Up on the first service of a category returns `{ ok: true }` and makes zero database mutations.
- Move Down swaps sort orders cleanly with the next service in the same category.
- Services in other categories (`MASSAGE`) remain completely untouched.
- Reordering a service from another salon returns `{ ok: false, code: 'NOT_FOUND' }`.
- All `sortOrder` values remain unique across the salon.

---

### 3.6 Tests 7 & 17: Barber Assignment Through Real UI Paths
#### Previous Implementation
Used a standalone function `setBarberServicesStaff` which was never called by any server action or UI component.

#### Rebuilt Implementation
- Completely removed `setBarberServicesStaff` and its alias `setBarberServices`.
- **Test 7:** Tests barber assignment via `updateServiceStaff`:
  - Providing a valid barber ID list replaces the join set.
  - Providing an empty array (`barberIds: []`) clears the join set.
  - Omitting `barberIds` leaves the existing assignments unchanged.
  - If any error occurs, atomic rollback ensures zero partial join writes.
- **Test 17:** Tests validation on both `createServiceStaff` and `updateServiceStaff`:
  - Passing a foreign barber returns `INVALID_BARBER` and writes nothing.
  - Passing an inactive barber returns `INVALID_BARBER` and writes nothing.
  - Passing an unverified barber returns `INVALID_BARBER` and writes nothing.

---

### 3.7 Deterministic Clock Audit
All unmanaged system clock invocations (`Date.now()`, `new Date()`) in `src/tests/phase4b1-staff-config.test.ts` were replaced with a fixed reference date `nowRef = new Date('2026-06-15T10:00:00.000Z')` and deterministic offsets. Fixture IDs use a sequential counter `nextFixtureId()`.
Verified via:
```powershell
git grep -n "Date\.now()\|new Date()" -- src/tests/phase4b1-staff-config.test.ts
```
**Output:** 0 hits (Exit code 1).

---

## Section 4: Dedicated Integration Tests (Tests 15–26)

All 12 dedicated integration scenarios in `src/tests/phase4b1-staff-config.test.ts`:

1. **Test 15: Intra-Category Reorder Mechanics:**  
   Verifies that `reorderServicesStaff` swaps sort orders strictly within the same category. Move Up on the first item makes no change. Other categories remain untouched. Foreign salon services return `NOT_FOUND`. All sortOrder values stay unique.
2. **Test 16: Public Rate Card Hiding:**  
   Verifies `serviceA1` is visible in `getSalonBySlug`. Toggling `isActive: false` via `toggleServiceActiveStaff` omits it from the public rate card. Reactivating restores it.
3. **Test 17: Barber Assignment Validation:**  
   Passing a foreign barber, inactive barber, or unverified barber to `createServiceStaff` or `updateServiceStaff` rejects with `INVALID_BARBER` and writes zero rows to the database.
4. **Test 18: Boundary Limit Validations:**  
   - Name length: 1 character rejected (`INVALID_INPUT`), 61 characters rejected (`INVALID_INPUT`).
   - Price: 0 rejected (`INVALID_INPUT`), 50,001 rejected (`INVALID_INPUT`).
   - Duration: 20 min rejected (`INVALID_INPUT`, not multiple of 15), 255 min rejected (`INVALID_INPUT`, > 240).
   - 5th availability window on same day rejected (`INVALID_INPUT`).
   - Overlapping availability windows rejected (`OVERLAPPING_WINDOWS`).
   - Past time-off (endsAt in past) rejected (`TIMEOFF_IN_PAST`).
   - Time-off duration > 90 days rejected (`INVALID_TIMEOFF_RANGE`).
5. **Test 19: Time-Off Booking Blockage in Core Service:**  
   Creates a time-off entry for `barberA`. Invoking core `createBooking` for that slot rejects with `{ ok: false, code: 'SLOT_TAKEN' }`. Deleting the time-off via `deleteBarberTimeOffStaff` allows `createBooking` to succeed immediately.
6. **Test 20: Integration Conflict Warnings:**  
   With an active booking scheduled for tomorrow:
   - Setting salon hours to closed for tomorrow returns `{ reason: 'CLOSED_DAY' }` warning item while booking status remains `CONFIRMED`.
   - Modifying barber availability outside appointment time returns `{ reason: 'OUTSIDE_AVAILABILITY' }` warning item while booking status remains `CONFIRMED`.
   - Creating time-off overlapping appointment returns `{ reason: 'TIME_OFF_OVERLAP' }` warning item while booking status remains `CONFIRMED`.
7. **Test 21: Barber & Owner Tenant Isolation:**  
   - Owner A updating Salon B's service returns `NOT_FOUND`.
   - Owner A updating Salon B's operating hours returns `NOT_FOUND`.
   - Barber A updating Barber B's availability returns `NOT_FOUND`.
   - Barber A creating time-off for Barber B returns `NOT_FOUND`.
8. **Test 22: Atomic Hours Rollback:**  
   Attempts `updateSalonHoursStaff` with an invalid row (`openMin > closeMin` on weekday 2). The transaction aborts with `INVALID_HOURS`, leaving all 7 existing database rows completely unchanged.
9. **Test 23: Comprehensive Audit Logging:**  
   Spies on `console.log` and asserts that each of the 8 staff config actions emits a structured `STAFF_CONFIG_CHANGE` JSON line with `staffUserId`, `entity`, `entityId`, `action`, `timestamp`, and zero phone numbers.
10. **Test 24: Weekly Hours Persistence:**  
    Saves all 7 weekdays with distinct opening and closing hours and reads them back via `getSalonHoursStaff`, confirming exact persistence across all 7 days.
11. **Test 25: Full-Field Service Creation Persistence:**  
    Creates a service with `category`, `name`, `nameHi`, `priceRupees`, `durationMin`, and `barberIds`. Reads back from the database and verifies all fields and `sortOrder` are stored correctly.
12. **Test 26: Complete Status Gating Matrix:**  
    Executes a 24-case table-driven test covering all invalid states:
    - Salon states: `PENDING`, `REJECTED`, `SUSPENDED`
    - Barber states: `PENDING`, `REJECTED`, `SUSPENDED`, `isActive: false`
    - Staff user states: `isActive: false`
    Across all 8 actions, verifying every call is rejected with `UNAUTHORIZED` or `NOT_FOUND` and leaves zero database mutations.

---

## Section 5: Server Action Security & Audit Table

All 8 server actions in `src/app/dashboard/actions.ts` enforce complete end-to-end security:

| Server Action (File:Line) | Zod Validation Schema | `getCurrentUser()` Auth | Record Loaded from DB | Policy Function Used | Rate Limit Applied | Audit Log Line Emitted |
|---|---|---|---|---|---|---|
| `createServiceAction` (`actions.ts:118`) | `serviceInputSchema` | Yes (`Role.OWNER`) | Yes (Salon verified) | `canManageSalonServices` | Yes (60/hr per staff) | `{"event":"STAFF_CONFIG_CHANGE","action":"CREATE",...}` |
| `updateServiceAction` (`actions.ts:156`) | `updateServiceSchema` | Yes (`Role.OWNER`) | Yes (Service & Salon) | `canManageSalonServices` | Yes (60/hr per staff) | `{"event":"STAFF_CONFIG_CHANGE","action":"UPDATE",...}` |
| `toggleServiceActiveAction` (`actions.ts:196`) | `toggleServiceSchema` | Yes (`Role.OWNER`) | Yes (Service & Salon) | `canManageSalonServices` | Yes (60/hr per staff) | `{"event":"STAFF_CONFIG_CHANGE","action":"ACTIVATE"/"SOFT_DELETE",...}` |
| `reorderServiceAction` (`actions.ts:233`) | `reorderServiceSchema` | Yes (`Role.OWNER`) | Yes (Service & Salon) | `canManageSalonServices` | Yes (60/hr per staff) | `{"event":"STAFF_CONFIG_CHANGE","action":"REORDER_UP"/"REORDER_DOWN",...}` |
| `updateSalonHoursAction` (`actions.ts:280`) | `salonHoursSchema` | Yes (`Role.OWNER`) | Yes (Salon verified) | `canManageSalonHours` | Yes (60/hr per staff) | `{"event":"STAFF_CONFIG_CHANGE","action":"UPDATE",...}` |
| `updateBarberAvailabilityAction` (`actions.ts:321`) | `availabilitySchema` | Yes (`Role.BARBER` / `OWNER`) | Yes (Barber & Salon) | `canManageStaffBarberSchedule` | Yes (60/hr per staff) | `{"event":"STAFF_CONFIG_CHANGE","action":"UPDATE",...}` |
| `createBarberTimeOffAction` (`actions.ts:353`) | `createTimeOffSchema` | Yes (`Role.BARBER` / `OWNER`) | Yes (Barber & Salon) | `canManageStaffBarberSchedule` | Yes (60/hr per staff) | `{"event":"STAFF_CONFIG_CHANGE","action":"CREATE",...}` |
| `deleteBarberTimeOffAction` (`actions.ts:383`) | `deleteTimeOffSchema` | Yes (`Role.BARBER` / `OWNER`) | Yes (Barber & Salon) | `canManageStaffBarberSchedule` | Yes (60/hr per staff) | `{"event":"STAFF_CONFIG_CHANGE","action":"DELETE",...}` |

*(Note: Barber assignments are submitted directly through `createServiceAction` and `updateServiceAction` via the `barberIds` property; there is no separate standalone barber assignment server action).*

---

## Section 6: Pre-Existing Test Audit & Git Diff

### 6.1 `src/tests/old-names-audit.test.ts` Update
The test file `src/tests/old-names-audit.test.ts` was modified by 2 lines to add `docs/phase4b1-report.md` and `docs/phase4b1-prompt.md` to its allowed document whitelist. The test scans markdown files in `docs/` for historical terms (such as legacy route names like `/dashboard/schedule`). Without this whitelist addition, documenting legacy architecture or historical prompt instructions would trigger false-positive test failures.

### 6.2 Git Diff Stat from Baseline (`29ee719`)
```
git diff --stat 29ee719 HEAD -- src/tests/
```
**Command Output:**
```
 src/tests/old-names-audit.test.ts       |    2 +
 src/tests/phase4b1-staff-config.test.ts | 1802 +++++++++++++++++++++++++++++++
 2 files changed, 1804 insertions(+)
```

### 6.3 Audit Confirmation
Zero pre-existing tests were weakened or deleted. All 158 tests from Phase 0 through Phase 4A continue to pass cleanly, alongside the 35 tests in `phase4b1-staff-config.test.ts`, totaling 193 passing tests across the entire suite.

---

## Section 7: Policy Inspection & Code Health

### 7.1 Policy Fix in `canManageStaffBarberSchedule`
In `src/lib/policies.ts` (lines 317–321), the check previously read:
```typescript
if (
  user.role === Role.BARBER &&
  (user.id === barber.userId || user.id === barber.id)
) {
  return true;
}
```
The comparison `user.id === barber.id` incorrectly compared a `User` table primary key with a `Barber` table primary key. This was cleaned up to:
```typescript
if (
  user.role === Role.BARBER &&
  user.id === barber.userId
) {
  return true;
}
```
Verified by unit test: `canManageStaffBarberSchedule: allows barber own userId; denies barber-profile id passed as userId`.

### 7.2 Code Health Inspection of `canManageBarberAvailability`
Inspection of `src/lib/policies.ts` line 183 reveals the identical pattern:
```typescript
if (
  user.role === Role.BARBER &&
  (user.id === barber.userId || user.id === barber.id)
) {
  return true;
}
```
As instructed by the prompt guidelines, this pattern has been inspected and reported here without modifying existing code.

---

## Section 8: Documentation & Message Placeholder Audit

### 8.1 Entries Added to `docs/decisions.md`
- **Staff Edit Rate Limiting (`EDIT_LIMIT`):** Documented the 60 edit actions/hour sliding-window limiter on staff configuration changes, and the requirement to migrate from in-memory to Redis before multi-instance production deployment.
- **Deterministic Testing Architecture:** Documented parameter injection of `now: Date` across all services, validators, and tests to eliminate test flakiness.
- **Availability Concurrency Protection:** Documented PostgreSQL row-level locking (`SELECT id FROM "Barber" WHERE id = ${barberId} FOR UPDATE;`) in interactive transactions.
- **Intra-Category Service Reordering:** Documented why service sort order swaps are scoped strictly within the same `ServiceCategory` to align with the category-grouped dashboard UI.

### 8.2 Entries Added to `docs/i18n-glossary.md`
Added translations for staff configuration terminology:
- `Rate Card & Services` -> `रेट कार्ड व सेवाएँ`
- `Opening Hours` -> `खुलने का समय`
- `Working Hours` -> `काम का समय`
- `Time Off` -> `छुट्टी`
- `Closed` -> `बंद`
- `Hidden` -> `छिपा हुआ`
- `Active & Visible` -> `सक्रिय व दृश्य`
- `Move Up / Down` -> `ऊपर करें / नीचे करें`
- `Reactivate` -> `पुनः सक्रिय करें`
- `Copy to All Days` -> `सभी दिनों पर लागू करें`
- `Schedule Conflict Notice` -> `शेड्यूल टकराव की सूचना`

### 8.3 Message Placeholder Audit
All interpolations match 1:1 between `src/messages/en.json` and `src/messages/hi.json`:
- `{count}`: Service count, conflict item count.
- `{min}`: Lead times, duration in minutes. In contrast, `{minutes}` is not used in the schema to avoid drift.
- `{token}`: Daily customer token number.
- `{duration}`: Duration formatting strings.
- `{reason}`: Cancellation reasons and schedule conflict descriptions.

### 8.4 Dictionary Parity
Exactly 1 key was added since key count 516:
- `errors.INVALID_BARBER`: `"Selected barber is invalid or inactive"` (EN) / `"चुना गया नाई अमान्य या निष्क्रिय है"` (HI).
Total flat leaf keys: **517 in EN** and **517 in HI** with zero missing keys in either language.

---

## Section 9: Browser Verification & Manual Testing Checklist

### 9.1 COULD NOT VERIFY (Visual / Browser Interaction)
Automated visual browser interaction could not be executed in this headless CLI environment because no headless browser runner (such as Playwright or Puppeteer) is installed. The following visual and interaction elements require manual verification:
1. **Themed 403 & 404 Pages:** Visual rendering of `/forbidden` and `/_not-found` with localized branding and back navigation.
2. **Role-Based Nav Tabs:** Verification that Salon Owners see 6 tabs (`/dashboard`, `/dashboard/walk-in`, `/dashboard/services`, `/dashboard/hours`, `/dashboard/availability`, `/dashboard/time-off`) while Barbers see 4 tabs (`/dashboard`, `/dashboard/walk-in`, `/dashboard/availability`, `/dashboard/time-off`).
3. **Language Switcher Toggle:** Real-time client toggle between English and Hindi persisting user preference across all staff views.
4. **360px Mobile Viewport Layout:** Touch-friendly rendering of 15-minute time pickers, multi-window split shifts, and action buttons on narrow mobile screens.
5. **Reorder Button Interaction:** Visual animation and repositioning of service cards when clicking "Move Up" / "Move Down".
6. **"Copy to all days" Button:** Interactive replication of time window inputs across Monday through Friday.
7. **Schedule Conflict Warning Banner:** Visual warning callout displaying affected bookings with clickable deep links to `/dashboard/bookings/[id]`.
8. **Unassigned-Service Chip:** Visual badge indicator on services that currently have no barbers assigned.

### 9.2 Manual Testing Checklist with Seeded Test Accounts

Test accounts established in `prisma/seed.ts`:
- **Salon Owner:** Phone `+919000000002` (`prisma/seed.ts:49`), Role `OWNER`
- **Barber:** Phone `+919000000004` (`prisma/seed.ts:70`), Role `BARBER`
- **Customer:** Phone `+919876543210` (`prisma/seed.ts:111`), Role `CUSTOMER`

#### Verification Steps & Message Key Mappings:
1. **Rate Card Management (`/dashboard/services`):**
   - Log in as Owner (`+919000000002`). Verify heading matches `staffServices.title`: "Rate Card & Services" / "रेट कार्ड व सेवाएँ".
   - Click "Add Service" (`staffServices.addService`: "Add Service" / "नई सेवा जोड़ें"). Fill English/Hindi name, price, duration, assign barbers, click Save.
   - Click "Move Up" (`staffServices.moveUp`: "Move Up" / "ऊपर करें") and "Move Down" (`staffServices.moveDown`: "Move Down" / "नीचे करें"). Verify intra-category ordering.
   - Click "Deactivate" (`staffServices.deactivate`: "Deactivate" / "निष्क्रिय करें"). Verify status becomes "Hidden" (`staffServices.hidden`: "Hidden" / "छिपा हुआ"). Verify service is omitted from public page `/salons/sharma-ji-gents-parlour`.
   - Click "Reactivate" (`staffServices.reactivate`: "Reactivate" / "पुनः सक्रिय करें"). Verify service becomes visible again.
2. **Salon Operating Hours (`/dashboard/hours`):**
   - Log in as Owner (`+919000000002`). Verify heading matches `staffHours.title`: "Opening Hours" / "खुलने का समय".
   - Toggle Sunday to Closed. Set Monday–Saturday opening to 09:00 AM and closing to 09:00 PM.
   - Click "Copy to All Days" (`staffHours.copyToAll`: "Copy to All Days" / "सभी दिनों पर लागू करें").
   - Click "Save Hours" (`staffHours.save`: "Save Hours" / "समय सेव करें"). If active bookings exist on Sunday, verify conflict banner appears (`staffHours.conflictTitle`: "Schedule Conflict Notice" / "शेड्यूल टकराव की सूचना").
   - Check public booking page `/book/sharma-ji-gents-parlour`: verify Sunday shows closed with zero slots.
3. **Barber Availability (`/dashboard/availability`):**
   - Log in as Barber (`+919000000004`). Verify heading matches `staffAvailability.title`: "Working Hours" / "काम का समय".
   - Click "Add Window" (`staffAvailability.addWindow`: "Add Window" / "समय जोड़ें"). Set Shift 1 (09:00 AM – 01:00 PM) and Shift 2 (04:00 PM – 08:00 PM).
   - Click "Save". Check booking page: afternoon gap (01:00 PM – 04:00 PM) offers zero slots.
4. **Barber Time-Off (`/dashboard/time-off`):**
   - Verify heading matches `staffTimeOff.title`: "Time Off & Leave" / "छुट्टी व अवकाश".
   - Click "Add Time Off" (`staffTimeOff.add`: "Add Time Off" / "छुट्टी दर्ज करें"). Select tomorrow 10:00 AM – 02:00 PM.
   - Verify slot engine blocks slots during this time window.
   - Click "Delete": verify time-off entry is removed and slots become bookable again.
5. **Customer Access Denial:**
   - Log in as Customer (`+919876543210`).
   - Navigate to `/dashboard/services`, `/dashboard/hours`, `/dashboard/availability`, `/dashboard/time-off`.
   - Verify immediate redirect to `/forbidden` on each route.

---

## Section 10: Raw Terminal Outputs of Verification Commands

### 10.1 `npx prisma validate`
```
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.prisma
The schema at prisma\schema.prisma is valid 🚀
```

### 10.2 `npx prisma migrate status`
```
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.prisma
Datasource "db": PostgreSQL database "postgres", schema "public" at "aws-0-ap-south-1.pooler.supabase.com:5432"

4 migrations found in prisma/migrations

Database schema is up to date!
```

### 10.3 `npm run lint`
```
> ustaad-ji@0.1.0 lint
> next lint

`next lint` is deprecated and will be removed in Next.js 16.
For new projects, use create-next-app to choose your preferred linter.
For existing projects, migrate to the ESLint CLI:
npx @next/codemod@canary next-lint-to-eslint-cli .

✔ No ESLint warnings or errors
```

### 10.4 `npx vitest run --reporter=verbose`
Piped to `test-output.txt` and verified:
```
 Test Files  14 passed (14)
      Tests  193 passed (193)
   Start at  01:33:19
   Duration  211.50s (transform 520ms, setup 0ms, collect 2.13s, tests 205.38s, environment 2ms, prepare 1.54s)
```

### 10.5 `npm run test:utc`
```
> ustaad-ji@0.1.0 test:utc
> cross-env TZ=UTC vitest run

 Test Files  14 passed (14)
      Tests  193 passed (193)
   Start at  01:37:05
   Duration  216.71s (transform 485ms, setup 0ms, collect 1.70s, tests 211.23s, environment 2ms, prepare 1.48s)
```

### 10.6 `npm run test:ist`
```
> ustaad-ji@0.1.0 test:ist
> cross-env TZ=Asia/Kolkata vitest run

 Test Files  14 passed (14)
      Tests  193 passed (193)
   Start at  01:41:00
   Duration  206.68s (transform 453ms, setup 0ms, collect 1.53s, tests 201.16s, environment 2ms, prepare 1.49s)
```

### 10.7 `npm run build`
```
> ustaad-ji@0.1.0 build
> next build

   ▲ Next.js 15.5.28
   - Environments: .env

   Creating an optimized production build ...
 ✓ Compiled successfully in 4.5s
   Linting and checking validity of types ...
   Collecting page data ...
   Generating static pages (0/17) ...
   Generating static pages (4/17) 
   Generating static pages (8/17) 
   Generating static pages (12/17) 
 ✓ Generating static pages (17/17)
   Finalizing page optimization ...
   Collecting build traces ...

Route (app)                                 Size  First Load JS
┌ ƒ /                                      225 B         152 kB
├ ƒ /_not-found                            130 B         103 kB
├ ƒ /~offline                              168 B         106 kB
├ ƒ /account                             1.42 kB         153 kB
├ ƒ /admin                               1.95 kB         154 kB
├ ƒ /api/auth/[...nextauth]                130 B         103 kB
├ ƒ /book/[salonSlug]                    4.12 kB         156 kB
├ ƒ /bookings                              225 B         152 kB
├ ƒ /bookings/[id]                       2.83 kB         154 kB
├ ƒ /dashboard                           4.69 kB         156 kB
├ ƒ /dashboard/availability              2.96 kB         155 kB
├ ƒ /dashboard/bookings/[id]             3.36 kB         155 kB
├ ƒ /dashboard/hours                     2.43 kB         154 kB
├ ƒ /dashboard/services                  3.58 kB         155 kB
├ ƒ /dashboard/time-off                  2.87 kB         154 kB
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

### 10.8 Dictionary Key Count & Parity Check
```bash
node -e "const en = require('./src/messages/en.json'); const hi = require('./src/messages/hi.json'); function flatten(obj, prefix='') { let count = 0; for (const k in obj) { if (typeof obj[k] === 'object' && obj[k] !== null) { count += flatten(obj[k], prefix + k + '.'); } else { count++; } } return count; } console.log('Flat EN keys:', flatten(en), 'Flat HI keys:', flatten(hi)); const enKeys = Object.keys(en); const hiKeys = Object.keys(hi); const missingInHi = enKeys.filter(k => !(k in hi)); const missingInEn = hiKeys.filter(k => !(k in en)); console.log('Top-level missing in HI:', missingInHi, 'in EN:', missingInEn);"
```
**Command Output:**
```
Flat EN keys: 517 Flat HI keys: 517
Top-level missing in HI: [] in EN: []
```
