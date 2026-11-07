# Ustaad-Ji (उस्ताद जी)

> **English Tagline:** No more waiting in line. Book your slot.  
> **Hindi Tagline:** अब लाइन में नहीं, स्लॉट में

A modern web application built specifically for traditional Indian neighbourhood salons and master barbers (*ustaads*). Customers find nearby parlours, browse authentic painted rate-card boards, pick a barber and a time slot in the register diary, and receive an authentic digital token slip without waiting in queue.

---

## Tech Stack
- **Framework:** Next.js 15 (App Router, strict TypeScript)
- **Styling:** Tailwind CSS with authentic Ustaad-Ji palette (`tile`, `tealDeep`, `paper`, `ink`, `marigold`, `saffron`, `maroon`, `steel`, `poleRed`, `poleBlue`, `chalk`)
- **Typography:** Google Fonts loaded with Latin & Devanagari subsets (`Yatra One`, `Hind`, `Baloo 2`, `Special Elite`)
- **Database & ORM:** PostgreSQL 16 (hosted on Supabase) + Prisma ORM (pooled on port 6543, direct on 5432)
- **Advanced DB Constraints:** PostgreSQL `btree_gist` extension, `booking_no_overlap` exclusion constraint (code `23P01`), check constraints for positive prices, ratings, and time order
- **i18n:** `next-intl` (English + Devanagari Hindi) with single-language rendering, cookie-first resolution, user profile synchronization, and zero URL path prefixes
- **Testing:** Vitest for unit, integration, and database constraint tests (110 tests)
- **PWA:** Web manifest (`public/manifest.json`) and offline fallback page (`src/app/~offline/page.tsx`)

---

## Prerequisites
- Node.js 18+ (tested on Node v24)
- A Supabase PostgreSQL database project (Supabase free tier works great)

---

## Database Setup (Supabase)

1. **Create a Supabase Project:**
   - Go to [Supabase](https://supabase.com) and create a project in your preferred region (e.g. `ap-south-1` Mumbai).
   - In **Project Settings > Database**, find your connection strings:
     - **Session / Transaction Pooler (Port 6543):** used for `DATABASE_URL` with `?pgbouncer=true&connection_limit=1`.
     - **Direct Connection (Port 5432):** used for `DIRECT_URL` during migrations.

2. **Environment Separation:**
   > [!IMPORTANT]
   > Development and production **MUST** use separate Supabase projects.
   > Never run `npm run db:seed` against a production database—it resets and re-populates test data.

3. **Supabase Inactivity & Troubleshooting:**
   - Free-tier Supabase projects automatically pause after a period of inactivity.
   - If you encounter an error like `"Can't reach database server"`, go to your Supabase dashboard and click **Restore Project**. It typically restores in under 2 minutes.

---

## Setup & Running

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and fill in your connection strings and secrets:
```env
# Pooled connection (port 6543) for runtime queries:
DATABASE_URL="postgresql://postgres.[REF]:[PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"

# Direct connection (port 5432) for Prisma migrations:
DIRECT_URL="postgresql://postgres.[REF]:[PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"

# Auth.js secret and OTP Pepper (generate using openssl rand -base64 32):
AUTH_SECRET="your-generated-base64-32-byte-secret"
OTP_PEPPER="your-generated-base64-32-byte-pepper"

APP_ENV="development"
ALLOW_TEST_OTP="true"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

To generate strong 32-byte base64 secrets on Linux / macOS or Windows Git Bash / WSL:
```bash
openssl rand -base64 32
```
Or in Node.js:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 3. Migrations & Seeding
```bash
# Apply schema tables, RLS security, and SQL exclusion constraints
npx prisma migrate dev

# Seed database with realistic test salons, barbers, services and users
npm run db:seed
```

### 4. Running the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application.

### 5. Running Tests & Linter
```bash
# Run Vitest test suite (all 75 tests across DB constraints, UI, Auth, and Slot Booking)
npm run test

# Run tests under strict UTC timezone
npm run test:utc

# Run tests under Asia/Kolkata (IST) timezone
npm run test:ist

# Run ESLint
npm run lint

# Run Next.js production build
npm run build
```


### 6. Management Scripts
```bash
# Interactively create an ADMIN user via CLI
npm run admin:create

# Clean up expired and consumed OTP codes older than 24 hours
npm run otp:cleanup
```

---

## Logging In & Testing Roles

In development mode (`APP_ENV="development"` with `ALLOW_TEST_OTP="true"`), the fixed test OTP code **`123456`** can be entered directly on the login page (`/login`) for the following seeded accounts:

| Role | Name | Phone Number | Test OTP | Default Landing / Access |
| --- | --- | --- | --- | --- |
| **ADMIN** | Admin Sahab | `9000000001` (or `+919000000001`) | `123456` | Has full access to `/admin` approval console |
| **OWNER** | Pandit Ramvilas Sharma | `9000000002` | `123456` | Redirects to `/dashboard` (Sharma Ji Gents Parlour) |
| **OWNER** | Javed Ustaad | `9000000003` | `123456` | Redirects to `/dashboard` (Royal Ustaad Mens Salon) |
| **BARBER** | Ustaad Rakesh Sharma | `9000000004` | `123456` | Redirects to `/dashboard` |
| **CUSTOMER** | Amit Verma | `9876543210` | `123456` | Redirects to `/bookings` (403 on `/dashboard` and `/admin`) |
| **NEW USER** | Any new 10-digit number | e.g. `9812345678` | Printed to terminal log (`[ConsoleOtpSender]`) | Auto-creates `CUSTOMER` account, lands on `/bookings` |

---

## Internationalization (i18n)

Ustaad-Ji provides true single-language rendering for **English** and **Hindi (हिन्दी)**:
- **No Path Prefixes:** All routes remain clean (`/salons`, `/book/[salonSlug]`).
- **Cookie-First Resolution:** The `NEXT_LOCALE` cookie stores user language preference (1-year lifetime, Lax, Secure).
- **Account Sync:** When an authenticated user changes language on `/account` or via the navbar toggle, their choice is saved to `User.language` in PostgreSQL.
- **Client State Preservation:** Changing languages triggers a server action setting `NEXT_LOCALE` followed by `router.refresh()`. In-progress slot selections and booking form states are preserved without full-page reloads.
- **Latin Numerals:** All prices, token numbers, dates, and times strictly use standard Latin digits (`0-9`) and the `₹` symbol across both locales (`-u-nu-latn`).
- **Authoritative Glossary:** See [docs/i18n-glossary.md](docs/i18n-glossary.md) for standard terminology and translation choices.

### How to Add a New Language (e.g. Marathi / मराठी `mr`)

1. **Register the Locale:**
   Add the new locale code to `locales` in `src/i18n/config.ts`:
   ```ts
   export const locales = ['en', 'hi', 'mr'] as const;
   ```
2. **Create Message Dictionary:**
   Create `src/messages/mr.json` by copying `src/messages/en.json` and translating the values into Marathi. Ensure all keys and `{placeholder}` variables match `en.json` exactly.
3. **Add Toggle Label:**
   In `src/messages/en.json`, `src/messages/hi.json`, and `src/messages/mr.json`, ensure appropriate language switcher button labels are provided.
4. **Run i18n Tests:**
   ```bash
   npx vitest run src/tests/phase3b-i18n.test.ts
   ```
   The test suite automatically asserts 100% key parity and placeholder parity across all registered language files.


