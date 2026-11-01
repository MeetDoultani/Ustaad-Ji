# PROJECT PROMPT: Indian Salon Booking Website

You are a senior full-stack engineer and UI designer. Build the project described below from scratch, in this repository. Read the whole prompt before writing code.

## 0. How to work
1. First, reply with a short plan: folder structure, the order you will build things, and any questions or assumptions. Do not wait for answers on minor points; state your assumption and continue.
2. Build in the phases listed in section 7. Complete **Phases 0 to 4 now** (setup, themed UI, auth, booking, barber dashboard). Do NOT start Phases 5 to 7 until I ask.
3. After each phase: run the app, run the tests, fix errors, then give me a short summary (what works, how to run it, what is next). Do not move on with a broken build.
4. Keep code typed, small and readable. Prefer simple solutions. Do not add libraries without a reason.
5. Do not invent features outside this prompt. If something is unclear, make the simplest reasonable choice and note it in `docs/decisions.md`.

## 1. Product overview
A web app for traditional Indian neighbourhood salons and barber shops.

**Problem:** most Indian salons still run on a walk-in queue, so customers waste time waiting. Premium salons have websites, but they are expensive and not aimed at ordinary customers. Small salons have no good, cheap booking tool.

**Solution:** customers find nearby salons, see the price list, pick a barber and a time slot, and get a digital token. Barbers and owners manage their day from a simple phone-friendly dashboard. Later: home-visit barbers, live queue and wait times, peak-hour insights.

**Design goal:** the site must look and feel like a real Indian salon (painted rate-card board, paper token slips, appointment diary, mint wall tiles, barber pole), NOT like a generic SaaS or AI-template site. The full design brief is in section 11 and is mandatory.

## 2. Users and roles
| Role | What they can do |
| --- | --- |
| CUSTOMER | Browse salons, book, cancel or reschedule own bookings, view own tokens, review completed bookings, (later) request home visits |
| BARBER | See and manage own bookings and availability, mark customer checked-in / in-progress / completed / no-show, add walk-in tokens |
| OWNER | Everything a barber can for all barbers in own salon; edit salon profile, hours, services, prices; add and remove barbers; see salon bookings |
| ADMIN | Verify or suspend salons and barbers, view all data, handle disputes |

Rules: a user has exactly one role. Only VERIFIED salons and barbers appear publicly.

## 3. Tech stack (do not substitute without telling me)
- Next.js (App Router) + TypeScript (strict) + Tailwind CSS
- PostgreSQL with Prisma (schema in section 12); use a local Postgres via Docker Compose, with `DATABASE_URL` in `.env`; the app must also work with Supabase or Neon
- Auth: Auth.js (NextAuth) with a custom phone-number + OTP credentials flow (details in section 5)
- Validation: Zod on every API input and form
- i18n: `next-intl`, English + Hindi, structured so more languages can be added
- Tests: Vitest for unit tests; Playwright is optional
- Fonts via `next/font`: Yatra One, Hind, Baloo 2, Special Elite (Latin + Devanagari subsets)
- Mobile-first PWA: web manifest, installable, offline fallback page
- ESLint + Prettier configured; `npm run lint`, `npm run test`, `npm run dev`, `npm run db:seed` must work

Suggested structure:
```
/docs                design-brief.md, decisions.md, schema notes
/prisma              schema.prisma, migrations, seed.ts
/src/app             routes (App Router)
/src/components      ui/ (design-system components), features/
/src/lib             db.ts, auth.ts, policies.ts, slots.ts, otp.ts, tokens.ts, time.ts
/src/messages        en.json, hi.json
/src/tests           unit tests
```
Keep business logic (slot generation, token allocation, policies) in `/src/lib` as pure, testable functions, not inside components.

## 4. Pages and routes
Public: `/` home, `/salons` list with filters, `/salons/[slug]` salon page (rate card board, barbers, diary slot picker, reviews), `/login`.
Customer: `/book/[salonSlug]` booking flow, `/bookings` my bookings, `/bookings/[id]` token slip.
Barber/Owner: `/dashboard` today's register, `/dashboard/bookings`, `/dashboard/services`, `/dashboard/hours`, `/dashboard/barbers` (owner only), `/dashboard/walk-in`.
Admin: `/admin` list of pending salons and barbers with approve / reject / suspend.
Also: custom 404, error and loading states in the same visual theme.

