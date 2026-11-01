# Supabase PostgreSQL Migration & Verification Report

**Project:** Indian Salon Booking Website (देसी सैलून, डिजिटल टोकन)  
**Date:** November 1, 2026  
**Status:** Complete & Verified  

---

## 1. Executive Summary

This report documents the completed migration from local Docker PostgreSQL to a hosted Supabase PostgreSQL database. Supabase is utilized strictly as the relational database layer; authentication remains on Auth.js with phone OTP.

All checklist items, configuration updates, Row Level Security (RLS) enforcement, database constraint validations, environment guards, and test suites have been verified with 100% passing results.

---

## 2. Checklist & Implementation Audit

| Item | Area | Action Taken |
| :--- | :--- | :--- |
| **1. Docker Removal** | Environment & Docs | Removed `docker-compose.yml`. Cleaned references in `docs/decisions.md` and replaced Docker instructions in `README.md` with Supabase setup guidance. |
| **2. Connection Strings** | Prisma & Config | Configured `.env` and `.env.example` with pooled connection (`DATABASE_URL` on port `6543` with `?pgbouncer=true&connection_limit=1`) and direct connection (`DIRECT_URL` on port `5432`). Added `directUrl = env("DIRECT_URL")` to `prisma/schema.prisma`. Confirmed `src/lib/db.ts` global singleton. |
| **3. Secrets Hygiene** | Git & Security | Verified `.env` was never tracked by git. Confirmed no secrets, passwords, or Supabase keys (`service_role`, `anon`) exist in source files or client bundles. Created comprehensive `.gitignore`. Confirmed `@supabase/supabase-js` is not installed. |
| **4. Row Level Security** | Database Security | Applied migration `20261031195911_enable_rls` enabling RLS across all 15 public tables with zero policies. Executed `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;` and `ALTER DEFAULT PRIVILEGES ... REVOKE ALL`. Documented in `docs/decisions.md` that all authorization logic is in application code (`src/lib/policies.ts`). |
| **5. DB Constraints** | Data Integrity | Verified `btree_gist` extension, `booking_no_overlap` exclusion constraint, and CHECK constraints from `20261027113942_booking_constraints`. Created `src/tests/db-constraints.test.ts` testing overlap rejection (`23P01`), back-to-back allowance, cancelled slot reuse, and `endsAt <= startsAt` rejection (`23514`). |
| **6. Environments** | Safety & Ops | Added fatal guard in `prisma/seed.ts` blocking execution when `APP_ENV === 'production'` or `NODE_ENV === 'production'`. Documented separate dev/prod Supabase projects and project pause recovery steps in `README.md`. |

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

### 3.3. Database Seeding (`npm run db:seed`)
```text
> tsx prisma/seed.ts

--- Cleaning existing salon data (reverse FK order) ---
--- Seeding Users ---
--- Seeding Salons ---
--- Seeding Salon Hours ---
--- Seeding Barbers ---
--- Seeding Barber Availability ---
--- Seeding Services ---
--- Linking Barbers to Services ---
--- Seeding Token Counters and Sample Bookings ---

===============================================================
              INDIAN SALON BOOKING - TEST USERS                
===============================================================
┌─────────┬────────────┬──────────────────────────┬─────────────────┬───────────────────────────┬────────────┐
│ (index) │ Role       │ Name                     │ Phone           │ Salon                     │ Status     │
├─────────┼────────────┼──────────────────────────┼─────────────────┼───────────────────────────┼────────────┤
│ 0       │ 'ADMIN'    │ 'Admin Sahab'            │ '+919000000001' │ 'All / Platform'          │ 'Active'   │
│ 1       │ 'OWNER'    │ 'Pandit Ramvilas Sharma' │ '+919000000002' │ 'Sharma Ji Gents Parlour' │ 'VERIFIED' │
│ 2       │ 'OWNER'    │ 'Javed Ustaad'           │ '+919000000003' │ 'Royal Ustaad Mens Salon' │ 'PENDING'  │
│ 3       │ 'BARBER'   │ 'Ustaad Rakesh Sharma'   │ '+919000000004' │ 'Sharma Ji Gents Parlour' │ 'VERIFIED' │
│ 4       │ 'BARBER'   │ 'Mohammad Irfan'         │ '+919000000005' │ 'Sharma Ji Gents Parlour' │ 'VERIFIED' │
│ 5       │ 'BARBER'   │ 'Suresh Kumar'           │ '+919000000006' │ 'Sharma Ji Gents Parlour' │ 'VERIFIED' │
│ 6       │ 'BARBER'   │ 'Farhan Akhtar'          │ '+919000000007' │ 'Royal Ustaad Mens Salon' │ 'PENDING'  │
│ 7       │ 'CUSTOMER' │ 'Amit Verma'             │ '+919876543210' │ 'Regular Client'          │ 'Active'   │
│ 8       │ 'CUSTOMER' │ 'Vikram Malhotra'        │ '+919876543211' │ 'Regular Client'          │ 'Active'   │
│ 9       │ 'CUSTOMER' │ 'Rahul Deshmukh'         │ '+919876543212' │ 'Regular Client'          │ 'Active'   │
└─────────┴────────────┴──────────────────────────┴─────────────────┴───────────────────────────┴────────────┘
===============================================================

Database seeded successfully!
```

