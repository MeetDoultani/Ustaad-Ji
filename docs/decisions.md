# Architectural Decisions & Assumptions

## 1. Package Stack Confirmation
The application uses the exact tech stack specified in the prompt:
- **Framework:** Next.js 15+ (App Router, strict TypeScript)
- **Styling:** Tailwind CSS with custom design tokens from Section 11 & CSS variables
- **Database & ORM:** PostgreSQL 16 (hosted on Supabase) + Prisma Client 6 / latest stable
- **Database Constraints:** PostgreSQL exclusion constraint using `btree_gist` for no-overlap booking verification and SQL check constraints
- **Authentication:** Auth.js (NextAuth v5) using phone number + OTP credentials flow with database session / JWT support
- **Validation:** Zod schemas on every API route, server action, and form input
- **Internationalization (i18n):** `next-intl` (English + Hindi), supporting cookie/session-based locale resolution
- **Testing:** Vitest for unit & integration tests
- **Fonts:** `next/font/google` loading `Yatra One`, `Hind`, `Baloo 2`, and `Special Elite` with `latin` and `devanagari` subsets
- **PWA:** Web manifest (`public/manifest.json`) and offline fallback page (`src/app/~offline/page.tsx`)

---

## 2. Clean `next-intl` Cookie/Session-Based Architecture (No Prefix in URLs)

### Problem
Section 4 mandates exact URLs:
- `/`
- `/salons`
- `/salons/[slug]`
- `/book/[salonSlug]`
- `/bookings`
- `/bookings/[id]`
- `/dashboard`
- `/admin`

Using standard path-prefix i18n (`/en/salons`, `/hi/salons`) breaks these strict route paths.

### Solution
We use `next-intl` without a prefix, powered by `src/i18n/request.ts` and cookie/session detection:
1. **Locale Resolution (`src/i18n/request.ts`):**
   - Resolves locale via `await cookies().get('NEXT_LOCALE')?.value`.
   - Validates against supported locales (`['en', 'hi']`).
   - Falls back to user's saved preference in the database (if logged in) or defaults to `'en'`.
   - Loads the appropriate message dictionary from `src/messages/en.json` or `src/messages/hi.json`.
2. **Root Layout Integration (`src/app/layout.tsx`):**
   - Server-side calls `getLocale()` and `getMessages()`.
   - Sets `<html lang={locale}>`.
   - Wraps children in `<NextIntlClientProvider messages={messages}>`.
3. **Locale Switching:**
   - A client-side language switcher calls a lightweight server action or sets document cookie `NEXT_LOCALE=hi; path=/; max-age=31536000`, followed by `router.refresh()`.
   - If the user is logged in, it also updates their `User.language` preference in PostgreSQL.
4. **Result:**
   - All URLs remain clean and un-prefixed (`/salons/sharma-ji-gents-parlour`).
   - Server components call `getTranslations()`.
   - Client components call `useTranslations()`.

---

## 3. Exact Folder Structure

```
d:/Indian-salon-booking/
├── .env
├── .env.example
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.mjs
├── vitest.config.ts
├── next.config.ts
├── docs/
│   ├── project-spec.md
│   ├── design-brief.md
│   └── decisions.md
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
│       ├── 0_init/
│       │   └── migration.sql
│       └── 1_booking_constraints/
│           └── migration.sql
├── public/
│   ├── manifest.json
│   ├── icons/
│   │   ├── icon-192.svg
│   │   └── icon-512.svg
│   └── images/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── not-found.tsx
│   │   ├── error.tsx
│   │   ├── loading.tsx
│   │   ├── globals.css
│   │   ├── ~offline/
│   │   │   └── page.tsx
│   │   ├── salons/
│   │   │   ├── page.tsx
│   │   │   └── [slug]/
│   │   │       └── page.tsx
│   │   ├── book/
│   │   │   └── [salonSlug]/
│   │   │       └── page.tsx
│   │   ├── bookings/
│   │   │   ├── page.tsx
│   │   │   └── [id]/
│   │   │       └── page.tsx
│   │   ├── dashboard/
│   │   │   ├── page.tsx
│   │   │   ├── bookings/page.tsx
│   │   │   ├── services/page.tsx
│   │   │   ├── hours/page.tsx
│   │   │   ├── barbers/page.tsx
│   │   │   └── walk-in/page.tsx
│   │   ├── admin/
│   │   │   └── page.tsx
│   │   └── login/
│   │       └── page.tsx
│   ├── components/
│   │   ├── ui/               # Reusable styled primitives (Signboard, RateCard, TokenSlip, Diary, Buttons)
│   │   └── features/         # Domain-specific components
│   ├── i18n/
│   │   ├── request.ts        # next-intl server request config
│   │   └── routing.ts        # Locale config and constants
│   ├── messages/
│   │   ├── en.json           # English / Hinglish microcopy
│   │   └── hi.json           # Hindi (Devanagari) microcopy
│   ├── lib/
│   │   ├── db.ts             # Prisma client singleton
│   │   ├── auth.ts           # Auth.js configuration & handlers
│   │   ├── policies.ts       # Central authorization logic
│   │   ├── slots.ts          # Pure slot calculation engine
│   │   ├── otp.ts            # OTP generator, hasher & sender interface
│   │   ├── tokens.ts         # Token allocator & formatter
│   │   └── time.ts           # Timezone utilities (Asia/Kolkata <-> UTC)
│   └── tests/
│       ├── phase0-db.test.ts # Database constraints & overlap integration tests
│       └── ...
```