## 5. Authentication and authorization (security-critical)
**Login with phone + OTP**
- User enters a phone number (validate and normalise to E.164, default country +91). Server generates a 6-digit OTP, stores only a **hash** (`OtpCode.codeHash`), expires it in 5 minutes, and sends it through an `OtpSender` interface.
- Provide a `ConsoleOtpSender` for development (prints the code to the server log) and leave a clearly marked stub for an SMS provider (MSG91 or Twilio) to plug in later. In development only, allow a fixed test OTP `123456` for seeded test numbers.
- Rate limits: max 3 OTP requests per phone per 10 minutes, and max 5 wrong attempts per OTP code, then invalidate it. Also add a simple per-IP limit.
- On first successful login, create the `User` with role CUSTOMER. Barber and owner accounts are created through the owner/admin flows or seed data, not by choosing a role at sign-up.
- Use database or JWT sessions through Auth.js with httpOnly, secure, SameSite cookies. Never put secrets or OTP data in client code.

**Authorization**
- Create one central policy module (`src/lib/policies.ts`) with functions like `canViewBooking(user, booking)`, `canManageSalon(user, salon)`, `canUpdateBookingStatus(user, booking)`. Use it in **every** server action and route handler.
- Never trust the role or IDs sent by the client. Always load the session user on the server and check ownership: a customer can only see their own bookings; a barber only bookings assigned to them; an owner only their own salon; only ADMIN can approve salons and barbers.
- Protect `/dashboard` and `/admin` with middleware plus server-side checks (middleware alone is not enough).
- Return 401 for not logged in, 403 for logged in but not allowed, and never leak whether another user's record exists.
- Add unit tests proving that a customer cannot read another customer's booking, an owner cannot edit another salon, and a barber cannot update another barber's booking.
- Sanitise and validate all input; use Prisma parameterised queries only; no raw SQL string building from user input.

## 6. Booking logic (core of the app)
- All stored times are UTC; the salon timezone is `Asia/Kolkata`. Put time helpers in `src/lib/time.ts`.
- **Slot generation** (`src/lib/slots.ts`, pure function): for a barber and date, start from `Availability` windows for that weekday, remove `TimeOff`, remove time covered by existing active bookings (PENDING, CONFIRMED, CHECKED_IN, IN_PROGRESS), and return start times on a 15-minute grid where the full service duration fits. The duration is the sum of the selected services. Do not offer slots in the past; require a minimum lead time of 15 minutes and a maximum advance of 14 days (make these constants).
- **Creating a booking** happens in one database transaction: validate the selected services belong to the salon and the barber performs them; compute total price and duration from current service data; allocate the next token with `DailyTokenCounter` (increment inside the transaction); insert `Booking` and `BookingItem` rows (copy price and duration into the items).
- **Double booking:** rely on the Postgres exclusion constraint in `booking_constraints.sql` as the final guard. Catch the constraint violation error (Postgres code 23P01) and return a friendly "slot just got taken, pick another" response. Do not rely on the UI check alone.
- **Cancel / reschedule:** a customer can cancel until 1 hour before the start (constant); rescheduling means cancel + create inside one transaction. Barbers and owners can cancel with a reason.
- **Statuses:** CONFIRMED (or PENDING if the salon requires approval) -> CHECKED_IN -> IN_PROGRESS -> COMPLETED, or CANCELLED / REJECTED / NO_SHOW. Record `checkedInAt`, `startedAt`, `completedAt` timestamps when status changes (they power analytics later).
- **Walk-ins:** the barber or owner can add a walk-in token (name and optional phone). It creates a Booking with `source = WALK_IN` and takes the next free time for that barber starting now.
- Write Vitest tests for slot generation (edge cases: back-to-back bookings, time off, end of day, duration longer than gap) and for the booking transaction and token numbering.

