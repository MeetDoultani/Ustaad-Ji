# Phase 2 Verification & Follow-Up Audit Report: Authentication, Roles and Authorization

**Project:** Indian Salon Booking Website (देसी सैलून, डिजिटल टोकन)  
**Date:** November 1, 2026  
**Status:** Complete & Fully Verified  

---

## 1. Executive Summary

This report documents the implementation, follow-up audit, and verification of **Phase 2: Authentication, Roles, and Authorization** for the Indian Salon Booking web application. 

The application implements a custom phone-number and OTP authentication system using **Auth.js v5 beta** (pinned to `next-auth@5.0.0-beta.25`), paired with JWT sessions, strict server-side database role verification, pure authorization policy functions, an authentic Indian neighbourhood salon styled login UI, role-protected shell pages, and an administrative approval console.

All code has passed strict linting, type checking, production compilation, and a 53-test Vitest suite with 100% pass rate.

---

## 2. Phase 2 Implementation & Follow-Up Audit

| Item | Area | Implemented Details |
| :--- | :--- | :--- |
| **1. Session & Auth Design** | Core Auth & Secrets | Installed `next-auth@5.0.0-beta.25`. Configured Credentials provider (`phone-otp`) with JWT session strategy (7-day max-age, httpOnly, secure in production, lax sameSite). Built `src/lib/env.ts` startup safety guard requiring 32-byte base64 `AUTH_SECRET` and `OTP_PEPPER`. Built `getCurrentUser()`, `requireUser()`, and `requireRole()` in `src/lib/auth-server.ts` which always queries PostgreSQL live by ID so deactivation/role changes take effect instantaneously. |
| **2. Phone Numbers** | Normalization | Installed `libphonenumber-js`. Created `src/lib/phone.ts` (`normalizeIndianPhone`) supporting 10-digit, `+91`, `91`, and `0` prefixes, normalizing to E.164 (`+91XXXXXXXXXX`), and rejecting landlines and invalid input. |
| **3. Rate Limiting & OTP** | Security & Delivery | Created `src/lib/otp.ts` using HMAC-SHA256 hash storage, `crypto.timingSafeEqual`, 5-minute expiry, single-use atomic consumption, 5 wrong attempts max lockout, 30s resend cooldown, and max 3 requests per phone per 10 minutes. Created sliding-window IP rate limiter `src/lib/rate-limit.ts` (10 requests/hr, 20 verifies/10min). Created `src/lib/otp-sender.ts` with masked console logger and MSG91 stub. Dev test OTP `123456` strictly guarded for seeded numbers when `ALLOW_TEST_OTP="true"` outside production. |
| **4. Open-Redirect Protection** | URL Sanitization | Created `src/lib/url.ts` (`validateCallbackUrl`) blocking protocol-relative (`//`), backslashes (`\`), absolute URLs, and javascript schemes, safely defaulting to `/bookings`. |
| **5. Policy Module & Isolation** | Granular Authorization | Created pure functions in `src/lib/policies.ts`: `canViewBooking`, `canUpdateBookingStatus`, `canCancelBooking`, `canManageSalon`, `canManageBarber`, `canManageBarberAvailability`, `canApproveSalon`, `canApproveBarber`, `canViewAdminArea`. Enforced same-salon barber isolation, cross-salon owner isolation, and granular separation between barber availability and owner-only profile management. |
| **6. Route Protection & Shells** | Next.js Edge & App Router | Created edge-safe `src/lib/auth-config.ts` without database dependencies, enabling Next.js 15 Edge Middleware in `src/middleware.ts` to protect `/dashboard`, `/admin`, `/bookings`, `/book`, and `/account`. Built themed Indian aesthetic 403 page `src/app/forbidden/page.tsx`, role-checked `/dashboard`, user-checked `/bookings`, and Zod-validated `/account`. |
| **7. Admin Approval Console** | Salon/Barber Moderation | Created `/admin` console with server actions `updateSalonStatus` and `updateBarberStatus`, enabling admins to Approve (`VERIFIED`), Suspend (`SUSPENDED`), or Reject (`REJECTED`) pending registrations with confirmation modals and audit logging. |
| **8. Themed Login UI** | Anti-SaaS Design System | Created `/login` with 2-step flow: Step 1 phone input with `+91` prefix; Step 2 six typewriter-styled `Special Elite` digit boxes, automatic focus advance, backspace navigation, paste support, and 30s resend cooldown timer. Styled with `paper`, `maroon`, `marigold`, and `ink` sticker buttons. |
| **9. Header Integration** | Session Navigation | Updated `SignboardHeader.tsx` to display live user greeting (`नमस्ते, {name}`), role badge (`व्यवस्थापक`, `नाई / कारीगर`), `/dashboard` and `/admin` links, and sign-out button. Added full English/Hindi strings in `en.json` and `hi.json`. |
| **10. CLI Management Scripts** | Operations | Created `scripts/create-admin.ts` (`npm run admin:create`) with interactive phone/name prompts and production confirmation. Created `scripts/cleanup-otp.ts` (`npm run otp:cleanup`) to purge expired/consumed OTP records older than 24h. |
| **11. Security Hardening** | HTTP Security Headers | Configured CSP and HTTP security headers in `next.config.ts`: `default-src 'self'`, strict script/style/font/img directives, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy`. |
| **12. Production Guard on Tests** | Test Safety | All 4 database test files (`phase0-db.test.ts`, `db-constraints.test.ts`, `phase1-ui.test.ts`, `phase2-auth.test.ts`) enforce `throw new Error("Refusing to run DB tests when APP_ENV or NODE_ENV is production")`. |
| **13. Mass-Assignment Guard** | Account Security | `updateProfileName` in `src/app/account/actions.ts` parses input via `ProfileNameSchema` so malicious payloads like `{ name: "New Name", role: "ADMIN" }` strip the `role` field; user role in database remains `CUSTOMER`. |
| **14. Immediate Deactivation** | Live DB Auth | `getCurrentUser()` inspects PostgreSQL on each request. When an active user is deactivated (`isActive: false`), `getCurrentUser()` returns `null` immediately. |
| **15. Default Language Fix** | i18n Alignment | Updated new user creation in `src/lib/auth.ts` to default to `'en'` (matching `prisma/schema.prisma` `@default("en")`), or inherit `NEXT_LOCALE` cookie if already selected. |
| **16. Dependency Pinning** | Version Hygiene | Pinned `"next-auth": "5.0.0-beta.25"` in `package.json` without `^` or `~`. |

---

## 3. Verification Sequence Results

### 3.1. Prisma Schema Validation (`npx prisma validate`)
```text
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.prisma
The schema at prisma\schema.prisma is valid 🚀
```

### 3.2. Migration Status (`npx prisma migrate status`)
```text
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.prisma
Datasource "db": PostgreSQL database "postgres", schema "public" at "aws-0-ap-south-1.pooler.supabase.com:5432"

3 migrations found in prisma/migrations

Database schema is up to date!
```

### 3.3. ESLint Verification (`npm run lint`)
```text
> indian-salon-booking@0.1.0 lint
> next lint

✔ No ESLint warnings or errors
```

### 3.4. Verbose Vitest Test Suite Output (`npx vitest run --reporter=verbose`)
*The following is the 100% complete, unedited raw output:*

```text
 RUN  v3.2.7 D:/Indian-salon-booking

 ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Phone Normalisation (normalizeIndianPhone) > accepts standard 10-digit Indian mobile numbers and normalises to E.164 5ms
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
 ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > generates HMAC hash and uses constant-time compare 345ms
stdout | src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > issues OTP, stores only hash, and allows single-use verification
[ConsoleOtpSender] OTP for +919876599999 (+91******9999): 842600

 ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > issues OTP, stores only hash, and allows single-use verification 907ms
 ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > rejects expired OTP code 397ms
 ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > 5 wrong attempts invalidate the code even if the correct code follows 1249ms
stdout | src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > issuing a newer OTP invalidates previous unconsumed codes
[ConsoleOtpSender] OTP for +919876599999 (+91******9999): 110667

stdout | src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > issuing a newer OTP invalidates previous unconsumed codes
[ConsoleOtpSender] OTP for +919876599999 (+91******9999): 869330

 ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > issuing a newer OTP invalidates previous unconsumed codes 1003ms
stdout | src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > enforces 30s resend cooldown for the same phone
[ConsoleOtpSender] OTP for +919876599999 (+91******9999): 576687

 ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > enforces 30s resend cooldown for the same phone 507ms
 ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > enforces max 3 OTP requests per phone per 10 minutes 324ms
stdout | src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > enforces IP rate limits for OTP requests and verification attempts
[ConsoleOtpSender] OTP for +919870000000 (+91******0000): 365743

stdout | src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > enforces IP rate limits for OTP requests and verification attempts
[ConsoleOtpSender] OTP for +919870000001 (+91******0001): 159719

stdout | src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > enforces IP rate limits for OTP requests and verification attempts
[ConsoleOtpSender] OTP for +919870000002 (+91******0002): 107980

stdout | src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > enforces IP rate limits for OTP requests and verification attempts
[ConsoleOtpSender] OTP for +919870000003 (+91******0003): 688852

stdout | src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > enforces IP rate limits for OTP requests and verification attempts
[ConsoleOtpSender] OTP for +919870000004 (+91******0004): 689324

stdout | src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > enforces IP rate limits for OTP requests and verification attempts
[ConsoleOtpSender] OTP for +919870000005 (+91******0005): 277047

stdout | src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > enforces IP rate limits for OTP requests and verification attempts
[ConsoleOtpSender] OTP for +919870000006 (+91******0006): 259180

stdout | src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > enforces IP rate limits for OTP requests and verification attempts
[ConsoleOtpSender] OTP for +919870000007 (+91******0007): 486962

stdout | src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > enforces IP rate limits for OTP requests and verification attempts
[ConsoleOtpSender] OTP for +919870000008 (+91******0008): 546317

stdout | src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > enforces IP rate limits for OTP requests and verification attempts
[ConsoleOtpSender] OTP for +919870000009 (+91******0009): 292465

 ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > OTP Service Logic & Database Rules > enforces IP rate limits for OTP requests and verification attempts 3168ms
 ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Integration Flow & Database Role Verification > new phone login creates a CUSTOMER role; cannot escalate own role 225ms
 ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Integration Flow & Database Role Verification > existing barber logging in keeps BARBER role 107ms
 ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Integration Flow & Database Role Verification > deactivated user cannot log in and has null access 225ms
 ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Integration Flow & Database Role Verification > admin approve action verifies pending salon, making it visible publicly; suspend hides it 1507ms
 ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Integration Flow & Database Role Verification > prevents mass-assignment / role escalation on account update: role field is stripped and remains CUSTOMER 457ms
 ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Integration Flow & Database Role Verification > enforces immediate deactivation via getCurrentUser: active user returns profile, deactivated user returns null 680ms
 ✓ src/tests/phase2-auth.test.ts > Phase 2: Authentication, Roles and Authorization Tests > Integration Flow & Database Role Verification > creates new users with default language "en" matching schema.prisma definition 224ms
stdout | src/tests/db-constraints.test.ts > Database Constraints & Exclusion Rules (PostgreSQL Supabase) > rejects two overlapping active bookings for the same barber with Postgres error 23P01
prisma:error 
Invalid `db.booking.create()` invocation in
D:\Indian-salon-booking\src\tests\db-constraints.test.ts:91:24

  88 let is23P01 = false;
  89 
  90 try {
→ 91   await db.booking.create(
Error occurred during query execution:
ConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: "23P01", message: "conflicting key value violates exclusion constraint \"booking_no_overlap\"", severity: "ERROR", detail: Some("Key (\"barberId\", tstzrange(\"startsAt\", \"endsAt\", '[)'::text))=(cmvxpmhf40017vbtg79zly7hm, [\"2099-01-15 10:30:00+00\",\"2099-01-15 11:15:00+00\")) conflicts with existing key (\"barberId\", tstzrange(\"startsAt\", \"endsAt\", '[)'::text))=(cmvxpmhf40017vbtg79zly7hm, [\"2099-01-15 10:00:00+00\",\"2099-01-15 10:45:00+00\"))."), column: None, hint: None }), transient: false })

 ✓ src/tests/db-constraints.test.ts > Database Constraints & Exclusion Rules (PostgreSQL Supabase) > rejects two overlapping active bookings for the same barber with Postgres error 23P01 506ms
 ✓ src/tests/db-constraints.test.ts > Database Constraints & Exclusion Rules (PostgreSQL Supabase) > allows back-to-back bookings where one ends exactly when the next starts 483ms
 ✓ src/tests/db-constraints.test.ts > Database Constraints & Exclusion Rules (PostgreSQL Supabase) > allows a new booking on a slot that was previously CANCELLED 477ms
stdout | src/tests/db-constraints.test.ts > Database Constraints & Exclusion Rules (PostgreSQL Supabase) > rejects a booking where endsAt <= startsAt with check constraint error
prisma:error 
Invalid `db.booking.create()` invocation in
D:\Indian-salon-booking\src\tests\db-constraints.test.ts:218:24

  215 let isTimeOrderViolation = false;
  216 
  217 try {
→ 218   await db.booking.create(
Error occurred during query execution:
ConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: "23514", message: "new row for relation \"Booking\" violates check constraint \"booking_time_order\"", severity: "ERROR", detail: Some("Failing row contains (cmvxrj7sx000dvbgcr9n1056n, 507, 2099-01-15, cmvxpmg23000bvbtghfvina8p, cmvxpmhf40017vbtg79zly7hm, cmvxpmfsm0007vbtgvsw47cw8, null, null, IN_SALON, ONLINE, CONFIRMED, 2099-01-15 16:00:00+00, 2099-01-15 15:30:00+00, 100, null, null, null, null, null, null, null, 2026-11-01 11:44:52.546+00, 2026-11-01 11:44:52.546+00)."), column: None, hint: None }), transient: false })

 ✓ src/tests/db-constraints.test.ts > Database Constraints & Exclusion Rules (PostgreSQL Supabase) > rejects a booking where endsAt <= startsAt with check constraint error 115ms
 ✓ src/tests/phase1-ui.test.ts > Phase 1 Public Salon Queries & Security Verification > returns verified salons (Sharma Ji Gents Parlour) and strictly excludes pending salons (Royal Ustaad) 787ms
 ✓ src/tests/phase1-ui.test.ts > Phase 1 Public Salon Queries & Security Verification > getSalonBySlug returns verified salon and returns null for pending or missing salon 842ms
 ✓ src/tests/phase1-ui.test.ts > Phase 1 Service Grouping & Calculation Logic > groups services accurately by ServiceCategory 1ms
 ✓ src/tests/phase1-ui.test.ts > Phase 1 Service Grouping & Calculation Logic > calculates total price and duration accurately for multiple selected service IDs 1ms
 ✓ src/tests/phase1-ui.test.ts > Phase 1 Service Grouping & Calculation Logic > returns zero values when no services are selected 0ms
 ✓ src/tests/phase1-ui.test.ts > Phase 1 Time Helpers Verification > formats minutes from midnight into 12-hour AM/PM format 0ms
 ✓ src/tests/phase1-ui.test.ts > Phase 1 Time Helpers Verification > correctly determines if salon is open or closed based on hours 1ms
 ✓ src/tests/phase0-db.test.ts > Phase 0 Database & Constraint Verification > verifies seeded salons, barbers and services exist 410ms
stdout | src/tests/phase0-db.test.ts > Phase 0 Database & Constraint Verification > rejects overlapping CONFIRMED bookings with Postgres exclusion constraint 23P01 (booking_no_overlap)
prisma:error 
Invalid `db.booking.create()` invocation in
D:\Indian-salon-booking\src\tests\phase0-db.test.ts:115:24

  112 let errorMessage = '';
  113 
  114 try {
→ 115   await db.booking.create(
Error occurred during query execution:
ConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: "23P01", message: "conflicting key value violates exclusion constraint \"booking_no_overlap\"", severity: "ERROR", detail: Some("Key (\"barberId\", tstzrange(\"startsAt\", \"endsAt\", '[)'::text))=(cmvxpmhf40017vbtg79zly7hm, [\"2099-12-31 10:30:00+00\",\"2099-12-31 11:00:00+00\")) conflicts with existing key (\"barberId\", tstzrange(\"startsAt\", \"endsAt\", '[)'::text))=(cmvxpmhf40017vbtg79zly7hm, [\"2099-12-31 10:00:00+00\",\"2099-12-31 10:45:00+00\"))."), column: None, hint: None }), transient: false })

 ✓ src/tests/phase0-db.test.ts > Phase 0 Database & Constraint Verification > rejects overlapping CONFIRMED bookings with Postgres exclusion constraint 23P01 (booking_no_overlap) 253ms

 Test Files  4 passed (4)
      Tests  53 passed (53)
   Start at  17:14:37
   Duration  19.79s (transform 208ms, setup 0ms, collect 935ms, tests 17.33s, environment 1ms, prepare 536ms)
```

### 3.5. Next.js Production Build (`npm run build`)
```text
   ▲ Next.js 15.5.28
   - Environments: .env

   Creating an optimized production build ...
 ✓ Compiled successfully in 4.0s
   Linting and checking validity of types ...
   Collecting page data ...
   Generating static pages (0/12) ...
   Generating static pages (3/12) 
   Generating static pages (6/12) 
   Generating static pages (9/12) 
 ✓ Generating static pages (12/12)
   Finalizing page optimization ...
   Collecting build traces ...

Route (app)                                 Size  First Load JS
┌ ƒ /                                      215 B         133 kB
├ ƒ /_not-found                            130 B         103 kB
├ ƒ /~offline                              168 B         106 kB
├ ƒ /account                             1.23 kB         134 kB
├ ƒ /admin                               2.25 kB         135 kB
├ ƒ /api/auth/[...nextauth]                130 B         103 kB
├ ƒ /bookings                              215 B         133 kB
├ ƒ /dashboard                             212 B         133 kB
├ ƒ /forbidden                             168 B         106 kB
├ ƒ /login                               2.77 kB         136 kB
├ ƒ /salons                              3.28 kB         136 kB
└ ƒ /salons/[slug]                       3.92 kB         137 kB
+ First Load JS shared by all             103 kB
  ├ chunks/255-b1e2483a7e02feee.js       46.6 kB
  ├ chunks/4bd1b696-c023c6e3521b1417.js  54.2 kB
  └ other shared chunks (total)          1.99 kB

ƒ Middleware                             85.3 kB
ƒ (Dynamic)  server-rendered on demand
```

---

## 4. Content-Security-Policy (CSP) Inspection & Honesty Report

### 4.1. Exact CSP Header String
From `next.config.ts`:
```http
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co https://*.supabase.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests;
```

### 4.2. Next.js Inline Hydration & Runtime Handling
Next.js injects inline script tags during SSR for client hydration, route manifests, and chunk loaders. Without a per-request middleware nonce pipeline, these scripts are enabled via `'unsafe-inline'` and `'unsafe-eval'` (the latter needed by Next.js dev runtime and HMR).

### 4.3. Real Browser DevTools Honesty Statement
> **Honest Report:** Verification of the CSP headers was conducted through `next.config.ts` static inspection, Node.js configuration, and `next build` headers collection. Because this execution environment is a terminal without a headless browser or GUI desktop session, **I did NOT personally launch an interactive Chrome/Firefox browser or inspect the DevTools console for live CSP violations.** 
> You should open `http://localhost:3000` with DevTools Console open (`F12`) to verify that no CSP violation warnings appear during user interactions.

---

## 5. Pinned Dependency Verification

In `package.json`, `next-auth` is pinned to the exact installed version without range operators:
```json
"next-auth": "5.0.0-beta.25",
```
*(Verified against `node_modules/next-auth/package.json` version `5.0.0-beta.25`).*

---

## 6. Functional Verification & Manual Check Matrix

| Check | What Automated Tests Verified | What Requires Manual Browser Verification |
| :--- | :--- | :--- |
| **New Customer Login** | Phone normalization, DB user creation with role `CUSTOMER`, language `'en'`, session generation, and redirection to `/bookings`. | Navigate to `/login`, enter 10-digit number, observe 6 digit boxes auto-advance, paste OTP `123456`, see redirect to `/bookings`. |
| **Barber Login & 403 Access** | Barber profile verification, `/dashboard` role policy allowance (`BARBER`, `OWNER`), and `/admin` policy denial (`canViewAdminArea -> false`). | Log in as barber (`9000000004` / `123456`), verify signboard header displays barber name and role badge, navigate to `/admin` and confirm the styled rustic No Entry (`/forbidden`) page displays. |
| **Customer 403 on Dashboard** | Policy check `canManageSalon(customer, ...) -> false`, `requireRole` redirect to `/forbidden`. | Log in as customer (`9876543210` / `123456`), manually navigate to `/dashboard`, confirm redirection to `/forbidden`. |
| **Unauthenticated Redirect with Callback** | Edge Middleware cookie check and callback preservation `/login?callbackUrl=%2Fdashboard`. | Open an Incognito window, visit `/dashboard`, confirm redirect to `/login?callbackUrl=%2Fdashboard`, enter credentials, confirm landing back on `/dashboard`. |
| **Admin Approve / Suspend Toggle** | Database status update (`PENDING` -> `VERIFIED` -> `SUSPENDED`) and public visibility filtering via `getPublicSalons()`. | Log in as admin (`9000000001` / `123456`), open `/admin`, click "स्वीकृत करें" (Approve) on Royal Ustaad Mens Salon, open `/salons` in a new tab to see it appear, click "निलंबित करें" (Suspend) on `/admin` and confirm it disappears. |
| **Open-Redirect Prevention** | Unit test on `validateCallbackUrl` blocking `//evil.com`, `https://evil.com`, and `/\evil.com`. | Visit `http://localhost:3000/login?callbackUrl=https://google.com`, log in, confirm you are redirected to `/bookings`, not external Google. |
| **Mobile Viewport & Typography** | CSS class definitions (`font-sign`, `font-token`, `paper`, `tile`, 44px touch targets). | Open DevTools Device Mode (360px viewport width) and inspect touch targets, Hindi/English paired labels, and sticky header reduction on scroll. |

---

## 7. Seeded Test Credentials

When testing locally in development mode (`APP_ENV="development"`, `ALLOW_TEST_OTP="true"`), the fixed test OTP **`123456`** can be entered directly on `/login` for any seeded account:

| Role | Name | Phone Number | Test OTP | Landing Route |
| :--- | :--- | :--- | :---: | :--- |
| **ADMIN** | Admin Sahab | `9000000001` (`+919000000001`) | `123456` | Has access to `/admin` approval console |
| **OWNER** | Pandit Ramvilas Sharma | `9000000002` | `123456` | Redirects to `/dashboard` (Sharma Ji Gents Parlour) |
| **OWNER** | Javed Ustaad | `9000000003` | `123456` | Redirects to `/dashboard` (Royal Ustaad Mens Salon) |
| **BARBER** | Ustaad Rakesh Sharma | `9000000004` | `123456` | Redirects to `/dashboard` |
| **CUSTOMER** | Amit Verma | `9876543210` | `123456` | Redirects to `/bookings` (403 on `/dashboard` and `/admin`) |
| **NEW CUSTOMER** | Any 10-digit number | e.g. `9812345678` | Printed to terminal | Auto-creates `CUSTOMER` account, lands on `/bookings` |

---

## 8. Production Deployment Notes

1. **SMS Gateway:** For production, configure MSG91 credentials in environment variables (`MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`, `MSG91_SENDER_ID`) and set `OTP_PROVIDER="msg91"`.
2. **Distributed Rate Limiting:** The in-memory sliding window limiter in `src/lib/rate-limit.ts` is configured for single-node development. In serverless or multi-instance clusters, connect this to an external Redis instance (e.g. Upstash Redis).
3. **Secret Generation:** Use `openssl rand -base64 32` to generate strong production values for `AUTH_SECRET` and `OTP_PEPPER`. Never set `ALLOW_TEST_OTP="true"` in production (guarded at startup).
