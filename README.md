# Indian Salon Booking Website (देसी सैलून, डिजिटल टोकन)

A web app designed specifically for traditional Indian neighbourhood salons and barber shops. Customers find nearby salons, browse authentic painted rate-card boards, pick a barber and a time slot in the register diary, and receive a digital paper token slip.

---

## Tech Stack
- **Framework:** Next.js 15 (App Router, strict TypeScript)
- **Styling:** Tailwind CSS with authentic Indian salon palette (`tile`, `tealDeep`, `paper`, `ink`, `marigold`, `saffron`, `maroon`, `steel`, `poleRed`, `poleBlue`, `chalk`)
- **Typography:** Google Fonts loaded with Latin & Devanagari subsets (`Yatra One`, `Hind`, `Baloo 2`, `Special Elite`)
- **Database & ORM:** PostgreSQL 16 (hosted on Supabase) + Prisma ORM (pooled on port 6543, direct on 5432)
- **Advanced DB Constraints:** PostgreSQL `btree_gist` extension, `booking_no_overlap` exclusion constraint (code `23P01`), check constraints for positive prices, ratings, and time order
- **i18n:** `next-intl` (English + Hindi) with cookie-based locale resolution preserving clean route URLs
- **Testing:** Vitest for unit and integration database tests
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