## 7. Feature list per phase

**Phase 0: Setup**
Project scaffold, Tailwind theme with design tokens, fonts, ESLint/Prettier, Prisma + Docker Postgres, schema migration, run `booking_constraints.sql` as a migration, seed script, README with run instructions, `docs/` folder with this prompt, design brief and decisions.

**Phase 1: Themed UI and static pages**
Design-system components from the brief: signboard header, rate card board, token slip, diary slot picker (with mock data first), ustaad (barber) card, queue-board placeholder, buttons, form inputs, barber-pole divider, tile backgrounds. Pages: home, salon list, salon page, 404. Fully responsive from 360px. Use seeded database data for salons and services.

**Phase 2: Auth and roles**
Phone + OTP login, sessions, role-aware navigation, protected routes, policy module, authorization tests, admin approval of salons and barbers.

**Phase 3: Booking**
Real slot generation, booking flow (service -> barber -> slot -> confirm), token slip page, my bookings, cancel and reschedule, friendly slot-conflict handling.

**Phase 4: Barber and owner dashboard**
Today's register view with a big "Next customer" action, status updates, walk-in token button, service and price editor, weekly hours and availability editor, time-off, owner can manage barbers, simple booking history. Works one-handed on a phone.

**Phases 5 to 7: DO NOT BUILD YET** (design the code so they fit later)
- Phase 5: WhatsApp / SMS reminders and notifications (provider interface, queue).
- Phase 6: Home-visit service: customer address, salon travel radius and fee, barber verification and ratings, maps.
- Phase 7: Crowd and peak hours: live "people waiting" and estimated wait per salon (sum of remaining durations ahead in the queue), peak-hours chart by weekday and hour from historical bookings and walk-ins, live updates via polling or server-sent events, owner insights page.
Also later: Razorpay payments, regional languages, reviews moderation.

## 8. Seed data (`npm run db:seed`)
Create realistic data: 2 salons (one verified with a Hindi name, one pending approval), 4 barbers with photos as placeholder illustrations, 12 to 15 services with realistic Indian prices (for example haircut ₹80-150, beard trim ₹40-80, shave ₹30-60, head massage ₹100-200, facial ₹200-500), weekly availability, sample bookings across statuses, and test users: 1 admin, 1 owner per salon, barbers, and 3 customers. Print the test phone numbers at the end of the seed.

## 9. Non-functional requirements
- Mobile-first; tap targets at least 44px; first screen under about 200KB of images on mobile.
- Accessibility: contrast at least 4.5:1, keyboard navigable, labelled form controls, slot status never shown by colour alone.
- Respect `prefers-reduced-motion`.
- Loading skeletons and error boundaries in the theme; helpful empty states in Hinglish.
- Basic SEO: page titles, meta descriptions, Open Graph, `robots.txt`, sitemap for salon pages.
- Environment variables documented in `.env.example`; no secrets committed.
- A clear README: prerequisites, setup, how to run, how to test, test logins.

## 10. Definition of done (for Phases 0 to 4)
- `npm run dev` runs; seeded app is usable end to end: customer logs in with OTP, books a slot, sees the token; a barber logs in, sees it, and marks it completed; admin approves the pending salon.
- Lint and tests pass; authorization tests pass.
- Two customers cannot book overlapping slots for the same barber (verified by a test that hits the database constraint).
- UI follows the design brief; no generic template look.

---

# 11. DESIGN BRIEF (mandatory)

Goal: the site should feel like walking into a real Indian neighbourhood salon, not like a SaaS template. Every screen should use at least one salon-world element (rate board, token, diary, tiles, mirror frame, barber pole).

### 1. Design principles
1. **Salon-world metaphors, not decoration.** The price list is a painted board, the confirmation is a paper token, the slot picker is the appointment diary. Each metaphor must also be usable.
2. **Warm and busy, but organised.** Real salons are colourful and crowded; the UI can be rich as long as the layout stays clean and the main action is obvious.
3. **Mobile first.** Most users are on phones, often on slow data. Design at 360px wide first; tap targets at least 44px.
4. **Bilingual by default.** Hindi (Devanagari) beside English in headings, buttons and key labels. Add a language toggle later for more regional languages.
5. **Plain language, Hinglish tone.** Friendly, local, never corporate.

