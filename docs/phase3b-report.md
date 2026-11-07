# PHASE 3B FINAL REPORT: Rename to "Ustaad-Ji" and English / Hindi Language Switching

**Project:** Ustaad-Ji (उस्ताद जी)  
**Execution Date:** November 3, 2026  
**Status:** COMPLETE (Zero Database Migrations, 100% Type-Safe Build, All 110 Automated Tests Passing)

---

## 1. Section 0: External Images Audit

An audit of all UI components, stylesheets, and layouts confirmed the following image usage:

1. **Barber Headshot / Avatar Images (`src/components/ui/UstaadCard.tsx:63`):**
   - Implemented as `<img src={barber.photoUrl} alt={barber.displayName} className="..." />`.
   - **Current State in Development/Seeding:** Seeded as inline base64/SVG data URIs (`data:image/svg+xml;utf8,...`), which load without external network calls.
   - **Production Capability:** In production, salons/barbers can provide external HTTPS URLs (e.g. Unsplash, Cloudinary, AWS S3).
2. **CSP Configuration (`next.config.ts`):**
   - The Content Security Policy explicitly includes:
     ```text
     img-src 'self' blob: data: https:;
     ```
     This allows local assets (`'self'`), client-side rendered preview canvases (`blob:`), seeded SVG avatars (`data:`), and external HTTPS profile photos (`https:`).
3. **Icons & Decorative Elements:**
   - Barber poles, badges, scissors, razor stamps, and dividers are rendered via pure SVG components and inline CSS gradients (`repeating-linear-gradient`), requiring zero external network image requests.

---

## 2. Brand Identity & Taglines

### Selected Official Identity
- **Product Name (English):** `Ustaad-Ji`
- **Product Name (Hindi):** `उस्ताद जी`
- **English Tagline:** `No more waiting in line. Book your slot.`
- **Hindi Tagline:** `अब लाइन में नहीं, स्लॉट में`

### Full Evaluated Tagline Proposals & Rationale

| # | English Tagline | Hindi Tagline | Evaluation & Rationale |
| :--- | :--- | :--- | :--- |
| **1 (Selected)** | **No more waiting in line. Book your slot.** | **अब लाइन में नहीं, स्लॉट में** | **Winner:** Directly highlights the core value proposition (eliminating queues) in snappy, colloquial language without sounding bureaucratic. |
| 2 | Neighbourhood master barbers, booked in seconds. | गली-मुहल्ले के उस्ताद, अब सीधे आपके स्लॉट में। | Highly descriptive of local parlours, but slightly longer on small mobile signboards. |
| 3 | Real register diary. Guaranteed digital token. | असली रजिस्टर डायरी, पक्का डिजिटल टोकन। | Strong physical metaphor resonance; preserved as section headers on the diary slot picker. |
| 4 | Your chair is ready. Skip the salon rush. | आपकी कुर्सी तैयार है। सैलून की भीड़ को कहें अलविदा। | Friendly and warm tone; ideal for push notifications and SMS reminders in Phase 4. |

---

## 3. Exact Production Content Security Policy (CSP)

Extracted directly from `next.config.ts`:

```text
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests;
```

---

## 4. Architectural Summary

1. **True Single-Language Rendering:**
   - Stacked English/Hindi pairings and slash pairs (e.g. `Rate Card / रेट कार्ड`, `Salons Dekhein / सैलून देखें`) have been completely removed.
   - Every view renders exclusively in the active locale.
   - The navbar language toggle displays the name of the *other* language ("हिन्दी" in English mode, "English" in Hindi mode) with clear `aria-label` accessibility.
2. **Cookie-First Resolution & Account Sync:**
   - Resolved via pure function `resolveLocale(cookieLocale, userLanguage)`.
   - Synchronized with `User.language` upon login and account profile updates.
   - Clean route URLs without path prefixes (`/salons`, `/book/[salonSlug]`).
3. **Preservation of In-Progress Booking State:**
   - Language toggling executes a server action setting `NEXT_LOCALE` followed by `router.refresh()`.
   - Active client selections (`services`, `barber`, `date`, `slot`) remain in React state and synchronized with URL search parameters.
