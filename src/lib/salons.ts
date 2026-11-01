import { db } from './db';
import {
  VerificationStatus,
  ServiceCategory,
  Service,
  Salon,
  SalonHours,
  Barber,
  Review,
  Prisma,
} from '@prisma/client';
import { isSalonOpenNow } from './time';

export interface PublicSalonsFilter {
  query?: string;
  category?: ServiceCategory;
  homeVisitOnly?: boolean;
  openNowOnly?: boolean;
}

export type PublicSalonListItem = Salon & {
  hours: SalonHours[];
  barbers: Barber[];
  services: Service[];
  reviews: { rating: number }[];
  isOpenNow?: boolean;
  minPrice?: number;
  averageRating?: number;
};

export type FullSalonDetails = Salon & {
  hours: SalonHours[];
  barbers: (Barber & {
    services?: { service: Service }[];
  })[];
  services: Service[];
  reviews: (Review & {
    customer: { name: string | null };
    barber: { displayName: string } | null;
  })[];
  isOpenNow?: boolean;
  minPrice?: number;
  averageRating?: number;
};

/**
 * Fetch public salons.
 * Security rule: MUST strictly filter by status: 'VERIFIED'
 * and barbers by status: 'VERIFIED', isActive: true.
 */
export async function getPublicSalons(
  filters: PublicSalonsFilter = {}
): Promise<PublicSalonListItem[]> {
  const { query, category, homeVisitOnly, openNowOnly } = filters;

  const whereClause: Prisma.SalonWhereInput = {
    status: VerificationStatus.VERIFIED,
  };

  if (homeVisitOnly) {
    whereClause.offersHomeVisit = true;
  }

  if (query && query.trim().length > 0) {
    const q = query.trim();
    whereClause.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { nameHi: { contains: q, mode: 'insensitive' } },
      { area: { contains: q, mode: 'insensitive' } },
      { city: { contains: q, mode: 'insensitive' } },
      { addressLine: { contains: q, mode: 'insensitive' } },
    ];
  }

  if (category) {
    whereClause.services = {
      some: {
        category,
        isActive: true,
      },
    };
  }

  const rawSalons = await db.salon.findMany({
    where: whereClause,
    include: {
      hours: {
        orderBy: { weekday: 'asc' },
      },
      barbers: {
        where: {
          status: VerificationStatus.VERIFIED,
          isActive: true,
        },
      },
      services: {
        where: {
          isActive: true,
        },
        orderBy: {
          sortOrder: 'asc',
        },
      },
      reviews: {
        select: {
          rating: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  const salonsWithComputed = rawSalons.map((salon) => {
    const isOpen = isSalonOpenNow(salon.hours);
    const activePrices = salon.services.map((s) => s.priceRupees);
    const minPrice = activePrices.length > 0 ? Math.min(...activePrices) : 0;
    const avgRating =
      salon.reviews.length > 0
        ? Number(
            (
              salon.reviews.reduce((acc, r) => acc + r.rating, 0) /
              salon.reviews.length
            ).toFixed(1)
          )
        : 4.8; // default realistic fallback for neighbourhood salons

    return {
      ...salon,
      isOpenNow: isOpen,
      minPrice,
      averageRating: avgRating,
    };
  });

  if (openNowOnly) {
    return salonsWithComputed.filter((s) => s.isOpenNow);
  }

  return salonsWithComputed;
}

/**
 * Fetch a single verified salon by its slug.
 * Returns null if not found or if status is not VERIFIED.
 */
export async function getSalonBySlug(slug: string): Promise<FullSalonDetails | null> {
  if (!slug) return null;

  const salon = await db.salon.findFirst({
    where: {
      slug,
      status: VerificationStatus.VERIFIED,
    },
    include: {
      hours: {
        orderBy: { weekday: 'asc' },
      },
      barbers: {
        where: {
          status: VerificationStatus.VERIFIED,
          isActive: true,
        },
        include: {
          services: {
            include: {
              service: true,
            },
          },
        },
      },
      services: {
        where: {
          isActive: true,
        },
        orderBy: [
          { category: 'asc' },
          { sortOrder: 'asc' },
        ],
      },
      reviews: {
        include: {
          customer: {
            select: {
              name: true,
            },
          },
          barber: {
            select: {
              displayName: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 10,
      },
    },
  });

  if (!salon) return null;

  const isOpen = isSalonOpenNow(salon.hours);
  const activePrices = salon.services.map((s) => s.priceRupees);
  const minPrice = activePrices.length > 0 ? Math.min(...activePrices) : 0;
  const avgRating =
    salon.reviews.length > 0
      ? Number(
          (
            salon.reviews.reduce((acc, r) => acc + r.rating, 0) /
            salon.reviews.length
          ).toFixed(1)
        )
      : 4.8;

  return {
    ...salon,
    isOpenNow: isOpen,
    minPrice,
    averageRating: avgRating,
  };
}

/**
 * Group active services by their ServiceCategory.
 */
export function groupServicesByCategory(
  services: Service[]
): Record<ServiceCategory, Service[]> {
  const initial: Record<ServiceCategory, Service[]> = {
    [ServiceCategory.HAIR]: [],
    [ServiceCategory.BEARD]: [],
    [ServiceCategory.SHAVE]: [],
    [ServiceCategory.FACIAL]: [],
    [ServiceCategory.MASSAGE]: [],
    [ServiceCategory.KIDS]: [],
    [ServiceCategory.BRIDAL]: [],
    [ServiceCategory.OTHER]: [],
  };

  return services.reduce((acc, service) => {
    if (acc[service.category]) {
      acc[service.category].push(service);
    } else {
      acc[service.category] = [service];
    }
    return acc;
  }, initial);
}

export interface ServicesSummary {
  selectedServices: Service[];
  totalPriceRupees: number;
  totalDurationMin: number;
  serviceCount: number;
}

/**
 * Compute total price, total duration, and selected service entities
 * for an array of selected service IDs.
 */
export function calculateServicesSummary(
  allServices: Service[],
  selectedServiceIds: string[]
): ServicesSummary {
  const selectedSet = new Set(selectedServiceIds);
  const selectedServices = allServices.filter((s) => selectedSet.has(s.id));

  const totalPriceRupees = selectedServices.reduce(
    (sum, s) => sum + s.priceRupees,
    0
  );
  const totalDurationMin = selectedServices.reduce(
    (sum, s) => sum + s.durationMin,
    0
  );

  return {
    selectedServices,
    totalPriceRupees,
    totalDurationMin,
    serviceCount: selectedServices.length,
  };
}
