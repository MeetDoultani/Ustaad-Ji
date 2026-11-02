import { PrismaClient, Role, VerificationStatus, ServiceCategory, BookingType, BookingSource, BookingStatus } from '@prisma/client';
import { utcToIstDetails, getNextIstDates, toTokenDateUtc, istToUtcDate } from '../src/lib/time';

// Production safety guard: Never seed a production database!
if (process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production') {
  throw new Error('FATAL: Database seed cannot be executed in production environment!');
}

const prisma = new PrismaClient();

// SVG placeholder avatar data URIs for barbers
const avatar1 = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="%230F5E57"/><circle cx="60" cy="45" r="24" fill="%23F6EBD0"/><path d="M30 100 C30 75 45 68 60 68 C75 68 90 75 90 100 Z" fill="%23F2A900"/><circle cx="60" cy="50" r="4" fill="%232B2118"/><path d="M50 48 Q60 55 70 48" stroke="%232B2118" stroke-width="3" fill="none"/></svg>';
const avatar2 = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="%237A1F2B"/><circle cx="60" cy="45" r="24" fill="%23F6EBD0"/><path d="M30 100 C30 75 45 68 60 68 C75 68 90 75 90 100 Z" fill="%238FD0BC"/><rect x="48" y="44" width="24" height="14" rx="7" fill="%232B2118"/></svg>';
const avatar3 = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="%23E8731A"/><circle cx="60" cy="45" r="24" fill="%23F6EBD0"/><path d="M30 100 C30 75 45 68 60 68 C75 68 90 75 90 100 Z" fill="%23F6EBD0"/><circle cx="60" cy="40" r="18" fill="%232B2118"/><circle cx="60" cy="45" r="16" fill="%23F6EBD0"/></svg>';
const avatar4 = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="%231E4F9C"/><circle cx="60" cy="45" r="24" fill="%23F6EBD0"/><path d="M30 100 C30 75 45 68 60 68 C75 68 90 75 90 100 Z" fill="%23C8262F"/></svg>';

