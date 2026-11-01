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