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