### 2. Colour palette
Define these as design tokens (CSS variables / Tailwind theme). Do not introduce purple, blue-purple gradients or neon.

| Token | Hex | Use |
| --- | --- | --- |
| `tile` | `#8FD0BC` | Wall-tile mint; section backgrounds, tile pattern |
| `teal-deep` | `#0F5E57` | Headers, primary dark surfaces |
| `paper` | `#F6EBD0` | Page background, token slips (aged paper) |
| `ink` | `#2B2118` | Body text on paper |
| `marigold` | `#F2A900` | Primary buttons, highlights |
| `saffron` | `#E8731A` | Secondary accent, hover states |
| `maroon` | `#7A1F2B` | Signboard frames, headings on paper |
| `steel` | `#8A9299` | Borders, chair and tool icons, disabled states |
| `pole-red` | `#C8262F` | Barber-pole stripe, alerts |
| `pole-blue` | `#1E4F9C` | Barber-pole stripe only; use sparingly |
| `chalk` | `#FFFFFF` | Pole stripe, card highlights |

Rules: body text is always `ink` on `paper` (or white on `teal-deep`). Marigold buttons use `ink` text, not white. No gradients except subtle paper-grain texture.

### 3. Typography
| Role | Font | Notes |
| --- | --- | --- |
| Signboard headings | **Yatra One** | Supports Devanagari and Latin; looks hand-painted. Use for H1/H2 and the logo. |
| Body text | **Hind** | Clean, supports Devanagari. 16px minimum. |
| Buttons and labels | **Baloo 2** | Rounded, friendly, bold. |
| Token numbers and prices | **Special Elite** (typewriter) | Paper-token and receipt feel. |

Pair every English heading with a Hindi line, e.g. "Book Your Slot" / "अपना समय बुक करें", the Hindi slightly smaller beneath it. Load fonts with `next/font` and subset to Latin + Devanagari.

### 4. Signature components

#### 4.1 Signboard header
Maroon painted-board header with a thin marigold border and the salon name in Yatra One. A small barber pole icon beside the logo. On scroll it shrinks to a slim bar; keep the pole visible.

#### 4.2 Rate card board (price list)
- Dark teal board with a wooden or maroon frame and slight chalk-texture.
- Each row: service name (English + Hindi), dotted leader line, price in ₹ in the typewriter font.
- Group under hand-lettered subheads: बाल / Hair, दाढ़ी / Beard, फेशियल / Facial, Head Massage, Home Visit.
- Each row has a small "Book" tap target; the row highlights marigold when selected.
- Never render this as a standard pricing table or card grid.

#### 4.3 Token slip (booking confirmation)
- Cream paper rectangle with perforated left and right edges (CSS radial-gradient mask), slightly rotated (about -1.5deg).
- Big token number ("Token No. 14") in the typewriter font, then salon, barber, service, date and time.
- A circular maroon "CONFIRMED / पक्का" rubber stamp overlapping the corner.
- Entry animation: slides down as if torn from a roll. Provide a "Save as image" button and a WhatsApp share.

#### 4.4 Register diary slot picker
- Ruled notebook page with red margin line and a spiral or stitched binding down the left.
- Time slots written as lines in the diary; available slots in ink, booked slots struck through with a pen line, selected slot circled in marigold.
- Day tabs styled as diary page tabs (Aaj / आज, Kal / कल, then dates).
- Slot length follows the chosen service duration.

#### 4.5 Barber cards ("Ustaad" cards)
- Photo inside an ornate mirror-style frame (maroon and gold CSS border, rounded top corners).
- Name, years of experience, specialities, rating, and an "Available now / Next free at 4:30" label.
- Use only barber-supplied or illustrated photos, never stock film-star imagery.