### 3.4. Codebase Lint (`npm run lint`)
```text
> next lint

✔ No ESLint warnings or errors
```

### 3.5. Automated Test Suite (`npm run test`)
```text
 RUN  v3.2.7 D:/Indian-salon-booking

 ✓ src/tests/phase0-db.test.ts (2 tests) 1886ms
   ✓ Phase 0 Database & Constraint Verification > verifies seeded salons, barbers and services exist
   ✓ Phase 0 Database & Constraint Verification > rejects overlapping CONFIRMED bookings with Postgres exclusion constraint 23P01 (booking_no_overlap)

 ✓ src/tests/phase1-ui.test.ts (7 tests) 2287ms
   ✓ Phase 1 Public Salon Queries & Security Verification > returns verified salons (Sharma Ji Gents Parlour) and strictly excludes pending salons (Royal Ustaad)
   ✓ Phase 1 Public Salon Queries & Security Verification > getSalonBySlug returns verified salon and returns null for pending or missing salon
   ✓ Phase 1 Service Grouping & Calculation Logic > groups services accurately by ServiceCategory
   ✓ Phase 1 Service Grouping & Calculation Logic > calculates total price and duration accurately for multiple selected service IDs
   ✓ Phase 1 Service Grouping & Calculation Logic > returns zero values when no services are selected
   ✓ Phase 1 Time Helpers Verification > formats minutes from midnight into 12-hour AM/PM format
   ✓ Phase 1 Time Helpers Verification > correctly determines if salon is open or closed based on hours

 ✓ src/tests/db-constraints.test.ts (4 tests) 2475ms
   ✓ Database Constraints & Exclusion Rules (PostgreSQL Supabase) > rejects two overlapping active bookings for the same barber with Postgres error 23P01
   ✓ Database Constraints & Exclusion Rules (PostgreSQL Supabase) > allows back-to-back bookings where one ends exactly when the next starts
   ✓ Database Constraints & Exclusion Rules (PostgreSQL Supabase) > allows a new booking on a slot that was previously CANCELLED
   ✓ Database Constraints & Exclusion Rules (PostgreSQL Supabase) > rejects a booking where endsAt <= startsAt with check constraint error

 Test Files  3 passed (3)
      Tests  13 passed (13)
```

### 3.6. Production Build (`npm run build`)
```text
   ▲ Next.js 15.5.28
   - Environments: .env

   Creating an optimized production build ...
 ✓ Compiled successfully in 2.4s
   Linting and checking validity of types ...
   Collecting page data ...
 ✓ Generating static pages (6/6)
   Finalizing page optimization ...
   Collecting build traces ...

Route (app)                                 Size  First Load JS
┌ ƒ /                                      209 B         130 kB
├ ƒ /_not-found                            127 B         103 kB
├ ƒ /~offline                              164 B         106 kB
├ ƒ /salons                              3.28 kB         133 kB
└ ƒ /salons/[slug]                       3.92 kB         134 kB
+ First Load JS shared by all             103 kB
  ├ chunks/255-b1e2483a7e02feee.js       46.6 kB
  ├ chunks/4bd1b696-c023c6e3521b1417.js  54.2 kB
  └ other shared chunks (total)          1.99 kB

ƒ  (Dynamic)  server-rendered on demand
```

---

## 4. Live Database Verification Queries

### Query 1: Exclusion Constraint `booking_no_overlap`
```sql
select conname from pg_constraint where conname = 'booking_no_overlap';
```
**Database Output:**
```json
[
  {
    "conname": "booking_no_overlap"
  }
]
```

### Query 2: Row Level Security on Public Schema Tables
```sql
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename;
```
**Database Output:**
```json
[
  {
    "tablename": "Address",
    "rowsecurity": true
  },
  {
    "tablename": "Availability",
    "rowsecurity": true
  },
  {
    "tablename": "Barber",
    "rowsecurity": true
  },
  {
    "tablename": "BarberService",
    "rowsecurity": true
  },
  {
    "tablename": "Booking",
    "rowsecurity": true
  },
  {
    "tablename": "BookingItem",
    "rowsecurity": true
  },
  {
    "tablename": "DailyTokenCounter",
    "rowsecurity": true
  },
  {
    "tablename": "OtpCode",
    "rowsecurity": true
  },
  {
    "tablename": "Review",
    "rowsecurity": true
  },
  {
    "tablename": "Salon",
    "rowsecurity": true
  },
  {
    "tablename": "SalonHours",
    "rowsecurity": true
  },
  {
    "tablename": "Service",
    "rowsecurity": true
  },
  {
    "tablename": "TimeOff",
    "rowsecurity": true
  },
  {
    "tablename": "User",
    "rowsecurity": true
  },
  {
    "tablename": "_prisma_migrations",
    "rowsecurity": true
  }
]
```