4. **Strict Latin Digits & Currency:**
   - Latin numerals (`0-9`) and `₹` symbol are used in both English and Hindi modes (`-u-nu-latn`).
5. **Entity Fallback:**
   - `getLocalizedName(entity, locale)` safely displays `nameHi` in Hindi mode with immediate fallback to `name`.
6. **Authoritative Glossary:**
   - Full glossary published in `docs/i18n-glossary.md`.

---

## 5. Verification Commands Status

| Verification Command | Exit Code | Result |
| :--- | :--- | :--- |
| `npx prisma validate` | 0 | Schema is valid (zero schema modifications) |
| `npx prisma migrate status` | 0 | Database schema up to date (zero migrations) |
| `npm run lint` | 0 | 0 warnings, 0 errors |
| `npm run test` (Vitest full suite) | 0 | 110 passed across 7 test suites |
| `npm run test:utc` | 0 | 110 passed (timezone independent) |
| `npm run test:ist` | 0 | 110 passed (IST verified) |
| `npm run build` | 0 | 12 routes generated and optimized |

---

## 6. Complete Unedited Raw Terminal Dump (`test-output.txt`)

```text
 RUN  v3.2.7 D:/Indian-salon-booking

  ✓ src/tests/phase3-booking.test.ts > Phase 3: Real Slot Booking & Policy Tests > Policy: canCreateBooking > allows active CUSTOMER to create booking 1ms
  ✓ src/tests/phase3-booking.test.ts > Phase 3: Real Slot Booking & Policy Tests > Policy: canCreateBooking > denies inactive CUSTOMER 0ms
  ✓ src/tests/phase3-booking.test.ts > Phase 3: Real Slot Booking & Policy Tests > Policy: canCreateBooking > denies BARBER, OWNER, ADMIN from creating customer bookings 0ms
  ✓ src/tests/phase3-booking.test.ts > Phase 3: Real Slot Booking & Policy Tests > Policy: canCreateBooking > denies unauthenticated or null user 0ms
  ✓ src/tests/phase3-booking.test.ts > Phase 3: Real Slot Booking & Policy Tests > Policy: canRescheduleBooking > allows the customer who owns the booking 0ms
  ✓ src/tests/phase3-booking.test.ts > Phase 3: Real Slot Booking & Policy Tests > Policy: canRescheduleBooking > denies another customer from rescheduling 0ms
  ✓ src/tests/phase3-booking.test.ts > Phase 3: Real Slot Booking & Policy Tests > Policy: canRescheduleBooking > denies assigned barber and salon owner (customer self-serve only) 0ms
  ✓ src/tests/phase3-booking.test.ts > Phase 3: Real Slot Booking & Policy Tests > Policy: canRescheduleBooking > allows ADMIN to reschedule 0ms
  ✓ src/tests/phase3-booking.test.ts > Phase 3: Real Slot Booking & Policy Tests > Booking Integration & Concurrency on Supabase > prevents double booking in a 5-way parallel race (exactly 1 wins, 4 get SLOT_TAKEN) 6140ms
  ✓ src/tests/phase3-booking.test.ts > Phase 3: Real Slot Booking & Policy Tests > Booking Integration & Concurrency on Supabase > enforces MAX_ACTIVE_BOOKINGS_PER_CUSTOMER limit 1070ms
  ✓ src/tests/phase3-booking.test.ts > Phase 3: Real Slot Booking & Policy Tests > Booking Integration & Concurrency on Supabase > prevents customer from booking overlapping slots across any barber or salon 1237ms
  ✓ src/tests/phase3-booking.test.ts > Phase 3: Real Slot Booking & Policy Tests > Booking Integration & Concurrency on Supabase > allows customer to cancel > 60 min before start, but rejects within 60 min cutoff 1717ms
  ✓ src/tests/phase3-booking.test.ts > Phase 3: Real Slot Booking & Policy Tests > Booking Integration & Concurrency on Supabase > reschedules successfully inside a transaction, and rolls back if new slot is taken 2827ms
  ✓ src/tests/phase3-booking.test.ts > Phase 3: Real Slot Booking & Policy Tests > Booking Integration & Concurrency on Supabase > strictly isolates booking access between customers and barbers 1679ms
  ✓ src/tests/phase3-booking.test.ts > Phase 3: Real Slot Booking & Policy Tests > Booking Integration & Concurrency on Supabase > Rule 1: rejects booking requests for off-grid start times (e.g. 10:07) 121ms
  ✓ src/tests/phase3-booking.test.ts > Phase 3: Real Slot Booking & Policy Tests > Booking Integration & Concurrency on Supabase > Rule 2: rejects booking requests for times outside operational salon or barber hours 1023ms
  ✓ src/tests/phase3-booking.test.ts > Phase 3: Real Slot Booking & Policy Tests > Booking Integration & Concurrency on Supabase > Rule 3: rejects booking requests in the past or beyond the 14-day advance window 121ms
  ✓ src/tests/phase3-booking.test.ts > Phase 3: Real Slot Booking & Policy Tests > Booking Integration & Concurrency on Supabase > Rule 4: rejects services belonging to a different salon 1440ms
  ✓ src/tests/phase3-booking.test.ts > Phase 3: Real Slot Booking & Policy Tests > Booking Integration & Concurrency on Supabase > Rule 5: rejects barbers not mapped to all selected services via BarberService 1252ms
  ✓ src/tests/phase3-booking.test.ts > Phase 3: Real Slot Booking & Policy Tests > Booking Integration & Concurrency on Supabase > Rule 6: rejects unverified, rejected, or suspended salons and barbers 843ms
  ✓ src/tests/phase3-booking.test.ts > Phase 3: Real Slot Booking & Policy Tests > Booking Integration & Concurrency on Supabase > Rule 7: rejects inactive services (isActive: false) 1488ms
  ✓ src/tests/phase3-booking.test.ts > Phase 3: Real Slot Booking & Policy Tests > Booking Integration & Concurrency on Supabase > Rule 8: rejects empty services array and duplicate service IDs 120ms
  ✓ src/tests/phase3-booking.test.ts > Phase 3: Real Slot Booking & Policy Tests > Booking Integration & Concurrency on Supabase > Rule 9: computes tamper-proof pricing and duration solely from database records 2024ms
  ✓ src/tests/phase3-booking.test.ts > Phase 3: Real Slot Booking & Policy Tests > Booking Integration & Concurrency on Supabase > Rule 10 & 11: allocates sequential daily tokens and rolls back counter on transaction failure 5240ms
  ✓ src/tests/phase3-booking.test.ts > Phase 3: Real Slot Booking & Policy Tests > Booking Integration & Concurrency on Supabase > Rule 12: creates bookings with status PENDING when salon.requiresApproval is true 2260ms
  ✓ src/tests/phase3-booking.test.ts > Phase 3: Real Slot Booking & Policy Tests > Booking Integration & Concurrency on Supabase > Rule 13: blocks customers exceeding MAX_BOOKINGS_CREATED_PER_HOUR (5 bookings/hour) 1207ms
  ✓ src/tests/phase3-booking.test.ts > Phase 3: Real Slot Booking & Policy Tests > Booking Integration & Concurrency on Supabase > Rule 14: allows staff to cancel at any time with mandatory non-empty reason; rejects empty reason 1084ms
  ✓ src/tests/phase3-booking.test.ts > Phase 3: Real Slot Booking & Policy Tests > Booking Integration & Concurrency on Supabase > Rule 15: slot reuse: cancelling a booking immediately frees that slot for new reservations 4712ms
  ✓ src/tests/phase3-booking.test.ts > Phase 3: Real Slot Booking & Policy Tests > Booking Integration & Concurrency on Supabase > Rule 16: double-submission guard: concurrent identical booking submissions produce exactly one booking 3028ms
  ✓ src/tests/phase3-booking.test.ts > Phase 3: Real Slot Booking & Policy Tests > Booking Integration & Concurrency on Supabase > Rule 17: role validation in core service: rejects createBooking for non-customer roles directly in createBooking 243ms
  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Phone Normalisation (normalizeIndianPhone) > accepts standard 10-digit Indian mobile numbers and normalises to E.164 4ms
  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Phone Normalisation (normalizeIndianPhone) > accepts numbers with +91 prefix and formatting characters (spaces, dashes) 1ms
  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Phone Normalisation (normalizeIndianPhone) > accepts numbers with leading 0 (trunk prefix) 0ms
  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Phone Normalisation (normalizeIndianPhone) > accepts numbers starting with 91 without plus 0ms
  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Phone Normalisation (normalizeIndianPhone) > rejects numbers that are too short 0ms
  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Phone Normalisation (normalizeIndianPhone) > rejects strings containing letters 0ms
  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Phone Normalisation (normalizeIndianPhone) > rejects landline numbers in India 0ms
  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Open Redirect Protection (validateCallbackUrl) > allows valid relative paths 0ms
  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Open Redirect Protection (validateCallbackUrl) > rejects protocol-relative URLs starting with // 0ms
  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Open Redirect Protection (validateCallbackUrl) > rejects absolute URLs starting with http:// or https:// 0ms
  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Open Redirect Protection (validateCallbackUrl) > rejects URLs containing backslashes 0ms
  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Open Redirect Protection (validateCallbackUrl) > returns null for empty, whitespace, or invalid types 0ms
  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Test OTP Guard & Environment Validation > accepts test OTP 123456 only for seeded numbers in development 0ms
  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Test OTP Guard & Environment Validation > rejects test OTP when APP_ENV is production 0ms
  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Test OTP Guard & Environment Validation > startup validation throws if ALLOW_TEST_OTP is true while APP_ENV=production or NODE_ENV=production 2ms
  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Test OTP Guard & Environment Validation > startup validation throws when AUTH_SECRET is missing or empty outside tests 1ms
  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Test OTP Guard & Environment Validation > startup validation throws when OTP_PEPPER is missing or empty outside tests 1ms
  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Central Policy Module (src/lib/policies.ts) > allows booking viewing only to customer owner, assigned barber, salon owner, or admin 0ms
  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Central Policy Module (src/lib/policies.ts) > allows updating booking status only to assigned barber, salon owner, or admin (customers cannot) 0ms
  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Central Policy Module (src/lib/policies.ts) > allows cancelling a booking to owning customer, assigned barber, salon owner, or admin 0ms
  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Central Policy Module (src/lib/policies.ts) > allows managing a salon only to its owner or admin 0ms
  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Central Policy Module (src/lib/policies.ts) > enforces same-salon barber isolation: Barber A cannot view or update Barber B booking in the same salon 0ms
  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Central Policy Module (src/lib/policies.ts) > enforces cross-salon owner isolation: Owner of Salon A cannot view or update bookings belonging to Salon B 0ms
  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Central Policy Module (src/lib/policies.ts) > enforces canManageBarber and canManageBarberAvailability granularity 0ms
  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Central Policy Module (src/lib/policies.ts) > restricts admin actions strictly to ADMIN role 0ms
  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > generates HMAC hash and uses constant-time compare 435ms
stdout | src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > issues OTP, stores only hash, and allows single-use verification
[ConsoleOtpSender] OTP for +919876599999 (+91******9999): 899917

  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > issues OTP, stores only hash, and allows single-use verification 1193ms
  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > rejects expired OTP code 505ms
  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > 5 wrong attempts invalidate the code even if the correct code follows 1519ms
stdout | src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > issuing a newer OTP invalidates previous unconsumed codes
[ConsoleOtpSender] OTP for +919876599999 (+91******9999): 587202

stdout | src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > issuing a newer OTP invalidates previous unconsumed codes
[ConsoleOtpSender] OTP for +919876599999 (+91******9999): 701334

  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > issuing a newer OTP invalidates previous unconsumed codes 1332ms
stdout | src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > enforces 30s resend cooldown for the same phone
[ConsoleOtpSender] OTP for +919876599999 (+91******9999): 638803

  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > enforces 30s resend cooldown for the same phone 652ms
  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > enforces max 3 OTP requests per phone per 10 minutes 436ms
stdout | src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > enforces IP rate limits for OTP requests and verification attempts
[ConsoleOtpSender] OTP for +919870000000 (+91******0000): 988154

stdout | src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > enforces IP rate limits for OTP requests and verification attempts
[ConsoleOtpSender] OTP for +919870000001 (+91******0001): 995000

stdout | src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > enforces IP rate limits for OTP requests and verification attempts
[ConsoleOtpSender] OTP for +919870000002 (+91******0002): 265159

stdout | src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > enforces IP rate limits for OTP requests and verification attempts
[ConsoleOtpSender] OTP for +919870000003 (+91******0003): 144441

stdout | src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > enforces IP rate limits for OTP requests and verification attempts
[ConsoleOtpSender] OTP for +919870000004 (+91******0004): 802637

stdout | src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > enforces IP rate limits for OTP requests and verification attempts
[ConsoleOtpSender] OTP for +919870000005 (+91******0005): 601002

stdout | src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > enforces IP rate limits for OTP requests and verification attempts
[ConsoleOtpSender] OTP for +919870000006 (+91******0006): 330472

stdout | src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > enforces IP rate limits for OTP requests and verification attempts
[ConsoleOtpSender] OTP for +919870000007 (+91******0007): 426154

stdout | src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > enforces IP rate limits for OTP requests and verification attempts
[ConsoleOtpSender] OTP for +919870000008 (+91******0008): 138612

stdout | src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > enforces IP rate limits for OTP requests and verification attempts
[ConsoleOtpSender] OTP for +919870000009 (+91******0009): 511818

  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > enforces IP rate limits for OTP requests and verification attempts 4000ms
  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Integration Flow & Database Role Verification > new phone login creates a CUSTOMER role; cannot escalate own role 292ms
  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Integration Flow & Database Role Verification > existing barber logging in keeps BARBER role 148ms
  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Integration Flow & Database Role Verification > deactivated user cannot log in and has null access 296ms
  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Integration Flow & Database Role Verification > admin approve action verifies pending salon, making it visible publicly; suspend hides it 1911ms
  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Integration Flow & Database Role Verification > prevents mass-assignment / role escalation on account update: role field is stripped and remains CUSTOMER 609ms
  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Integration Flow & Database Role Verification > enforces immediate deactivation via getCurrentUser: active user returns profile, deactivated user returns null 891ms
  ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Integration Flow & Database Role Verification > creates new users with default language "en" matching schema.prisma definition 292ms
stdout | src/tests/db-constraints.test.ts > Database Constraints & Exclusion Rules (PostgreSQL Supabase) > rejects two overlapping active bookings for the same barber with Postgres error 23P01
prisma:error 
Invalid `db.booking.create()` invocation in
D:\Indian-salon-booking\src\tests\db-constraints.test.ts:91:24

  88 let is23P01 = false;
  89 
  90 try {
→ 91   await db.booking.create(
Error occurred during query execution:
ConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: "23P01", message: "conflicting key value violates exclusion constraint \"booking_no_overlap\"", severity: "ERROR", detail: Some("Key (\"barberId\", tstzrange(\"startsAt\", \"endsAt\", '[)'::text))=(cmvy1xhh60017vbjoap8izvv2, [\"2099-01-15 10:30:00+00\",\"2099-01-15 11:15:00+00\")) conflicts with existing key (\"barberId\", tstzrange(\"startsAt\", \"endsAt\", '[)'::text))=(cmvy1xhh60017vbjoap8izvv2, [\"2099-01-15 10:00:00+00\",\"2099-01-15 10:45:00+00\"))."), column: None, hint: None }), transient: false })

  ✓ src/tests/db-constraints.test.ts > Database Constraints & Exclusion Rules (PostgreSQL Supabase) > rejects two overlapping active bookings for the same barber with Postgres error 23P01 520ms
  ✓ src/tests/db-constraints.test.ts > Database Constraints & Exclusion Rules (PostgreSQL Supabase) > allows back-to-back bookings where one ends exactly when the next starts 492ms
  ✓ src/tests/db-constraints.test.ts > Database Constraints & Exclusion Rules (PostgreSQL Supabase) > allows a new booking on a slot that was previously CANCELLED 487ms
stdout | src/tests/db-constraints.test.ts > Database Constraints & Exclusion Rules (PostgreSQL Supabase) > rejects a booking where endsAt <= startsAt with check constraint error
prisma:error 
Invalid `db.booking.create()` invocation in
D:\Indian-salon-booking\src\tests\db-constraints.test.ts:218:24

  215 let isTimeOrderViolation = false;
  216 
  217 try {
→ 218   await db.booking.create(
Error occurred during query execution:
ConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: "23514", message: "new row for relation \"Booking\" violates check constraint \"booking_time_order\"", severity: "ERROR", detail: Some("Failing row contains (cmvzw1wqn000dvbikdl0t035p, 507, 2099-01-15, cmvy1xfzo000bvbjoxvj5lez7, cmvy1xhh60017vbjoap8izvv2, cmvy1xfpi0007vbjoam9be936, null, null, IN_SALON, ONLINE, CONFIRMED, 2099-01-15 16:00:00+00, 2099-01-15 15:30:00+00, 100, null, null, null, null, null, null, null, 2026-11-02 23:26:55.487+00, 2026-11-02 23:26:55.487+00)."), column: None, hint: None }), transient: false })

  ✓ src/tests/db-constraints.test.ts > Database Constraints & Exclusion Rules (PostgreSQL Supabase) > rejects a booking where endsAt <= startsAt with check constraint error 128ms
  ✓ src/tests/phase1-ui.test.ts > Phase 1 Public Salon Queries & Security Verification > returns verified salons (Sharma Ji Gents Parlour) and strictly excludes pending salons (Royal Ustaad) 1094ms
  ✓ src/tests/phase1-ui.test.ts > Phase 1 Public Salon Queries & Security Verification > getSalonBySlug returns verified salon and returns null for pending or missing salon 827ms
  ✓ src/tests/phase1-ui.test.ts > Phase 1 Service Grouping & Calculation Logic > groups services accurately by ServiceCategory 0ms
  ✓ src/tests/phase1-ui.test.ts > Phase 1 Service Grouping & Calculation Logic > calculates total price and duration accurately for multiple selected service IDs 1ms
  ✓ src/tests/phase1-ui.test.ts > Phase 1 Service Grouping & Calculation Logic > returns zero values when no services are selected 0ms
  ✓ src/tests/phase1-ui.test.ts > Phase 1 Time Helpers Verification > formats minutes from midnight into 12-hour AM/PM format 0ms
  ✓ src/tests/phase1-ui.test.ts > Phase 1 Time Helpers Verification > correctly determines if salon is open or closed based on hours 0ms
  ✓ src/tests/phase0-db.test.ts > Phase 0 Database & Constraint Verification > verifies seeded salons, barbers and services exist 395ms
stdout | src/tests/phase0-db.test.ts > Phase 0 Database & Constraint Verification > rejects overlapping CONFIRMED bookings with Postgres exclusion constraint 23P01 (booking_no_overlap)
prisma:error 
Invalid `db.booking.create()` invocation in
D:\Indian-salon-booking\src\tests\phase0-db.test.ts:115:24

  112 let errorMessage = '';
  113 
  114 try {
→ 115   await db.booking.create(
Error occurred during query execution:
ConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: "23P01", message: "conflicting key value violates exclusion constraint \"booking_no_overlap\"", severity: "ERROR", detail: Some("Key (\"barberId\", tstzrange(\"startsAt\", \"endsAt\", '[)'::text))=(cmvy1xhh60017vbjoap8izvv2, [\"2099-12-31 10:30:00+00\",\"2099-12-31 11:00:00+00\")) conflicts with existing key (\"barberId\", tstzrange(\"startsAt\", \"endsAt\", '[)'::text))=(cmvy1xhh60017vbjoap8izvv2, [\"2099-12-31 10:00:00+00\",\"2099-12-31 10:45:00+00\"))."), column: None, hint: None }), transient: false })

  ✓ src/tests/phase0-db.test.ts > Phase 0 Database & Constraint Verification > rejects overlapping CONFIRMED bookings with Postgres exclusion constraint 23P01 (booking_no_overlap) 298ms
  ✓ src/tests/phase3b-i18n.test.ts > Phase 3B: Internationalization (i18n) Suite > 1. Dictionary Key & Placeholder Parity (en.json vs hi.json) > en.json and hi.json must have the exact same message keys 2ms
  ✓ src/tests/phase3b-i18n.test.ts > Phase 3B: Internationalization (i18n) Suite > 1. Dictionary Key & Placeholder Parity (en.json vs hi.json) > all message values must be non-empty strings 7ms
  ✓ src/tests/phase3b-i18n.test.ts > Phase 3B: Internationalization (i18n) Suite > 1. Dictionary Key & Placeholder Parity (en.json vs hi.json) > any {placeholder} variables must match between en.json and hi.json 4ms
  ✓ src/tests/phase3b-i18n.test.ts > Phase 3B: Internationalization (i18n) Suite > 2. Locale Resolution & Validation > locales array contains only "en" and "hi" 0ms
  ✓ src/tests/phase3b-i18n.test.ts > Phase 3B: Internationalization (i18n) Suite > 2. Locale Resolution & Validation > isValidLocale() correctly identifies valid and invalid locales 0ms
  ✓ src/tests/phase3b-i18n.test.ts > Phase 3B: Internationalization (i18n) Suite > 2. Locale Resolution & Validation > resolveLocale() prioritizes valid cookie over user preference 0ms
  ✓ src/tests/phase3b-i18n.test.ts > Phase 3B: Internationalization (i18n) Suite > 2. Locale Resolution & Validation > resolveLocale() falls back to user language when cookie is missing or invalid 0ms
  ✓ src/tests/phase3b-i18n.test.ts > Phase 3B: Internationalization (i18n) Suite > 2. Locale Resolution & Validation > resolveLocale() falls back to defaultLocale ("en") when both are missing or invalid 0ms
  ✓ src/tests/phase3b-i18n.test.ts > Phase 3B: Internationalization (i18n) Suite > 3. Single-field Entity Fallback (getLocalizedName) > returns nameHi when locale is "hi" and nameHi exists 0ms
  ✓ src/tests/phase3b-i18n.test.ts > Phase 3B: Internationalization (i18n) Suite > 3. Single-field Entity Fallback (getLocalizedName) > returns English name when locale is "en" even if nameHi exists 0ms
  ✓ src/tests/phase3b-i18n.test.ts > Phase 3B: Internationalization (i18n) Suite > 3. Single-field Entity Fallback (getLocalizedName) > falls back to English name when locale is "hi" but nameHi is null or whitespace 0ms
  ✓ src/tests/phase3b-i18n.test.ts > Phase 3B: Internationalization (i18n) Suite > 3. Single-field Entity Fallback (getLocalizedName) > handles entity without nameHi field gracefully 0ms
  ✓ src/tests/phase3b-i18n.test.ts > Phase 3B: Internationalization (i18n) Suite > 4. Server Error Codes Dictionary Coverage > all system error codes have entries in both en.json and hi.json 1ms
  ✓ src/tests/phase3b-i18n.test.ts > Phase 3B: Internationalization (i18n) Suite > 5. Component Audit: Zero Hardcoded Bilingual Slash Pairs & Old Branding > contains no forbidden bilingual slash pairings (e.g. " / ") in UI component files 4ms
  ✓ src/tests/phase3b-i18n.test.ts > Phase 3B: Internationalization (i18n) Suite > 5. Component Audit: Zero Hardcoded Bilingual Slash Pairs & Old Branding > contains no obsolete branding "Indian Salon Booking" in UI component files 3ms
  ✓ src/tests/phase3-slots.test.ts > Phase 3: Slot Generation (generateSlots) > generates 15-minute grid slots for full day with lead time marking past slots 2ms
  ✓ src/tests/phase3-slots.test.ts > Phase 3: Slot Generation (generateSlots) > handles split shifts correctly with no slots in between shifts 0ms
  ✓ src/tests/phase3-slots.test.ts > Phase 3: Slot Generation (generateSlots) > clips barber availability to salon operating hours 0ms
  ✓ src/tests/phase3-slots.test.ts > Phase 3: Slot Generation (generateSlots) > marks slots as too_short when duration exceeds window closing boundary 0ms
  ✓ src/tests/phase3-slots.test.ts > Phase 3: Slot Generation (generateSlots) > blocks slots overlapping with TimeOff 0ms
  ✓ src/tests/phase3-slots.test.ts > Phase 3: Slot Generation (generateSlots) > blocks slots overlapping active bookings, but ignores cancelled bookings 0ms
  ✓ src/tests/phase3-slots.test.ts > Phase 3: Slot Generation (generateSlots) > returns empty array when salon is closed or date is out of range 1ms
  ✓ src/tests/phase3-slots.test.ts > Phase 3: Slot Generation (generateSlots) > handles multi-hour duration (e.g. 75 min and 135 min) 1ms
  ✓ src/tests/phase3-slots.test.ts > Phase 3: Slot Generation (generateSlots) > boundary back-to-back: slot starting at 10:45 is available when preceding booking ends at 10:45 0ms
  ✓ src/tests/phase3-slots.test.ts > Phase 3: Slot Generation (generateSlots) > exact closing boundary: 30-min slot ending exactly at closing is allowed; ending at close + 1 min is flagged too_short 0ms
  ✓ src/tests/phase3-slots.test.ts > Phase 3: Slot Generation (generateSlots) > varying durations: generates valid slots for 15-minute and 45-minute service durations across regular windows 0ms
  ✓ src/tests/phase3-slots.test.ts > Phase 3: Slot Generation (generateSlots) > day window boundaries: Day 14 returns valid slots; Day 15 returns an empty array [] 0ms

 Test Files  7 passed (7)
      Tests  110 passed (110)
   Start at  04:55:50
   Duration  70.36s (transform 231ms, setup 0ms, collect 1.01s, tests 67.21s, environment 1ms, prepare 745ms)
```