#### 4.6 Live queue board (phase 7)
Small digital "Now serving" display styled like a shop counter display: red seven-segment digits for the current token, "People waiting" and "Approx. wait" below. Reuse this on the salon page and the owner dashboard.

#### 4.7 Dividers and backgrounds
- Section divider: horizontal barber-pole stripe (red, white, blue) with a diagonal repeating gradient, animated slowly or static on reduced-motion.
- Background: subtle mint tile pattern (CSS grid with 1px grout lines) behind hero and footer; paper texture for content areas.
- Optional truck-art style floral border on the landing page hero, drawn as SVG, not a photo.

#### 4.8 Buttons
- Primary: marigold fill, 2px ink border, small hard offset shadow (like a printed sticker), Baloo 2 text. Pressed state sinks the shadow.
- Secondary: paper fill with maroon border.
- Destructive: pole-red fill.
- Disabled: steel text on paper.

### 5. Pages and key content
1. **Home:** hero with signboard headline ("Ab line mein nahi, slot mein / अब लाइन में नहीं, स्लॉट में"), search by area or salon, three steps (choose salon, pick slot, get token), featured salons as mirror-frame cards.
2. **Salon list:** filter chips (Hair, Beard, Home Visit, Open now), cards with price-from, rating and a live "waiting" badge later.
3. **Salon page:** signboard header, ustaad cards, rate card board, diary slot picker, reviews styled as pinned slips.
4. **Booking flow:** service(s) from the rate card, barber, diary slot, phone OTP (if logged out), review, token.
5. **My bookings:** token slips stacked like a spike file; cancel and reschedule actions.
6. **Auth:** phone number, OTP boxes styled as token digits, role selector for barbers and owners.
7. **Barber / owner dashboard:** today's list as a register, big "Next customer" button, walk-in token button, service and hours editor. Large touch targets; works one-handed.
8. **Admin:** plain, functional tables are fine here; apply the palette and fonts only.

### 6. Microcopy (Hinglish tone)
| Moment | Text |
| --- | --- |
| Booking confirmed | "Aapka number: 14. Dhanyavaad!" / "आपका नंबर: 14" |
| Slot taken | "Yeh slot bhar gaya hai, doosra chuniye." |
| Empty bookings | "Abhi koi booking nahi. Pehla slot book karein?" |
| Wait info | "Aapse pehle 3 log hain, lagbhag 25 minute." |
| OTP sent | "OTP bhej diya gaya hai." |
| Error | "Kuch gadbad ho gayi. Dobara try karein." |

### 7. Motion
- Token slide-down on confirmation, diary page-turn between days, slow barber-pole stripe movement.
- Keep animations under 400ms and respect `prefers-reduced-motion`.

### 8. Accessibility and performance
- Text contrast at least 4.5:1; check marigold and mint backgrounds with ink text.
- Never rely on colour alone for slot status; booked slots are also struck through.
- Optimise images (WebP, lazy load); target under 200KB for the first screen on mobile data.
- Support the system font scale up to 130% without breaking layouts.

### 9. Do not
- No purple or blue-purple gradients, glassmorphism or generic rounded white card grids.
- No default system fonts or Inter/Roboto as the look.
- No stock-photo hero of a generic modern salon.
- No film-star posters or copyrighted imagery; use original illustration or the salons' own photos.
- No standard pricing table for services; always use the rate card board.

### 10. Tailwind tokens (starter)
```ts
// tailwind.config.ts (extend theme)
colors: {
  tile: '#8FD0BC',
  tealDeep: '#0F5E57',
  paper: '#F6EBD0',
  ink: '#2B2118',
  marigold: '#F2A900',
  saffron: '#E8731A',
  maroon: '#7A1F2B',
  steel: '#8A9299',
  poleRed: '#C8262F',
  poleBlue: '#1E4F9C',
},
fontFamily: {
  sign: ['"Yatra One"', 'serif'],
  body: ['Hind', 'sans-serif'],
  label: ['"Baloo 2"', 'sans-serif'],
  token: ['"Special Elite"', 'monospace'],
},
```

---

# 12. DATABASE SCHEMA (use exactly this as `prisma/schema.prisma`)