async function main() {
  console.log('--- Cleaning existing salon data (reverse FK order) ---');
  await prisma.review.deleteMany();
  await prisma.bookingItem.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.dailyTokenCounter.deleteMany();
  await prisma.barberService.deleteMany();
  await prisma.availability.deleteMany();
  await prisma.timeOff.deleteMany();
  await prisma.service.deleteMany();
  await prisma.salonHours.deleteMany();
  await prisma.barber.deleteMany();
  await prisma.salon.deleteMany();
  await prisma.address.deleteMany();
  await prisma.otpCode.deleteMany();
  await prisma.user.deleteMany();

  console.log('--- Seeding Users ---');
  // 1 Admin
  await prisma.user.create({
    data: {
      phone: '+919000000001',
      name: 'Admin Sahab',
      email: 'admin@indiansalon.local',
      role: Role.ADMIN,
      language: 'en',
    },
  });

  // 2 Salon Owners
  const owner1 = await prisma.user.create({
    data: {
      phone: '+919000000002',
      name: 'Pandit Ramvilas Sharma',
      email: 'sharmaji@indiansalon.local',
      role: Role.OWNER,
      language: 'hi',
    },
  });

  const owner2 = await prisma.user.create({
    data: {
      phone: '+919000000003',
      name: 'Javed Ustaad',
      email: 'javed@indiansalon.local',
      role: Role.OWNER,
      language: 'en',
    },
  });

  // 4 Barbers
  const barberUser1 = await prisma.user.create({
    data: {
      phone: '+919000000004',
      name: 'Rakesh Sharma',
      email: 'rakesh@indiansalon.local',
      role: Role.BARBER,
      language: 'hi',
    },
  });

  const barberUser2 = await prisma.user.create({
    data: {
      phone: '+919000000005',
      name: 'Mohammad Irfan',
      email: 'irfan@indiansalon.local',
      role: Role.BARBER,
      language: 'en',
    },
  });

  const barberUser3 = await prisma.user.create({
    data: {
      phone: '+919000000006',
      name: 'Suresh Kumar',
      email: 'suresh@indiansalon.local',
      role: Role.BARBER,
      language: 'hi',
    },
  });

  const barberUser4 = await prisma.user.create({
    data: {
      phone: '+919000000007',
      name: 'Farhan Akhtar',
      email: 'farhan@indiansalon.local',
      role: Role.BARBER,
      language: 'en',
    },
  });

  // 3 Customers
  const customer1 = await prisma.user.create({
    data: {
      phone: '+919876543210',
      name: 'Amit Verma',
      email: 'amit.verma@example.com',
      role: Role.CUSTOMER,
      language: 'hi',
    },
  });

  const customer2 = await prisma.user.create({
    data: {
      phone: '+919876543211',
      name: 'Vikram Malhotra',
      email: 'vikram.m@example.com',
      role: Role.CUSTOMER,
      language: 'en',
    },
  });

  const customer3 = await prisma.user.create({
    data: {
      phone: '+919876543212',
      name: 'Rahul Deshmukh',
      email: 'rahul.d@example.com',
      role: Role.CUSTOMER,
      language: 'en',
    },
  });

  console.log('--- Seeding Salons ---');
  // Salon 1: Verified
  const salon1 = await prisma.salon.create({
    data: {
      ownerId: owner1.id,
      slug: 'sharma-ji-gents-parlour',
      name: 'Sharma Ji Gents Parlour & Hair Art',
      nameHi: 'शर्मा जी जेंट्स पार्लर',
      description: 'Serving traditional hair styling, hot towel shave, and authentic Navratna champi since 1994. Indiranagar 100ft Road.',
      phone: '+919845012345',
      addressLine: 'Shop No. 4, Ground Floor, Sai Plaza, 12th Main',
      area: 'Indiranagar',
      city: 'Bengaluru',
      pincode: '560038',
      lat: 12.971891,
      lng: 77.641154,
      status: VerificationStatus.VERIFIED,
      offersHomeVisit: true,
      homeVisitRadiusKm: 5,
      homeVisitFeeRupees: 100,
      requiresApproval: false,
    },
  });

  // Salon 2: Pending
  const salon2 = await prisma.salon.create({
    data: {
      ownerId: owner2.id,
      slug: 'royal-ustaad-mens-salon',
      name: 'Royal Ustaad Mens Salon',
      nameHi: 'रॉयल उस्ताद सैलून',
      description: 'Modern fades, beard grooming and bridal grooming with classic salon vibe.',
      phone: '+919845054321',
      addressLine: 'No. 22, 5th Cross, 4th Block',
      area: 'Koramangala',
      city: 'Bengaluru',
      pincode: '560034',
      lat: 12.935193,
      lng: 77.624481,
      status: VerificationStatus.PENDING,
      offersHomeVisit: false,
      requiresApproval: true,
    },
  });

  console.log('--- Seeding Salon Hours ---');
  // Salon 1: Mon-Sun 9 AM - 9 PM (Tuesday closed)
  // weekday: 0 = Sun, 1 = Mon, ..., 6 = Sat
  for (let d = 0; d < 7; d++) {
    const isTuesday = d === 2;
    await prisma.salonHours.create({
      data: {
        salonId: salon1.id,
        weekday: d,
        openMin: 540, // 9:00 AM (540 mins)
        closeMin: 1260, // 9:00 PM (1260 mins)
        isClosed: isTuesday,
      },
    });

    await prisma.salonHours.create({
      data: {
        salonId: salon2.id,
        weekday: d,
        openMin: 600, // 10:00 AM
        closeMin: 1260, // 9:00 PM
        isClosed: d === 1, // Monday closed
      },
    });
  }

  console.log('--- Seeding Barbers ---');
  // 3 Barbers for Salon 1
  const barber1 = await prisma.barber.create({
    data: {
      userId: barberUser1.id,
      salonId: salon1.id,
      displayName: 'Ustaad Rakesh Sharma',
      bio: 'Master scissor craftsman with 18 years experience. Famous for classic gents cut & herbal champi.',
      photoUrl: avatar1,
      experienceYears: 18,
      status: VerificationStatus.VERIFIED,
      doesHomeVisits: true,
      isActive: true,
    },
  });

  const barber2 = await prisma.barber.create({
    data: {
      userId: barberUser2.id,
      salonId: salon1.id,
      displayName: 'Irfan Bhai',
      bio: 'Sharp beard lines, straight razor specialist, and modern fades with 12 years of craft.',
      photoUrl: avatar2,
      experienceYears: 12,
      status: VerificationStatus.VERIFIED,
      doesHomeVisits: true,
      isActive: true,
    },
  });

  const barber3 = await prisma.barber.create({
    data: {
      userId: barberUser3.id,
      salonId: salon1.id,
      displayName: 'Suresh Kumar',
      bio: 'Facial and skin care expert, de-tan specialist, and hair coloring master.',
      photoUrl: avatar3,
      experienceYears: 7,
      status: VerificationStatus.VERIFIED,
      doesHomeVisits: false,
      isActive: true,
    },
  });

  // 1 Barber for Salon 2 (PENDING)
  const barber4 = await prisma.barber.create({
    data: {
      userId: barberUser4.id,
      salonId: salon2.id,
      displayName: 'Farhan Akhtar',
      bio: 'Trendy cuts, kids styling, and clean razor shaves.',
      photoUrl: avatar4,
      experienceYears: 5,
      status: VerificationStatus.PENDING,
      doesHomeVisits: false,
      isActive: true,
    },
  });

  console.log('--- Seeding Barber Availability ---');
  // Weekly shifts: 9:00 AM to 8:30 PM (startMin 540 to endMin 1230)
  for (const b of [barber1, barber2, barber3]) {
    for (let d = 0; d < 7; d++) {
      if (d === 2) continue; // Tuesday off for Salon 1
      await prisma.availability.create({
        data: {
          barberId: b.id,
          weekday: d,
          startMin: 540,
          endMin: 1230,
        },
      });
    }
  }

  for (let d = 0; d < 7; d++) {
    if (d === 1) continue; // Monday off for Salon 2
    await prisma.availability.create({
      data: {
        barberId: barber4.id,
        weekday: d,
        startMin: 600,
        endMin: 1200,
      },
    });
  }

  console.log('--- Seeding Services ---');
  const serviceDefs = [
    // HAIR
    { category: ServiceCategory.HAIR, name: 'Standard Haircut', nameHi: 'साधारण कटिंग', durationMin: 30, priceRupees: 100, sortOrder: 1, homeVisitOk: true },
    { category: ServiceCategory.HAIR, name: 'Stylish Fade & Texture Cut', nameHi: 'स्टाइलिश फेड कट', durationMin: 35, priceRupees: 150, sortOrder: 2, homeVisitOk: true },
    { category: ServiceCategory.HAIR, name: 'Hair Wash & Conditioning', nameHi: 'हेयर वॉश और कंडीशनिंग', durationMin: 15, priceRupees: 70, sortOrder: 3, homeVisitOk: false },
    // BEARD
    { category: ServiceCategory.BEARD, name: 'Beard Trim & Precision Shape', nameHi: 'दाढ़ी सेटिंग', durationMin: 15, priceRupees: 50, sortOrder: 4, homeVisitOk: true },
    { category: ServiceCategory.BEARD, name: 'Royal Beard Styling with Hot Towel', nameHi: 'शाही दाढ़ी ग्रूमिंग', durationMin: 25, priceRupees: 120, sortOrder: 5, homeVisitOk: true },
    // SHAVE
    { category: ServiceCategory.SHAVE, name: 'Classic Razor Shave', nameHi: 'क्लासिक उस्तरा शेव', durationMin: 20, priceRupees: 60, sortOrder: 6, homeVisitOk: true },
    { category: ServiceCategory.SHAVE, name: 'Royal Ustaad Shave with Alum & Balm', nameHi: 'शाही उस्तरा शेव', durationMin: 25, priceRupees: 90, sortOrder: 7, homeVisitOk: false },
    // MASSAGE
    { category: ServiceCategory.MASSAGE, name: 'Champi / Navratna Head Massage', nameHi: 'नवरत्न तेल मालिश', durationMin: 20, priceRupees: 150, sortOrder: 8, homeVisitOk: true },
    { category: ServiceCategory.MASSAGE, name: 'Almond Oil Deep Relaxation Champi', nameHi: 'बादाम तेल रिलैक्स मालिश', durationMin: 30, priceRupees: 220, sortOrder: 9, homeVisitOk: true },
    { category: ServiceCategory.MASSAGE, name: 'Neck, Back & Shoulder Massage', nameHi: 'गर्दन और कंधा मालिश', durationMin: 15, priceRupees: 100, sortOrder: 10, homeVisitOk: false },
    // FACIAL
    { category: ServiceCategory.FACIAL, name: 'Detan Face Pack & Clean Up', nameHi: 'डी-टैन फेस पैक', durationMin: 30, priceRupees: 250, sortOrder: 11, homeVisitOk: true },
    { category: ServiceCategory.FACIAL, name: 'Herbal Fruit Glow Facial', nameHi: 'हर्बल फ्रूट फेशियल', durationMin: 45, priceRupees: 350, sortOrder: 12, homeVisitOk: false },
    { category: ServiceCategory.FACIAL, name: 'Charcoal Blackhead Nose Scrub', nameHi: 'चारकोल ब्लैकहेड स्क्रब', durationMin: 15, priceRupees: 120, sortOrder: 13, homeVisitOk: false },
    // KIDS
    { category: ServiceCategory.KIDS, name: 'Kids Haircut (Under 12)', nameHi: 'बच्चों की कटिंग', durationMin: 25, priceRupees: 80, sortOrder: 14, homeVisitOk: true },
  ];

  const createdServicesSalon1 = [];
  for (const s of serviceDefs) {
    const serv = await prisma.service.create({
      data: {
        salonId: salon1.id,
        ...s,
      },
    });
    createdServicesSalon1.push(serv);
  }

  // Also seed top services for Salon 2
  for (const s of serviceDefs.slice(0, 8)) {
    const serv = await prisma.service.create({
      data: {
        salonId: salon2.id,
        ...s,
      },
    });
    // Link to Barber 4
    await prisma.barberService.create({
      data: {
        barberId: barber4.id,
        serviceId: serv.id,
      },
    });
  }

  console.log('--- Linking Barbers to Services ---');
  const rakeshCats: ServiceCategory[] = [ServiceCategory.HAIR, ServiceCategory.MASSAGE, ServiceCategory.SHAVE, ServiceCategory.KIDS];
  const irfanCats: ServiceCategory[] = [ServiceCategory.HAIR, ServiceCategory.BEARD, ServiceCategory.SHAVE];
  const sureshCats: ServiceCategory[] = [ServiceCategory.HAIR, ServiceCategory.FACIAL, ServiceCategory.MASSAGE];

  for (const s of createdServicesSalon1) {
    if (rakeshCats.includes(s.category)) {
      await prisma.barberService.create({
        data: { barberId: barber1.id, serviceId: s.id },
      });
    }
    if (irfanCats.includes(s.category)) {
      await prisma.barberService.create({
        data: { barberId: barber2.id, serviceId: s.id },
      });
    }
    if (sureshCats.includes(s.category)) {
      await prisma.barberService.create({
        data: { barberId: barber3.id, serviceId: s.id },
      });
    }
  }

  console.log('--- Seeding Token Counters and Sample Bookings with Dynamic IST Dates ---');
  const now = new Date();
  const { dateIst: todayIst } = utcToIstDetails(now);
  const tomorrowIst = getNextIstDates(2, now)[1];
  const yesterdayTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const { dateIst: yesterdayIst } = utcToIstDetails(yesterdayTime);

  const todayTokenDate = toTokenDateUtc(todayIst);
  const yesterdayTokenDate = toTokenDateUtc(yesterdayIst);
  const tomorrowTokenDate = toTokenDateUtc(tomorrowIst);

  // Token counters
  await prisma.dailyTokenCounter.create({
    data: { salonId: salon1.id, date: yesterdayTokenDate, last: 1 },
  });
  await prisma.dailyTokenCounter.create({
    data: { salonId: salon1.id, date: todayTokenDate, last: 4 },
  });
  await prisma.dailyTokenCounter.create({
    data: { salonId: salon1.id, date: tomorrowTokenDate, last: 2 },
  });

  // Sample Booking 1: Yesterday, Completed (Haircut + Champi)
  // 11:00 AM IST = 660 min
  const b1Starts = istToUtcDate(yesterdayIst, 660);
  const b1Ends = istToUtcDate(yesterdayIst, 710); // 50 min

  const haircutServ = createdServicesSalon1.find(s => s.name === 'Standard Haircut')!;
  const champiServ = createdServicesSalon1.find(s => s.name === 'Champi / Navratna Head Massage')!;

  const booking1 = await prisma.booking.create({
    data: {
      salonId: salon1.id,
      barberId: barber1.id,
      customerId: customer1.id,
      token: 1,
      tokenDate: yesterdayTokenDate,
      type: BookingType.IN_SALON,
      source: BookingSource.ONLINE,
      status: BookingStatus.COMPLETED,
      startsAt: b1Starts,
      endsAt: b1Ends,
      totalRupees: 250,
      checkedInAt: b1Starts,
      startedAt: b1Starts,
      completedAt: b1Ends,
      items: {
        create: [
          { serviceId: haircutServ.id, priceRupees: 100, durationMin: 30 },
          { serviceId: champiServ.id, priceRupees: 150, durationMin: 20 },
        ],
      },
    },
  });

  // Review for Booking 1
  await prisma.review.create({
    data: {
      bookingId: booking1.id,
      customerId: customer1.id,
      salonId: salon1.id,
      barberId: barber1.id,
      rating: 5,
      comment: 'Rakesh bhai ki champi ekdum lajawaab hai! Bahut sukoon mila.',
    },
  });

  // Sample Booking 2: Today morning, COMPLETED (Beard Trim + Shave)
  // 9:30 AM IST = 570 min
  const b2Starts = istToUtcDate(todayIst, 570);
  const b2Ends = istToUtcDate(todayIst, 610); // 40 min

  const beardServ = createdServicesSalon1.find(s => s.name === 'Beard Trim & Precision Shape')!;
  const shaveServ = createdServicesSalon1.find(s => s.name === 'Classic Razor Shave')!;

  const booking2 = await prisma.booking.create({
    data: {
      salonId: salon1.id,
      barberId: barber2.id,
      customerId: customer2.id,
      token: 1,
      tokenDate: todayTokenDate,
      type: BookingType.IN_SALON,
      source: BookingSource.ONLINE,
      status: BookingStatus.COMPLETED,
      startsAt: b2Starts,
      endsAt: b2Ends,
      totalRupees: 110,
      checkedInAt: b2Starts,
      startedAt: b2Starts,
      completedAt: b2Ends,
      items: {
        create: [
          { serviceId: beardServ.id, priceRupees: 50, durationMin: 15 },
          { serviceId: shaveServ.id, priceRupees: 60, durationMin: 20 },
        ],
      },
    },
  });

  await prisma.review.create({
    data: {
      bookingId: booking2.id,
      customerId: customer2.id,
      salonId: salon1.id,
      barberId: barber2.id,
      rating: 5,
      comment: 'Clean shave aur perfect beard line. Irfan bhai bahut tareeqe se kaam karte hain.',
    },
  });

  // Sample Booking 3: Today afternoon, CONFIRMED (Barber 1, Customer 3)
  // 1:30 PM IST = 810 min
  const b3Starts = istToUtcDate(todayIst, 810);
  const b3Ends = istToUtcDate(todayIst, 840);

  await prisma.booking.create({
    data: {
      salonId: salon1.id,
      barberId: barber1.id,
      customerId: customer3.id,
      token: 2,
      tokenDate: todayTokenDate,
      type: BookingType.IN_SALON,
      source: BookingSource.ONLINE,
      status: BookingStatus.CONFIRMED,
      startsAt: b3Starts,
      endsAt: b3Ends,
      totalRupees: 100,
      items: {
        create: [{ serviceId: haircutServ.id, priceRupees: 100, durationMin: 30 }],
      },
    },
  });

  // Sample Booking 4: Tomorrow, CONFIRMED (Barber 2, Customer 1)
  // 11:30 AM IST = 690 min
  const b4Starts = istToUtcDate(tomorrowIst, 690);
  const b4Ends = istToUtcDate(tomorrowIst, 715);
  const royalBeardServ = createdServicesSalon1.find(s => s.name === 'Royal Beard Styling with Hot Towel')!;

  await prisma.booking.create({
    data: {
      salonId: salon1.id,
      barberId: barber2.id,
      customerId: customer1.id,
      token: 1,
      tokenDate: tomorrowTokenDate,
      type: BookingType.IN_SALON,
      source: BookingSource.ONLINE,
      status: BookingStatus.CONFIRMED,
      startsAt: b4Starts,
      endsAt: b4Ends,
      totalRupees: 120,
      items: {
        create: [{ serviceId: royalBeardServ.id, priceRupees: 120, durationMin: 25 }],
      },
    },
  });

  // Sample Booking 5: Tomorrow, CANCELLED (Barber 3, Customer 2)
  // 3:00 PM IST = 900 min
  const b5Starts = istToUtcDate(tomorrowIst, 900);
  const b5Ends = istToUtcDate(tomorrowIst, 930);
  const detanServ = createdServicesSalon1.find(s => s.name === 'Detan Face Pack & Clean Up')!;

  await prisma.booking.create({
    data: {
      salonId: salon1.id,
      barberId: barber3.id,
      customerId: customer2.id,
      token: 2,
      tokenDate: tomorrowTokenDate,
      type: BookingType.IN_SALON,
      source: BookingSource.ONLINE,
      status: BookingStatus.CANCELLED,
      startsAt: b5Starts,
      endsAt: b5Ends,
      totalRupees: 250,
      cancelledAt: now,
      cancelReason: 'Customer requested cancellation online',
      items: {
        create: [{ serviceId: detanServ.id, priceRupees: 250, durationMin: 30 }],
      },
    },
  });

  console.log('\n===============================================================');
  console.log('              INDIAN SALON BOOKING - TEST USERS                ');
  console.log('===============================================================');
  console.table([
    { Role: 'ADMIN', Name: 'Admin Sahab', Phone: '+919000000001', Salon: 'All / Platform', Status: 'Active' },
    { Role: 'OWNER', Name: 'Pandit Ramvilas Sharma', Phone: '+919000000002', Salon: 'Sharma Ji Gents Parlour', Status: 'VERIFIED' },
    { Role: 'OWNER', Name: 'Javed Ustaad', Phone: '+919000000003', Salon: 'Royal Ustaad Mens Salon', Status: 'PENDING' },
    { Role: 'BARBER', Name: 'Ustaad Rakesh Sharma', Phone: '+919000000004', Salon: 'Sharma Ji Gents Parlour', Status: 'VERIFIED' },
    { Role: 'BARBER', Name: 'Mohammad Irfan', Phone: '+919000000005', Salon: 'Sharma Ji Gents Parlour', Status: 'VERIFIED' },
    { Role: 'BARBER', Name: 'Suresh Kumar', Phone: '+919000000006', Salon: 'Sharma Ji Gents Parlour', Status: 'VERIFIED' },
    { Role: 'BARBER', Name: 'Farhan Akhtar', Phone: '+919000000007', Salon: 'Royal Ustaad Mens Salon', Status: 'PENDING' },
    { Role: 'CUSTOMER', Name: 'Amit Verma', Phone: '+919876543210', Salon: 'Regular Client', Status: 'Active' },
    { Role: 'CUSTOMER', Name: 'Vikram Malhotra', Phone: '+919876543211', Salon: 'Regular Client', Status: 'Active' },
    { Role: 'CUSTOMER', Name: 'Rahul Deshmukh', Phone: '+919876543212', Salon: 'Regular Client', Status: 'Active' },
  ]);
  console.log('===============================================================\n');
  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