---

## 4. Key Architectural Assumptions
1. **Timezone Handling:** All timestamps in PostgreSQL are stored with timezone (`timestamptz(3)` / UTC). User display and business logic calculations (like salon hours `openMin` / `closeMin` in minutes from midnight) operate in Indian Standard Time (`Asia/Kolkata` / UTC+05:30).
2. **Exclusion Constraint on Double Bookings:** The SQL `booking_no_overlap` constraint using `btree_gist` is the database-level authority on concurrent slots. Vitest test verifies this by deliberately catching code `23P01`.
3. **Authentication Strategy:** Auth.js v5 (NextAuth v5 beta) credentials provider paired with phone OTP verification. Role is derived from the database user profile, not client input.
4. **Idempotent Seed Script:** `prisma/seed.ts` safely cleans and reseeds test records, printing a formatted CLI credentials table. Guarded against accidental execution in production (`APP_ENV === 'production'` / `NODE_ENV === 'production'`).
5. **Supabase Row Level Security (RLS) & Application Authorization:** All database tables in the `public` schema have RLS enabled with zero policies, and all table privileges are revoked from `anon` and `authenticated` roles (`ALTER DEFAULT PRIVILEGES ... REVOKE ALL`). This ensures the public Supabase API cannot read or mutate database records via the anon key. Prisma connects using the privileged database role which bypasses RLS. All authorization logic is enforced centrally in the Next.js application (`src/lib/policies.ts`), not by RLS policies.

---

## 5. Phase 2: Authentication, Authorization & Security Architecture

### 5.1 Auth.js v5 Credentials Flow with Phone OTP
- **Credentials Provider:** Uses NextAuth v5 beta (`next-auth@5.0.0-beta.25`) with a custom `phone-otp` Credentials provider.
- **Phone Normalization:** All inputs are normalized to Indian E.164 (`+91XXXXXXXXXX`) using `libphonenumber-js`. Inputs starting with `+91`, `91`, `0`, or bare 10-digit formats are accepted; letters and landlines are rejected.
- **OTP Security:**
  - 6-digit cryptographically secure codes (`crypto.randomInt(100000, 1000000)`).
  - Stored strictly as HMAC-SHA256 hex hashes keyed with `OTP_PEPPER`. Plaintext OTPs never touch the database.
  - Constant-time verification with `crypto.timingSafeEqual`.
  - 5-minute expiry window. Single-use consumption (consumed in a Prisma transaction upon verification).
  - Max 5 wrong attempts before permanent invalidation.
  - 30-second resend cooldown per phone number.
  - Rate-limited to max 3 OTP requests per phone per 10 minutes.
  - Development bypass: Test OTP `123456` is strictly restricted to seeded test phone numbers when `ALLOW_TEST_OTP="true"` and `APP_ENV !== "production"`.
- **JWT & Database-Backed Authorization:**
  - The JWT session stores only the user `id` (with `role` mirrored solely as a client-side display hint).
  - The JWT role is **never** trusted for authorization decisions.
  - `getCurrentUser()` in `src/lib/auth-server.ts` queries PostgreSQL on every protected request. Deactivated users (`isActive: false`) or modified roles take effect immediately without requiring session invalidation.