---

## 7. Honest "Could Not Verify" & Manual Inspection Checklist

While all 110 automated unit, integration, and database tests pass, and the Next.js production build succeeds with zero errors, the following items require manual visual or device verification:

- [ ] **First-visit Modal Display on Pure Incognito:**
  - Launch a fresh incognito browser window (clearing all cookies and `sessionStorage`).
  - Navigate to `http://localhost:3000/`.
  - Confirm the centered first-visit language modal overlay appears with focus trapped.
  - If browser system language is Hindi (`hi` / `hi-IN`), verify the Hindi card is highlighted by default.
  - Clicking "हिन्दी" or "English" sets `NEXT_LOCALE` cookie and smoothly closes the modal without re-prompting on page refresh.
- [ ] **Language Toggle Preserves Active Slot in Booking Flow:**
  - Navigate to `/book/sharma-ji-gents-parlour`.
  - Select 2 services, choose barber *Ustaad Rakesh Sharma*, select tomorrow's date, and pick a time slot (e.g. `11:00 AM`).
  - Notice the URL query parameters update to `?services=...&barber=...&date=...&slot=...`.
  - Click the language toggle button in the header (e.g. "हिन्दी").
  - Verify the page text translates to Hindi while the selected services, barber, date, and chosen `11:00` slot remain selected.
- [ ] **Token Slip Image Generation in Mobile Browser:**
  - Open `/bookings/[id]` on an iOS Safari or Android Chrome device.
  - Click "Save as Image" / "पर्ची डाउनलोड करें".
  - Verify `html2canvas` captures the slip and triggers the PNG file download without layout shifts.
- [ ] **WhatsApp Share Deep Link:**
  - Click "Share on WhatsApp" / "व्हाट्सएप पर भेजें".
  - Verify it opens `https://wa.me/?text=...` with the translated confirmation message containing the localized salon name and token number.