```prisma
// schema.prisma
// Indian salon booking website
//
// Notes
// - Auth library tables (sessions, accounts) are NOT here: let Auth.js / Supabase Auth add its own.
//   Our User table is the app-level profile; link it to the auth identity by phone.
// - Money is stored as whole rupees (Int). Times are stored in UTC (timestamptz); show them in IST.
// - On Prisma 7 or newer the datasource url may move into prisma.config.ts; keep the models as they are.
// - Run booking_constraints.sql after the first migration. Prisma cannot express those rules.

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ---------------------------------------------------------------- enums

enum Role {
  CUSTOMER
  BARBER
  OWNER
  ADMIN
}

enum VerificationStatus {
  PENDING
  VERIFIED
  REJECTED
  SUSPENDED
}

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

enum BookingType {
  IN_SALON
  HOME_VISIT
}

enum BookingSource {
  ONLINE
  WALK_IN
}

enum BookingStatus {
  PENDING // waiting for barber/owner to accept (if the salon requires it)
  CONFIRMED
  CHECKED_IN // customer has reached the salon (feeds the live queue later)
  IN_PROGRESS
  COMPLETED
  CANCELLED
  REJECTED
  NO_SHOW
}

// ---------------------------------------------------------------- users and login

model User {
  id        String   @id @default(cuid())
  phone     String   @unique // E.164, e.g. +919876543210
  name      String?
  email     String?  @unique
  role      Role     @default(CUSTOMER)
  language  String   @default("en") // "en", "hi", later regional languages
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now()) @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @db.Timestamptz(3)

  ownedSalons   Salon[]
  barberProfile Barber?
  addresses     Address[]
  bookings      Booking[] @relation("CustomerBookings")
  reviews       Review[]
}

// One row per OTP sent. Store only a hash of the code, never the code itself.
// Use attempts + createdAt to rate-limit and lock out guessing.
model OtpCode {
  id         String    @id @default(cuid())
  phone      String
  codeHash   String
  expiresAt  DateTime  @db.Timestamptz(3)
  attempts   Int       @default(0)
  consumedAt DateTime? @db.Timestamptz(3)
  createdAt  DateTime  @default(now()) @db.Timestamptz(3)

  @@index([phone, createdAt])
}

model Address {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  label     String? // "Home", "Office"
  line1     String
  line2     String?
  area      String
  city      String
  pincode   String
  lat       Float?
  lng       Float?
  createdAt DateTime @default(now()) @db.Timestamptz(3)

  bookings Booking[]

  @@index([userId])
}

// ---------------------------------------------------------------- salons, barbers, services

model Salon {
  id          String             @id @default(cuid())
  ownerId     String
  owner       User               @relation(fields: [ownerId], references: [id])
  slug        String             @unique
  name        String
  nameHi      String?
  description String?
  phone       String?
  addressLine String
  area        String
  city        String
  pincode     String
  lat         Float?
  lng         Float?
  status      VerificationStatus @default(PENDING) // only VERIFIED salons are listed publicly
  offersHomeVisit Boolean        @default(false)
  homeVisitRadiusKm Int?
  homeVisitFeeRupees Int?
  requiresApproval Boolean       @default(false) // if true, new online bookings start as PENDING
  createdAt   DateTime           @default(now()) @db.Timestamptz(3)
  updatedAt   DateTime           @updatedAt @db.Timestamptz(3)

  hours    SalonHours[]
  barbers  Barber[]
  services Service[]
  bookings Booking[]
  reviews  Review[]
  tokenCounters DailyTokenCounter[]

  @@index([city, area])
  @@index([status])
}

// Opening hours for display and for "open now". Weekday: 0 = Sunday ... 6 = Saturday.
model SalonHours {
  id        String  @id @default(cuid())
  salonId   String
  salon     Salon   @relation(fields: [salonId], references: [id], onDelete: Cascade)
  weekday   Int
  openMin   Int // minutes from midnight local time, e.g. 9:30 = 570
  closeMin  Int
  isClosed  Boolean @default(false)

  @@unique([salonId, weekday])
}

model Barber {
  id              String             @id @default(cuid())
  userId          String             @unique
  user            User               @relation(fields: [userId], references: [id])
  salonId         String
  salon           Salon              @relation(fields: [salonId], references: [id])
  displayName     String
  bio             String?
  photoUrl        String?
  experienceYears Int                @default(0)
  status          VerificationStatus @default(PENDING)
  doesHomeVisits  Boolean            @default(false)
  isActive        Boolean            @default(true)
  createdAt       DateTime           @default(now()) @db.Timestamptz(3)

  services     BarberService[]
  availability Availability[]
  timeOff      TimeOff[]
  bookings     Booking[]
  reviews      Review[]

  @@index([salonId])
}

model Service {
  id             String          @id @default(cuid())
  salonId        String
  salon          Salon           @relation(fields: [salonId], references: [id], onDelete: Cascade)
  category       ServiceCategory
  name           String
  nameHi         String?
  durationMin    Int
  priceRupees    Int
  homeVisitOk    Boolean         @default(false)
  isActive       Boolean         @default(true)
  sortOrder      Int             @default(0) // order on the rate card board

  barbers      BarberService[]
  bookingItems BookingItem[]

  @@index([salonId, category])
}

// Which barber performs which service.
model BarberService {
  barberId  String
  barber    Barber  @relation(fields: [barberId], references: [id], onDelete: Cascade)
  serviceId String
  service   Service @relation(fields: [serviceId], references: [id], onDelete: Cascade)

  @@id([barberId, serviceId])
}

// Weekly working windows. A barber can have several rows per weekday (split shifts).
model Availability {
  id       String @id @default(cuid())
  barberId String
  barber   Barber @relation(fields: [barberId], references: [id], onDelete: Cascade)
  weekday  Int // 0 = Sunday ... 6 = Saturday
  startMin Int // minutes from midnight local time
  endMin   Int

  @@index([barberId, weekday])
}

// Leave, breaks, one-off closures.
model TimeOff {
  id       String   @id @default(cuid())
  barberId String
  barber   Barber   @relation(fields: [barberId], references: [id], onDelete: Cascade)
  startsAt DateTime @db.Timestamptz(3)
  endsAt   DateTime @db.Timestamptz(3)
  reason   String?

  @@index([barberId, startsAt])
}

// ---------------------------------------------------------------- bookings and tokens

// One booking = one barber, one continuous time block, one or more services.
// A walk-in customer is also a Booking (source = WALK_IN), so queue and peak-hour data
// come from a single table. Walk-ins may have no user account.
model Booking {
  id         String        @id @default(cuid())
  token      Int // shown on the token slip; unique per salon per day
  tokenDate  DateTime      @db.Date
  salonId    String
  salon      Salon         @relation(fields: [salonId], references: [id])
  barberId   String
  barber     Barber        @relation(fields: [barberId], references: [id])
  customerId String?
  customer   User?         @relation("CustomerBookings", fields: [customerId], references: [id], onDelete: SetNull)
  walkInName  String?
  walkInPhone String?
  type       BookingType   @default(IN_SALON)
  source     BookingSource @default(ONLINE)
  status     BookingStatus @default(CONFIRMED)
  startsAt   DateTime      @db.Timestamptz(3)
  endsAt     DateTime      @db.Timestamptz(3)
  totalRupees Int
  addressId  String? // required when type = HOME_VISIT (enforced in SQL)
  address    Address?      @relation(fields: [addressId], references: [id])
  notes      String?
  cancelledAt DateTime?    @db.Timestamptz(3)
  cancelReason String?

  // Timestamps for crowd and wait-time analytics (phase 7)
  checkedInAt DateTime? @db.Timestamptz(3)
  startedAt   DateTime? @db.Timestamptz(3)
  completedAt DateTime? @db.Timestamptz(3)

  createdAt DateTime @default(now()) @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @db.Timestamptz(3)

  items  BookingItem[]
  review Review?

  @@unique([salonId, tokenDate, token])
  @@index([barberId, startsAt])
  @@index([salonId, startsAt])
  @@index([customerId])
}

// Price and duration are copied at booking time so later menu edits don't change old bookings.
model BookingItem {
  id          String  @id @default(cuid())
  bookingId   String
  booking     Booking @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  serviceId   String
  service     Service @relation(fields: [serviceId], references: [id])
  priceRupees Int
  durationMin Int

  @@index([bookingId])
}

// Hands out the next token number for a salon on a given day.
// Increment it inside the same transaction that creates the booking.
model DailyTokenCounter {
  salonId String
  salon   Salon    @relation(fields: [salonId], references: [id], onDelete: Cascade)
  date    DateTime @db.Date
  last    Int      @default(0)

  @@id([salonId, date])
}

// ---------------------------------------------------------------- reviews

// Only the customer of a COMPLETED booking may review it, one review per booking.
model Review {
  id         String   @id @default(cuid())
  bookingId  String   @unique
  booking    Booking  @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  customerId String
  customer   User     @relation(fields: [customerId], references: [id])
  salonId    String
  salon      Salon    @relation(fields: [salonId], references: [id])
  barberId   String?
  barber     Barber?  @relation(fields: [barberId], references: [id])
  rating     Int // 1 to 5, enforced in SQL
  comment    String?
  createdAt  DateTime @default(now()) @db.Timestamptz(3)

  @@index([salonId])
  @@index([barberId])
}
```