### 5.2 Edge Middleware Separation
- Next.js 15 Edge Middleware cannot execute Node-only modules or Prisma database connections.
- We separate the configuration into:
  - `src/lib/auth-config.ts`: Pure, edge-safe NextAuth config defining callbacks, session strategy, and cookie policies.
  - `src/middleware.ts`: Uses `authConfig` to inspect JWT presence and route permissions on `/dashboard`, `/admin`, `/bookings`, `/book`, and `/account`.
  - `src/lib/auth-server.ts` & `src/lib/auth.ts`: Full Node runtime handlers with Prisma database operations for Server Components, Server Actions, and Route Handlers.

### 5.3 Rate Limiting Architecture
- `src/lib/rate-limit.ts` implements a sliding-window rate limiter:
  - 10 OTP requests per IP per hour.
  - 20 OTP verifications per IP per 10 minutes.
- **Production Note:** In this local development and single-node setup, an in-memory sliding window is utilized. In a multi-instance or serverless production deployment, this must be switched to a distributed store such as Redis (e.g., Upstash Redis).

### 5.4 Content Security Policy & HTTP Security Headers
- Configured in `next.config.ts`:
  - `Content-Security-Policy`:
    - `default-src 'self'`: Restricts defaults to same origin.
    - `script-src 'self' 'unsafe-inline' 'unsafe-eval'`: Allows Next.js runtime client bundles.
    - `style-src 'self' 'unsafe-inline'`: Allows Tailwind CSS and styled inline font attributes.
    - `font-src 'self' https://fonts.gstatic.com data:`: Allows Google fonts and data URIs.
    - `img-src 'self' data: https: blob:`: Allows local avatars, Unsplash placeholders, and data URIs.
    - `connect-src 'self' https:`: Allows API fetches and Supabase / telemetry calls.
    - `frame-ancestors 'none'`: Prevents clickjacking.
  - `X-Content-Type-Options: nosniff`: Prevents MIME-sniffing.
  - `X-Frame-Options: DENY`: Blocks framing completely.
  - `Referrer-Policy: strict-origin-when-cross-origin`.
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`.

---

## 6. Phase 3: Real Slot Booking Architecture & Concurrency Control

### 6.1 Transaction Safety on Remote Supabase
- Interactive transactions (`prisma.$transaction(async (tx) => { ... })`) in `src/lib/booking-service.ts` are configured with `{ maxWait: 10000, timeout: 15000 }` to reliably support latency across remote Supabase connection poolers.
- Any PostgreSQL exclusion constraint violation (`23P01`), unique constraint conflict (`P2002`), or write conflict is cleanly trapped and returned as a user-friendly `{ ok: false, code: 'SLOT_TAKEN', message: 'Yeh slot bhar gaya hai, kripya doosra time chuniye.' }`.

### 6.2 Atomic Daily Token Allocation
- To hand out strictly sequential daily tokens (e.g., Token #1, Token #2) per salon per day without race conditions, token numbers are allocated inside the creation transaction using PostgreSQL atomic upsert:
  ```ts
  const counter = await tx.dailyTokenCounter.upsert({
    where: { salonId_date: { salonId, date: tokenDate } },
    update: { last: { increment: 1 } },
    create: { salonId, date: tokenDate, last: 1 },
  });
  const token = counter.last;
  ```

### 6.3 Reschedule Two-Step Cancellation and Rollback Design
- **Problem:** PostgreSQL enforces a GiST exclusion constraint (`booking_no_overlap`) preventing any active bookings for the same barber from overlapping. When a customer reschedules an appointment to a time that partially overlaps their old appointment (e.g., shifting 10:00–11:00 to 10:30–11:30), creating the new booking before cancelling the old one immediately triggers a `23P01` violation against the old booking row.
- **Solution:** Inside a single interactive Prisma transaction:
  1. The existing booking is updated to `status: 'CANCELLED'`, `cancelReason: 'RESCHEDULED'`, and `cancelledAt: now`.
  2. The new booking is validated and inserted.
  3. If validation fails or the target slot is taken by another customer, an error is thrown to immediately abort and roll back the transaction, leaving the old booking 100% active and untouched.

### 6.4 Pure Timezone-Independent IST Math
- All calendar dates, opening hours, and slot generation operate in Indian Standard Time (IST / Asia/Kolkata, UTC+05:30).
- Pure UTC millisecond arithmetic (`+ 330 * 60 * 1000`) and UTC date component getters are utilized across `src/lib/time.ts` and `src/lib/slots.ts`. This guarantees identical slot schedules whether executed on local Windows development, Docker, or Vercel production servers running in UTC.

### 6.5 Cancellation & Reschedule Guardrails
- **60-Minute Cutoff:** Customers may cancel or reschedule online only at least 60 minutes prior to `startsAt`. Within 60 minutes, self-serve changes are blocked and customers are prompted to contact the salon directly.
- **Concurrency & Abuse Limits:**
  - Maximum 5 active concurrent bookings per customer (`MAX_ACTIVE_BOOKINGS_PER_CUSTOMER = 5`).
  - Maximum 5 bookings created per customer per hour (`MAX_BOOKINGS_CREATED_PER_HOUR = 5`).
  - Customer overlap guard: Customers cannot book overlapping appointments across different barbers or salons.
  - Rate-limited slot availability lookups (60 per IP per minute).

---

## 7. Phase 4 Backlog & Future Capabilities
The following capabilities are explicitly deferred to Phase 4 and later releases:
1. **Barber & Owner Dashboard Features:**
   - Real-time today's schedule view with barber assignment.
   - Status transitions (Check-in, In-Progress, Completed, No-Show).
2. **Walk-In Token Generation:**
   - Physical walk-in customer entry with on-the-spot token printing and integration into the daily queue.
3. **Salon & Barber Management Editors:**
   - Visual rate card price editor.
   - Weekly shift & split-shift working hours editor.
   - One-off TimeOff / leave scheduler.
4. **Automated Reminders & Notifications:**
   - WhatsApp / SMS token confirmation and reminder messages (30 mins before slot).
5. **Home Visit Dispatch:**
   - Address selection, travel radius verification, and ustaad dispatch.
6. **Payments & Cash Reconciliation:**
   - Integrated UPI dynamic QR generation, advance deposits, and daily cash register reconciliation.
7. **Crowd & Wait-Time Analytics:**
   - Live queue length, moving average chair time, and peak hour rush charts.

---

## 8. Phase 3B: Rebrand to "Ustaad-Ji" & Single-Language i18n Architecture

### 8.1 Rebrand to "Ustaad-Ji" (उस्ताद जी)
- The application identity has transitioned from generic working titles ("Indian Salon Booking", "देसी सैलून") to **Ustaad-Ji** (English) and **उस्ताद जी** (Hindi).
- Official taglines:
  - English: *"No more waiting in line. Book your slot."*
  - Hindi: *"अब लाइन में नहीं, स्लॉट में"*
- Package name, web manifest, metadata, headers, token slips, and signboards have been updated with 100% brand consistency.

### 8.2 Single-Language Rendering (Zero Bilingual Slash Pairs)
- **Problem:** Early UI iterations used stacked English/Hindi or slash pairings (e.g., `Rate Card / रेट कार्ड`, `Ghar Wapas / Home`). This created visual clutter and cognitive overload for users on mobile devices.
- **Solution:** Replaced with strict single-language rendering. Every screen is rendered completely in the user's active locale (English or Hindi). The only element displaying the other language is the language switcher button (e.g., displaying "हिन्दी" when in English, and "English" when in Hindi).

### 8.3 Cookie-First Resolution with User Profile Sync & Zero URL Prefixes
- Locale is resolved via the `NEXT_LOCALE` cookie (1-year lifetime, `SameSite=Lax`, `Secure` in production).
- When a user logs in, their `User.language` preference in PostgreSQL is synchronized with `NEXT_LOCALE`.
- Changing language updates the cookie, refreshes the active view via `router.refresh()`, and asynchronously persists the choice to the user's account in PostgreSQL if authenticated.
- URL routes remain clean and un-prefixed (`/salons`, `/book/...`), preserving bookmarking and SEO integrity.

### 8.4 Booking Form State Preservation Across Language Switches
- Language switching executes a server action setting `NEXT_LOCALE` followed by `router.refresh()`.
- Client components preserve React state (`selectedServiceIds`, `selectedBarberId`, `selectedDateIst`, `selectedSlotStartsAt`).
- State is continuously mirrored into URL search parameters (`window.history.replaceState`), ensuring full persistence even during hard reloads.

### 8.5 Strict Latin Digits & Currency Conventions
- Both English and Hindi interfaces strictly use standard Latin digits (`0-9`) for all token numbers, prices, durations, dates, times, and phone numbers (`-u-nu-latn`).
- Devanagari numerals (`०-९`) are intentionally avoided to ensure clarity and prevent transactional errors.
- The standard Indian Rupee symbol (`₹`) is used universally.

### 8.6 Single-Field Entity Localized Name Fallback
- Salon and Service models store an optional `nameHi` column in PostgreSQL alongside `name`.
- `getLocalizedName(entity, locale)` returns `nameHi` when in Hindi mode (if non-empty) and falls back cleanly to `name` in English mode or if `nameHi` is unpopulated.

---

## 9. Phase 4A: Architectural Decisions & Specification Precedence

### 9.1 Conflict Resolutions (Phase 4A Prompt Precedence)
Where earlier documents or specifications differed, Phase 4A prompt directives take strict precedence:
1. **Terminology Harmonization:**
   - English: Replaced "Master Barber" / "Our Master Barbers" with "Barber" / "Our Barbers" across all views.
   - Hindi: Standardized on "उस्ताद" for all people-facing screens (cards, booking steps, admin, dashboard). "नाई" is retained exclusively in marketing copy (e.g. hero subtitle). Removed compound forms "उस्ताद कारीगर" and "उस्ताद नाई".
2. **Category Nomenclature:**
   - The `BRIDAL` enum displays as "Groom Styling" (English) and "दूल्हा स्टाइलिंग" (Hindi). Enum value remains `BRIDAL`.
3. **No Fabricated Data or Invented Wait Times:**
   - Home page stats ("Verified Salons", "Expert Barbers", "Tokens Issued") are derived exclusively from real database counts (`prisma.salon.count({ where: { status: 'VERIFIED' } })`, `prisma.barber.count({ where: { status: 'VERIFIED', isActive: true } })`, `prisma.booking.count()`). Zero counts are hidden.
   - Salon card "Estimated wait" badge and placeholder `LiveQueueBoard` displays on public pages are removed until real queue metrics arrive in Phase 7.
4. **Correction of False Offline Claim:**
   - Offline page description in both languages removes false claims of saved bookings availability and states: check internet connection and try again.
5. **Gated Dev Credentials Hint:**
   - `auth.devHint` displays on login only when `APP_ENV !== 'production' && ALLOW_TEST_OTP === 'true'`.
6. **Internal Engineering Labels Deprecated:**
   - "Register Diary Slot Picker" -> "Pick a time" / "समय चुनें"
   - "Rate Card Board" -> "Rate Card" / "रेट कार्ड"
   - "Customer Reviews & Pinned Slips" -> "Customer Reviews" / "ग्राहकों की राय"
   - "Salons Management" / "Barbers Management" -> "Manage Salons" / "Manage Barbers"
   - "User Phone" -> "Phone"
   - "Verify & Enter" -> "Verify"
7. **Config-Driven Dynamic Messages:**
   - All user-facing error and notification messages referencing 15 minutes, 60 minutes, 14 days, or 5 active bookings interpolate dynamic placeholders (`{minutes}`, `{days}`, `{count}`) from `src/lib/booking-config.ts`.

### 9.2 Staff Dashboard Architecture (Phase 4A)
1. **Server-Enforced Scoping:**
   - Barbers see only bookings assigned to their own barber profile (`barberId = barber.id`).
   - Salon owners see bookings across all salons they own, with validated multi-salon selector (`?salonId=`).
   - Any query or action targeting a booking or barber from another salon returns 404 (`NOT_FOUND`), preventing cross-tenant leakage.
   - Salon or barber records that are `PENDING`, `REJECTED`, or `SUSPENDED` render themed signboard notices ("Awaiting Verification" or "Suspended") and hide all register data.
2. **Pure State Machine & Race Safety:**
   - Transition rules are cleanly decoupled in `src/lib/booking-status.ts`.
   - `NO_SHOW` is rejected with `NO_SHOW_TOO_EARLY` if current time is before `startsAt`.
   - `IN_PROGRESS` is rejected with `CHAIR_BUSY` if the barber already has an active booking in the chair.
   - Status updates require `expectedStatus` and execute via atomic `prisma.booking.updateMany({ where: { id, status: expectedStatus } })`. Mismatches return `STATUS_CONFLICT` without modifying data.
   - Cancellation requires a 3-200 character reason and sets `cancelledAt`. Check-in sets `checkedInAt`. Starting a service sets `startedAt` and auto-backfills `checkedInAt` if skipped.
   - Structured audit logs are output to the server console with no phone numbers.
3. **Walk-In Token Allocation:**
   - Staff can issue walk-in tokens via `/dashboard/walk-in`.
   - Earliest available slot on the 15-minute grid is automatically selected with 0-minute lead time.
   - Sequential token is allocated atomically from `DailyTokenCounter`.
   - Rate limit of 60 walk-ins per staff user per hour is enforced.
4. **Phase 4B Scope Boundary:**
   - Profile editors, service editors, weekly availability managers, and barber roster additions remain strictly in Phase 4B backlog.

### 9.3 Database Concurrency & Privacy Hardening
1. **Database-Level Chair-Busy Constraint (`barber_single_in_progress`):**
   - In addition to application-level pre-checks, PostgreSQL enforces a partial unique index:
     ```sql
     CREATE UNIQUE INDEX "barber_single_in_progress" 
     ON "Booking"("barberId") 
     WHERE status = 'IN_PROGRESS';
     ```
   - This provides absolute database guarantees against race conditions when two staff members attempt to start appointments for the same barber simultaneously. PostgreSQL error `23505` and Prisma error `P2002` are trapped and mapped cleanly to `{ ok: false, code: 'CHAIR_BUSY', message: 'This barber already has a customer in the chair.' }`.
2. **Staff Walk-in Rate Limiting Implementation:**
   - Walk-in tokens are limited to 60 per staff user per hour (`checkStaffWalkInRateLimit`).
   - In the current single-instance deployment, this is tracked using an in-memory sliding window history map keyed by `staffUserId`.
   - **Production Requirement:** In multi-instance or serverless edge production deployments, this counter must be migrated to a distributed shared store (e.g., Upstash Redis with sliding window rate limiting).
3. **Server-Side Phone Privacy:**
   - Phone numbers returned in `getRegisterBookings` DTOs are masked on the server (`maskPhoneForRegister`) as `+91 ******3210` before serialization to client components.
   - Full, unmasked phone numbers are strictly restricted to authorized staff viewing individual booking details in `getBookingDetailStaff` (/dashboard/bookings/[id]) to power the direct click-to-call action.

---

## Phase 4B-1: Staff Configuration Rate Limiting and Concurrency Architecture
1. **Staff Edit Rate Limiting (`EDIT_LIMIT`):**
   - An in-memory sliding window rate limit of 60 edit actions per staff user per hour is enforced on all staff configuration mutations (services, salon hours, barber availability, time off).
   - This is tracked per-server-instance in `src/lib/rate-limit.ts` using key `staff_edit:${staffUserId}`.
   - **Production Requirement:** Before multi-instance production deployment, this counter must transition to a shared distributed store (such as Upstash Redis or Redis sliding-window zset).
2. **Deterministic Testing Architecture:**
   - All date/time calculations, validators, conflict detectors, and rate-limit checks accept an explicit optional `now` parameter (defaulting to the current time). Tests inject deterministic timestamps to ensure zero flake and complete test reproducibility regardless of the system clock.
3. **Availability Concurrency Protection:**
   - Barber availability updates lock the target `Barber` row using parameterized tagged-template `SELECT id FROM "Barber" WHERE id = ${barberId} FOR UPDATE;` inside an interactive database transaction before clearing and recreating shifts. This completely eliminates race conditions and overlapping availability windows under concurrent requests.
4. **Rate Card Physical Aesthetic:**
   - The service editor models the physical painted rate card board (`RateCardBoard` visual metaphor) grouped by `ServiceCategory`, with soft-delete toggle (`isActive = false`) and manual reordering controls (`sortOrder`) in lieu of generic SaaS data tables.
