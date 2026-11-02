import { describe, it, expect } from 'vitest';
import { BookingStatus } from '@prisma/client';
import { generateSlots } from '../lib/slots';
import { istToUtcDate } from '../lib/time';

describe('Phase 3: Slot Generation (generateSlots)', () => {
  // Fix "now" to 2026-11-05 10:00 AM IST (04:30:00.000Z UTC)
  // 2026-11-05 is a Thursday (weekday = 4)
  const fixedNow = new Date('2026-11-05T04:30:00.000Z');
  const targetDate = '2026-11-05';

  const defaultSalonHours = [
    { weekday: 4, openMin: 540, closeMin: 1260, isClosed: false }, // 09:00 to 21:00
  ];

  const defaultAvailability = [
    { weekday: 4, startMin: 540, endMin: 1260 }, // 09:00 to 21:00
  ];

  it('generates 15-minute grid slots for full day with lead time marking past slots', () => {
    // at 10:00 AM IST (fixedNow), min lead time is 15 min -> 10:15 AM
    // Slots before 10:15 AM should be reason: 'past'
    const slots = generateSlots({
      dateIst: targetDate,
      durationMin: 30,
      salonHours: defaultSalonHours,
      availability: defaultAvailability,
      timeOff: [],
      bookings: [],
      now: fixedNow,
    });

    expect(slots.length).toBeGreaterThan(0);
    // 09:00 AM slot
    const slot900 = slots.find((s) => s.timeStr === '9:00 AM');
    expect(slot900).toBeDefined();
    expect(slot900?.available).toBe(false);
    expect(slot900?.reason).toBe('past');

    // 10:00 AM slot is < 10:15 AM -> past
    const slot1000 = slots.find((s) => s.timeStr === '10:00 AM');
    expect(slot1000?.available).toBe(false);
    expect(slot1000?.reason).toBe('past');

    // 10:15 AM slot is >= 10:15 AM -> available
    const slot1015 = slots.find((s) => s.timeStr === '10:15 AM');
    expect(slot1015?.available).toBe(true);
    expect(slot1015?.reason).toBeUndefined();

    // 10:30 AM slot -> available
    const slot1030 = slots.find((s) => s.timeStr === '10:30 AM');
    expect(slot1030?.available).toBe(true);
  });

  it('handles split shifts correctly with no slots in between shifts', () => {
    // Morning shift: 09:00 - 13:00 (540..780)
    // Evening shift: 16:00 - 21:00 (960..1260)
    const splitAvailability = [
      { weekday: 4, startMin: 540, endMin: 780 },
      { weekday: 4, startMin: 960, endMin: 1260 },
    ];

    const slots = generateSlots({
      dateIst: targetDate,
      durationMin: 30,
      salonHours: defaultSalonHours,
      availability: splitAvailability,
      timeOff: [],
      bookings: [],
      now: fixedNow,
    });

    // Check afternoon slot during break: 14:00 (2:00 PM) should not exist in candidate list
    const slot2pm = slots.find((s) => s.timeStr === '2:00 PM');
    expect(slot2pm).toBeUndefined();

    // Morning slot should exist
    const slot11am = slots.find((s) => s.timeStr === '11:00 AM');
    expect(slot11am).toBeDefined();

    // Evening slot should exist
    const slot5pm = slots.find((s) => s.timeStr === '5:00 PM');
    expect(slot5pm).toBeDefined();
    expect(slot5pm?.available).toBe(true);
  });

  it('clips barber availability to salon operating hours', () => {
    // Barber says 08:00 - 22:00 (480..1320)
    // Salon says 10:00 - 18:00 (600..1080)
    const limitedSalonHours = [
      { weekday: 4, openMin: 600, closeMin: 1080, isClosed: false },
    ];
    const wideAvailability = [
      { weekday: 4, startMin: 480, endMin: 1320 },
    ];

    const slots = generateSlots({
      dateIst: targetDate,
      durationMin: 30,
      salonHours: limitedSalonHours,
      availability: wideAvailability,
      timeOff: [],
      bookings: [],
      now: fixedNow,
    });

    // 09:45 AM should not exist
    expect(slots.find((s) => s.timeStr === '9:45 AM')).toBeUndefined();
    // 10:00 AM should exist
    expect(slots.find((s) => s.timeStr === '10:00 AM')).toBeDefined();
    // 17:30 PM (ends at 18:00) should exist
    expect(slots.find((s) => s.timeStr === '5:30 PM')).toBeDefined();
    // 18:00 PM should not exist (since salon closes at 18:00)
    expect(slots.find((s) => s.timeStr === '6:00 PM')).toBeUndefined();
  });

  it('marks slots as too_short when duration exceeds window closing boundary', () => {
    // Window ends at 13:00 (780 min).
    // Service duration = 45 min.
    // 12:15 -> ends 13:00 (fits)
    // 12:30 -> ends 13:15 (exceeds window by 15 min) -> too_short
    // 12:45 -> ends 13:30 (exceeds window) -> too_short
    const morningShift = [
      { weekday: 4, startMin: 540, endMin: 780 },
    ];

    const slots = generateSlots({
      dateIst: targetDate,
      durationMin: 45,
      salonHours: defaultSalonHours,
      availability: morningShift,
      timeOff: [],
      bookings: [],
      now: fixedNow,
    });

    const slot1215 = slots.find((s) => s.timeStr === '12:15 PM');
    expect(slot1215?.available).toBe(true);

    const slot1230 = slots.find((s) => s.timeStr === '12:30 PM');
    expect(slot1230?.available).toBe(false);
    expect(slot1230?.reason).toBe('too_short');

    const slot1245 = slots.find((s) => s.timeStr === '12:45 PM');
    expect(slot1245?.available).toBe(false);
    expect(slot1245?.reason).toBe('too_short');
  });

  it('blocks slots overlapping with TimeOff', () => {
    // Time off from 14:00 to 15:30 IST
    // 14:00 IST = 840 min, 15:30 IST = 930 min
    const timeOff = [
      {
        startsAt: istToUtcDate(targetDate, 840),
        endsAt: istToUtcDate(targetDate, 930),
      },
    ];

    const slots = generateSlots({
      dateIst: targetDate,
      durationMin: 30,
      salonHours: defaultSalonHours,
      availability: defaultAvailability,
      timeOff,
      bookings: [],
      now: fixedNow,
    });

    // 1:30 PM (810 min) -> ends 2:00 PM (840 min) -> no overlap -> available
    const slot130 = slots.find((s) => s.timeStr === '1:30 PM');
    expect(slot130?.available).toBe(true);

    // 2:00 PM (840 min) -> overlaps timeOff -> reason: 'time_off'
    const slot200 = slots.find((s) => s.timeStr === '2:00 PM');
    expect(slot200?.available).toBe(false);
    expect(slot200?.reason).toBe('time_off');

    // 3:00 PM (900 min) -> overlaps timeOff -> reason: 'time_off'
    const slot300 = slots.find((s) => s.timeStr === '3:00 PM');
    expect(slot300?.available).toBe(false);
    expect(slot300?.reason).toBe('time_off');

    // 3:30 PM (930 min) -> starts exactly at timeOff endsAt -> available
    const slot330 = slots.find((s) => s.timeStr === '3:30 PM');
    expect(slot330?.available).toBe(true);
  });

  it('blocks slots overlapping active bookings, but ignores cancelled bookings', () => {
    // Active booking: 11:00 to 12:00 (CONFIRMED)
    // Cancelled booking: 12:00 to 12:30 (CANCELLED)
    const bookings = [
      {
        startsAt: istToUtcDate(targetDate, 660), // 11:00 AM
        endsAt: istToUtcDate(targetDate, 720),   // 12:00 PM
        status: BookingStatus.CONFIRMED,
      },
      {
        startsAt: istToUtcDate(targetDate, 720), // 12:00 PM
        endsAt: istToUtcDate(targetDate, 750),   // 12:30 PM
        status: BookingStatus.CANCELLED,
      },
    ];

    const slots = generateSlots({
      dateIst: targetDate,
      durationMin: 30,
      salonHours: defaultSalonHours,
      availability: defaultAvailability,
      timeOff: [],
      bookings,
      now: fixedNow,
    });

    // 10:45 AM (starts 10:45, ends 11:15) overlaps active booking starting at 11:00
    const slot1045 = slots.find((s) => s.timeStr === '10:45 AM');
    expect(slot1045?.available).toBe(false);
    expect(slot1045?.reason).toBe('booked');

    // 11:00 AM overlaps active booking
    const slot1100 = slots.find((s) => s.timeStr === '11:00 AM');
    expect(slot1100?.available).toBe(false);
    expect(slot1100?.reason).toBe('booked');

    // 11:30 AM overlaps active booking
    const slot1130 = slots.find((s) => s.timeStr === '11:30 AM');
    expect(slot1130?.available).toBe(false);
    expect(slot1130?.reason).toBe('booked');

    // 12:00 PM overlaps only CANCELLED booking -> should be available!
    const slot1200 = slots.find((s) => s.timeStr === '12:00 PM');
    expect(slot1200?.available).toBe(true);
    expect(slot1200?.reason).toBeUndefined();
  });

  it('returns empty array when salon is closed or date is out of range', () => {
    // Closed day
    const closedSalon = [
      { weekday: 4, openMin: 540, closeMin: 1260, isClosed: true },
    ];
    const slotsClosed = generateSlots({
      dateIst: targetDate,
      durationMin: 30,
      salonHours: closedSalon,
      availability: defaultAvailability,
      timeOff: [],
      bookings: [],
      now: fixedNow,
    });
    expect(slotsClosed).toEqual([]);

    // Past date (yesterday relative to fixedNow 2026-11-05)
    const slotsPast = generateSlots({
      dateIst: '2026-11-04',
      durationMin: 30,
      salonHours: defaultSalonHours,
      availability: defaultAvailability,
      timeOff: [],
      bookings: [],
      now: fixedNow,
    });
    expect(slotsPast).toEqual([]);

    // Out-of-bounds date (> 14 days, e.g. 2026-11-20)
    const slotsTooFar = generateSlots({
      dateIst: '2026-11-20',
      durationMin: 30,
      salonHours: defaultSalonHours,
      availability: defaultAvailability,
      timeOff: [],
      bookings: [],
      now: fixedNow,
    });
    expect(slotsTooFar).toEqual([]);
  });

  it('handles multi-hour duration (e.g. 75 min and 135 min)', () => {
    // 75 min duration
    const slots75 = generateSlots({
      dateIst: targetDate,
      durationMin: 75,
      salonHours: defaultSalonHours,
      availability: defaultAvailability,
      timeOff: [],
      bookings: [],
      now: fixedNow,
    });

    const slot75_1030 = slots75.find((s) => s.timeStr === '10:30 AM');
    expect(slot75_1030?.available).toBe(true);
    // endsAt should be 10:30 + 75 min = 11:45 AM IST (06:15:00 UTC)
    expect(slot75_1030?.endsAt.toISOString()).toBe('2026-11-05T06:15:00.000Z');

    // 135 min duration
    const slots135 = generateSlots({
      dateIst: targetDate,
      durationMin: 135,
      salonHours: defaultSalonHours,
      availability: defaultAvailability,
      timeOff: [],
      bookings: [],
      now: fixedNow,
    });
    const slot135_1030 = slots135.find((s) => s.timeStr === '10:30 AM');
    expect(slot135_1030?.available).toBe(true);
    // 10:30 + 135 min = 12:45 PM IST (07:15:00 UTC)
    expect(slot135_1030?.endsAt.toISOString()).toBe('2026-11-05T07:15:00.000Z');
  });

  it('boundary back-to-back: slot starting at 10:45 is available when preceding booking ends at 10:45', () => {
    // Preceding booking: 10:15 AM to 10:45 AM (615 min to 645 min)
    const bookings = [
      {
        startsAt: istToUtcDate(targetDate, 615),
        endsAt: istToUtcDate(targetDate, 645),
        status: BookingStatus.CONFIRMED,
      },
    ];

    const slots = generateSlots({
      dateIst: targetDate,
      durationMin: 30,
      salonHours: defaultSalonHours,
      availability: defaultAvailability,
      timeOff: [],
      bookings,
      now: fixedNow, // 10:00 AM IST
    });

    const slot1045 = slots.find((s) => s.timeStr === '10:45 AM');
    expect(slot1045).toBeDefined();
    expect(slot1045?.available).toBe(true);
    expect(slot1045?.reason).toBeUndefined();
  });

  it('exact closing boundary: 30-min slot ending exactly at closing is allowed; ending at close + 1 min is flagged too_short', () => {
    // Salon closing at 21:00 (1260 min)
    const slots = generateSlots({
      dateIst: targetDate,
      durationMin: 30,
      salonHours: defaultSalonHours,
      availability: defaultAvailability,
      timeOff: [],
      bookings: [],
      now: fixedNow,
    });

    // 8:30 PM (1230 min) -> ends at 9:00 PM (1260 min) -> exact closing boundary -> available
    const slot830pm = slots.find((s) => s.timeStr === '8:30 PM');
    expect(slot830pm).toBeDefined();
    expect(slot830pm?.available).toBe(true);
    expect(slot830pm?.reason).toBeUndefined();

    // 8:45 PM (1245 min) -> ends at 9:15 PM (1275 min > 1260) -> too_short
    const slot845pm = slots.find((s) => s.timeStr === '8:45 PM');
    expect(slot845pm).toBeDefined();
    expect(slot845pm?.available).toBe(false);
    expect(slot845pm?.reason).toBe('too_short');

    // 31 min duration from 20:30 ends at 21:01 (closeMin 1260 + 1 min)
    const slots31 = generateSlots({
      dateIst: targetDate,
      durationMin: 31,
      salonHours: defaultSalonHours,
      availability: defaultAvailability,
      timeOff: [],
      bookings: [],
      now: fixedNow,
    });
    const slot830pm31 = slots31.find((s) => s.timeStr === '8:30 PM');
    expect(slot830pm31).toBeDefined();
    expect(slot830pm31?.available).toBe(false);
    expect(slot830pm31?.reason).toBe('too_short');
  });

  it('varying durations: generates valid slots for 15-minute and 45-minute service durations across regular windows', () => {
    // 15-min duration
    const slots15 = generateSlots({
      dateIst: targetDate,
      durationMin: 15,
      salonHours: defaultSalonHours,
      availability: defaultAvailability,
      timeOff: [],
      bookings: [],
      now: fixedNow,
    });
    const slot15_1015 = slots15.find((s) => s.timeStr === '10:15 AM');
    expect(slot15_1015?.available).toBe(true);
    expect(slot15_1015?.endsAt.getTime() - slot15_1015!.startsAt.getTime()).toBe(15 * 60 * 1000);

    // 45-min duration
    const slots45 = generateSlots({
      dateIst: targetDate,
      durationMin: 45,
      salonHours: defaultSalonHours,
      availability: defaultAvailability,
      timeOff: [],
      bookings: [],
      now: fixedNow,
    });
    const slot45_1015 = slots45.find((s) => s.timeStr === '10:15 AM');
    expect(slot45_1015?.available).toBe(true);
    expect(slot45_1015?.endsAt.getTime() - slot45_1015!.startsAt.getTime()).toBe(45 * 60 * 1000);
  });

  it('day window boundaries: Day 14 returns valid slots; Day 15 returns an empty array []', () => {
    // fixedNow is 2026-11-05 (Thursday)
    // Day 0: 2026-11-05
    // Day 14: 2026-11-19 (Thursday, weekday = 4)
    // Day 15: 2026-11-20 (Friday)
    const day14Date = '2026-11-19';
    const day15Date = '2026-11-20';

    const slotsDay14 = generateSlots({
      dateIst: day14Date,
      durationMin: 30,
      salonHours: defaultSalonHours,
      availability: defaultAvailability,
      timeOff: [],
      bookings: [],
      now: fixedNow,
    });
    expect(slotsDay14.length).toBeGreaterThan(0);
    expect(slotsDay14.some((s) => s.available)).toBe(true);

    const slotsDay15 = generateSlots({
      dateIst: day15Date,
      durationMin: 30,
      salonHours: [
        { weekday: 5, openMin: 540, closeMin: 1260, isClosed: false },
      ],
      availability: [
        { weekday: 5, startMin: 540, endMin: 1260 },
      ],
      timeOff: [],
      bookings: [],
      now: fixedNow,
    });
    expect(slotsDay15).toEqual([]);
  });
});