---

# 13. SQL CONSTRAINTS (add as a Prisma migration after the tables exist: `prisma migrate dev --create-only`, paste this in, then apply)

```sql
-- booking_constraints.sql
-- Run this AFTER the first `prisma migrate` has created the tables.
-- Put it in a migration file (prisma migrate dev --create-only, then paste this in)
-- so every environment gets the same rules.

-- Needed so a plain column (barberId) can be used together with a time range in one constraint.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1. No double booking.
-- The same barber can never have two active bookings whose time ranges overlap.
-- This is stronger than a unique(barberId, startsAt) rule, which only catches identical start
-- times and would let a 10:00-10:45 booking overlap a 10:30-11:00 one.
-- '[)' means start is included and end is excluded, so back-to-back bookings are fine.
ALTER TABLE "Booking"
  ADD CONSTRAINT booking_no_overlap
  EXCLUDE USING gist (
    "barberId" WITH =,
    tstzrange("startsAt", "endsAt", '[)') WITH &&
  )
  WHERE ("status" IN ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'));

-- 2. A booking must end after it starts.
ALTER TABLE "Booking"
  ADD CONSTRAINT booking_time_order CHECK ("endsAt" > "startsAt");

-- 3. Home visits must have an address.
ALTER TABLE "Booking"
  ADD CONSTRAINT booking_home_needs_address
  CHECK ("type" <> 'HOME_VISIT' OR "addressId" IS NOT NULL);

-- 4. Ratings are 1 to 5.
ALTER TABLE "Review"
  ADD CONSTRAINT review_rating_range CHECK ("rating" BETWEEN 1 AND 5);

-- 5. Weekday and minute ranges.
ALTER TABLE "Availability"
  ADD CONSTRAINT availability_valid CHECK (
    "weekday" BETWEEN 0 AND 6
    AND "startMin" >= 0 AND "endMin" <= 1440
    AND "endMin" > "startMin"
  );

ALTER TABLE "SalonHours"
  ADD CONSTRAINT salon_hours_valid CHECK (
    "weekday" BETWEEN 0 AND 6
    AND "openMin" >= 0 AND "closeMin" <= 1440
    AND ("isClosed" OR "closeMin" > "openMin")
  );

ALTER TABLE "TimeOff"
  ADD CONSTRAINT time_off_order CHECK ("endsAt" > "startsAt");

-- 6. Prices and durations cannot be negative or zero.
ALTER TABLE "Service"
  ADD CONSTRAINT service_positive CHECK ("priceRupees" >= 0 AND "durationMin" > 0);
```

---

Now begin with the short plan (section 0, step 1), then build Phase 0.
