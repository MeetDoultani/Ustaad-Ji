'use server';

import { z } from 'zod';
import { BookingStatus, ServiceCategory } from '@prisma/client';
import { getCurrentUser } from '@/lib/auth-server';
import {
  updateBookingStatusStaff,
  createWalkInBooking,
  getStaffDashboardContext,
} from '@/lib/dashboard-service';
import {
  createServiceStaff,
  updateServiceStaff,
  toggleServiceActiveStaff,
  reorderServicesStaff,
  updateSalonHoursStaff,
  updateBarberAvailabilityStaff,
  createBarberTimeOffStaff,
  deleteBarberTimeOffStaff,
} from '@/lib/staff-config-service';
import {
  addBarberStaff,
  removeBarberStaff,
  reactivateBarberStaff,
  updateBarberProfileStaff,
  updateSalonProfileStaff,
} from '@/lib/staff-roster-service';
import { revalidatePath } from 'next/cache';

const updateStatusSchema = z.object({
  bookingId: z.string().min(1),
  expectedStatus: z.nativeEnum(BookingStatus),
  newStatus: z.nativeEnum(BookingStatus),
  cancelReason: z.string().optional(),
});

export async function updateBookingStatusAction(formData: {
  bookingId: string;
  expectedStatus: BookingStatus;
  newStatus: BookingStatus;
  cancelReason?: string;
}) {
  const parsed = updateStatusSchema.safeParse(formData);
  if (!parsed.success) {
    return { ok: false, code: 'INVALID_INPUT', error: 'Invalid input parameters.' };
  }

  const user = await getCurrentUser();
  if (!user || (user.role !== 'BARBER' && user.role !== 'OWNER')) {
    return { ok: false, code: 'UNAUTHORIZED', error: 'Unauthorized.' };
  }

  const result = await updateBookingStatusStaff({
    staffUser: user,
    bookingId: parsed.data.bookingId,
    expectedStatus: parsed.data.expectedStatus,
    newStatus: parsed.data.newStatus,
    cancelReason: parsed.data.cancelReason,
  });

  if (!result.ok) {
    return { ok: false, code: result.code, error: result.message };
  }

  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/bookings/${parsed.data.bookingId}`);

  return { ok: true, data: result.data };
}

const createWalkInSchema = z.object({
  barberId: z.string().min(1),
  serviceIds: z.array(z.string().min(1)).min(1).max(6),
  customerName: z.string().max(60).optional(),
  customerPhone: z.string().optional(),
});

export async function createWalkInAction(data: {
  barberId: string;
  serviceIds: string[];
  customerName?: string;
  customerPhone?: string;
}) {
  const parsed = createWalkInSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, code: 'INVALID_INPUT', error: 'Invalid input parameters.' };
  }

  const user = await getCurrentUser();
  if (!user || (user.role !== 'BARBER' && user.role !== 'OWNER')) {
    return { ok: false, code: 'UNAUTHORIZED', error: 'Unauthorized.' };
  }

  const result = await createWalkInBooking({
    staffUser: user,
    barberId: parsed.data.barberId,
    serviceIds: parsed.data.serviceIds,
    customerName: parsed.data.customerName,
    customerPhone: parsed.data.customerPhone,
  });

  if (!result.ok) {
    return { ok: false, code: result.code, error: result.message };
  }

  revalidatePath('/dashboard');
  return { ok: true, data: result.data };
}

// ============================================================================
// SERVICES SERVER ACTIONS
// ============================================================================

const serviceInputSchema = z.object({
  salonId: z.string().min(1),
  category: z.nativeEnum(ServiceCategory),
  name: z.string().min(2).max(60),
  nameHi: z.string().max(100).optional().nullable(),
  durationMin: z.number().int().min(15).max(240),
  priceRupees: z.number().int().min(1).max(50000),
  isActive: z.boolean().optional(),
  barberIds: z.array(z.string().min(1)).optional(),
});

export async function createServiceAction(data: z.infer<typeof serviceInputSchema>) {
  const parsed = serviceInputSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, code: 'INVALID_INPUT', error: 'Invalid service parameters.' };
  }

  const user = await getCurrentUser();
  if (!user || user.role !== 'OWNER') {
    return { ok: false, code: 'UNAUTHORIZED', error: 'Unauthorized.' };
  }

  const context = await getStaffDashboardContext(user, parsed.data.salonId);
  if (!context.ok || context.salon.id !== parsed.data.salonId) {
    return { ok: false, code: 'NOT_FOUND', error: 'Salon not found.' };
  }

  const result = await createServiceStaff(user, parsed.data.salonId, {
    category: parsed.data.category,
    name: parsed.data.name,
    nameHi: parsed.data.nameHi,
    durationMin: parsed.data.durationMin,
    priceRupees: parsed.data.priceRupees,
    isActive: parsed.data.isActive,
    barberIds: parsed.data.barberIds,
  });

  if (!result.ok) {
    return { ok: false, code: result.code, error: result.message };
  }

  revalidatePath('/dashboard/services');
  return { ok: true, data: result.data };
}

const updateServiceSchema = serviceInputSchema.extend({
  serviceId: z.string().min(1),
});

export async function updateServiceAction(data: z.infer<typeof updateServiceSchema>) {
  const parsed = updateServiceSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, code: 'INVALID_INPUT', error: 'Invalid service parameters.' };
  }

  const user = await getCurrentUser();
  if (!user || user.role !== 'OWNER') {
    return { ok: false, code: 'UNAUTHORIZED', error: 'Unauthorized.' };
  }

  const context = await getStaffDashboardContext(user, parsed.data.salonId);
  if (!context.ok || context.salon.id !== parsed.data.salonId) {
    return { ok: false, code: 'NOT_FOUND', error: 'Salon not found.' };
  }

  const result = await updateServiceStaff(user, parsed.data.salonId, parsed.data.serviceId, {
    category: parsed.data.category,
    name: parsed.data.name,
    nameHi: parsed.data.nameHi,
    durationMin: parsed.data.durationMin,
    priceRupees: parsed.data.priceRupees,
    isActive: parsed.data.isActive,
    barberIds: parsed.data.barberIds,
  });

  if (!result.ok) {
    return { ok: false, code: result.code, error: result.message };
  }

  revalidatePath('/dashboard/services');
  return { ok: true, data: result.data };
}

const toggleServiceSchema = z.object({
  salonId: z.string().min(1),
  serviceId: z.string().min(1),
  isActive: z.boolean(),
});

export async function toggleServiceActiveAction(data: z.infer<typeof toggleServiceSchema>) {
  const parsed = toggleServiceSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, code: 'INVALID_INPUT', error: 'Invalid parameters.' };
  }

  const user = await getCurrentUser();
  if (!user || user.role !== 'OWNER') {
    return { ok: false, code: 'UNAUTHORIZED', error: 'Unauthorized.' };
  }

  const context = await getStaffDashboardContext(user, parsed.data.salonId);
  if (!context.ok || context.salon.id !== parsed.data.salonId) {
    return { ok: false, code: 'NOT_FOUND', error: 'Salon not found.' };
  }

  const result = await toggleServiceActiveStaff(
    user,
    parsed.data.salonId,
    parsed.data.serviceId,
    parsed.data.isActive
  );

  if (!result.ok) {
    return { ok: false, code: result.code, error: result.message };
  }

  revalidatePath('/dashboard/services');
  return { ok: true, data: result.data };
}

const reorderServiceSchema = z.object({
  salonId: z.string().min(1),
  serviceId: z.string().min(1),
  direction: z.enum(['UP', 'DOWN']),
});

export async function reorderServiceAction(data: z.infer<typeof reorderServiceSchema>) {
  const parsed = reorderServiceSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, code: 'INVALID_INPUT', error: 'Invalid parameters.' };
  }

  const user = await getCurrentUser();
  if (!user || user.role !== 'OWNER') {
    return { ok: false, code: 'UNAUTHORIZED', error: 'Unauthorized.' };
  }

  const context = await getStaffDashboardContext(user, parsed.data.salonId);
  if (!context.ok || context.salon.id !== parsed.data.salonId) {
    return { ok: false, code: 'NOT_FOUND', error: 'Salon not found.' };
  }

  const result = await reorderServicesStaff(
    user,
    parsed.data.salonId,
    parsed.data.serviceId,
    parsed.data.direction
  );

  if (!result.ok) {
    return { ok: false, code: result.code, error: result.message };
  }

  revalidatePath('/dashboard/services');
  return { ok: true, data: result.data };
}

// ============================================================================
// SALON HOURS SERVER ACTIONS
// ============================================================================

const salonHoursSchema = z.object({
  salonId: z.string().min(1),
  hours: z.array(
    z.object({
      weekday: z.number().int().min(0).max(6),
      openMin: z.number().int().min(0).max(1440),
      closeMin: z.number().int().min(0).max(1440),
      isClosed: z.boolean(),
    })
  ).length(7),
});

export async function updateSalonHoursAction(data: z.infer<typeof salonHoursSchema>) {
  const parsed = salonHoursSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, code: 'INVALID_HOURS', error: 'Invalid hours parameters.' };
  }

  const user = await getCurrentUser();
  if (!user || user.role !== 'OWNER') {
    return { ok: false, code: 'UNAUTHORIZED', error: 'Unauthorized.' };
  }

  const context = await getStaffDashboardContext(user, parsed.data.salonId);
  if (!context.ok || context.salon.id !== parsed.data.salonId) {
    return { ok: false, code: 'NOT_FOUND', error: 'Salon not found.' };
  }

  const result = await updateSalonHoursStaff(user, parsed.data.salonId, parsed.data.hours);

  if (!result.ok) {
    return { ok: false, code: result.code, error: result.message };
  }

  revalidatePath('/dashboard/hours');
  return { ok: true, data: result.data };
}

// ============================================================================
// BARBER AVAILABILITY SERVER ACTIONS
// ============================================================================

const availabilitySchema = z.object({
  barberId: z.string().min(1),
  windows: z.array(
    z.object({
      weekday: z.number().int().min(0).max(6),
      startMin: z.number().int().min(0).max(1440),
      endMin: z.number().int().min(0).max(1440),
    })
  ),
});

export async function updateBarberAvailabilityAction(data: z.infer<typeof availabilitySchema>) {
  const parsed = availabilitySchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, code: 'INVALID_INPUT', error: 'Invalid availability parameters.' };
  }

  const user = await getCurrentUser();
  if (!user || (user.role !== 'BARBER' && user.role !== 'OWNER')) {
    return { ok: false, code: 'UNAUTHORIZED', error: 'Unauthorized.' };
  }

  const result = await updateBarberAvailabilityStaff(user, parsed.data.barberId, parsed.data.windows);

  if (!result.ok) {
    return { ok: false, code: result.code, error: result.message };
  }

  revalidatePath('/dashboard/availability');
  return { ok: true, data: result.data };
}

// ============================================================================
// TIME OFF SERVER ACTIONS
// ============================================================================

const createTimeOffSchema = z.object({
  barberId: z.string().min(1),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  reason: z.string().max(100).optional().nullable(),
});

export async function createBarberTimeOffAction(data: z.infer<typeof createTimeOffSchema>) {
  const parsed = createTimeOffSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, code: 'INVALID_INPUT', error: 'Invalid time off parameters.' };
  }

  const user = await getCurrentUser();
  if (!user || (user.role !== 'BARBER' && user.role !== 'OWNER')) {
    return { ok: false, code: 'UNAUTHORIZED', error: 'Unauthorized.' };
  }

  const result = await createBarberTimeOffStaff(user, parsed.data.barberId, {
    startsAt: new Date(parsed.data.startsAt),
    endsAt: new Date(parsed.data.endsAt),
    reason: parsed.data.reason,
  });

  if (!result.ok) {
    return { ok: false, code: result.code, error: result.message };
  }

  revalidatePath('/dashboard/time-off');
  return { ok: true, data: result.data };
}

const deleteTimeOffSchema = z.object({
  barberId: z.string().min(1),
  timeOffId: z.string().min(1),
});

export async function deleteBarberTimeOffAction(data: z.infer<typeof deleteTimeOffSchema>) {
  const parsed = deleteTimeOffSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, code: 'INVALID_INPUT', error: 'Invalid parameters.' };
  }

  const user = await getCurrentUser();
  if (!user || (user.role !== 'BARBER' && user.role !== 'OWNER')) {
    return { ok: false, code: 'UNAUTHORIZED', error: 'Unauthorized.' };
  }

  const result = await deleteBarberTimeOffStaff(user, parsed.data.barberId, parsed.data.timeOffId);

  if (!result.ok) {
    return { ok: false, code: result.code, error: result.message };
  }

  revalidatePath('/dashboard/time-off');
  return { ok: true, data: result.data };
}

// ============================================================================
// PHASE 4B-2: ROSTER & PROFILE SERVER ACTIONS
// ============================================================================

const addBarberSchema = z.object({
  salonId: z.string().min(1),
  displayName: z.string().min(2).max(40),
  phone: z.string().min(10),
  experienceYears: z.number().int().min(0).max(60).default(0),
  bio: z.string().max(300).optional().nullable(),
});

export async function addBarberAction(data: z.infer<typeof addBarberSchema>) {
  const parsed = addBarberSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, code: 'INVALID_INPUT', error: 'Invalid input parameters.' };
  }

  const user = await getCurrentUser();
  if (!user || user.role !== 'OWNER') {
    return { ok: false, code: 'UNAUTHORIZED', error: 'Unauthorized.' };
  }

  const result = await addBarberStaff(user, parsed.data.salonId, {
    displayName: parsed.data.displayName,
    phone: parsed.data.phone,
    experienceYears: parsed.data.experienceYears,
    bio: parsed.data.bio,
  });

  if (!result.ok) {
    return { ok: false, code: result.code, error: result.message };
  }

  revalidatePath('/dashboard/barbers');
  return { ok: true, data: result.data };
}

const removeBarberSchema = z.object({
  salonId: z.string().min(1),
  barberId: z.string().min(1),
});

export async function removeBarberAction(data: z.infer<typeof removeBarberSchema>) {
  const parsed = removeBarberSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, code: 'INVALID_INPUT', error: 'Invalid input parameters.' };
  }

  const user = await getCurrentUser();
  if (!user || user.role !== 'OWNER') {
    return { ok: false, code: 'UNAUTHORIZED', error: 'Unauthorized.' };
  }

  const result = await removeBarberStaff(user, parsed.data.salonId, parsed.data.barberId);

  if (!result.ok) {
    return { ok: false, code: result.code, error: result.message, data: result.data };
  }

  revalidatePath('/dashboard/barbers');
  return { ok: true, data: result.data };
}

const reactivateBarberSchema = z.object({
  salonId: z.string().min(1),
  barberId: z.string().min(1),
});

export async function reactivateBarberAction(data: z.infer<typeof reactivateBarberSchema>) {
  const parsed = reactivateBarberSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, code: 'INVALID_INPUT', error: 'Invalid input parameters.' };
  }

  const user = await getCurrentUser();
  if (!user || user.role !== 'OWNER') {
    return { ok: false, code: 'UNAUTHORIZED', error: 'Unauthorized.' };
  }

  const result = await reactivateBarberStaff(user, parsed.data.salonId, parsed.data.barberId);

  if (!result.ok) {
    return { ok: false, code: result.code, error: result.message };
  }

  revalidatePath('/dashboard/barbers');
  return { ok: true, data: result.data };
}

const updateBarberProfileSchema = z.object({
  barberId: z.string().min(1),
  displayName: z.string().min(2).max(40),
  experienceYears: z.number().int().min(0).max(60),
  bio: z.string().max(300).optional().nullable(),
  photoUrl: z.string().max(300).optional().nullable(),
});

export async function updateBarberProfileAction(data: z.infer<typeof updateBarberProfileSchema>) {
  const parsed = updateBarberProfileSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, code: 'INVALID_INPUT', error: 'Invalid input parameters.' };
  }

  const user = await getCurrentUser();
  if (!user || (user.role !== 'BARBER' && user.role !== 'OWNER')) {
    return { ok: false, code: 'UNAUTHORIZED', error: 'Unauthorized.' };
  }

  const result = await updateBarberProfileStaff(user, parsed.data.barberId, {
    displayName: parsed.data.displayName,
    experienceYears: parsed.data.experienceYears,
    bio: parsed.data.bio,
    photoUrl: parsed.data.photoUrl,
  });

  if (!result.ok) {
    return { ok: false, code: result.code, error: result.message };
  }

  revalidatePath('/dashboard/profile');
  revalidatePath(`/dashboard/barbers/${parsed.data.barberId}`);
  return { ok: true, data: result.data };
}

const updateSalonProfileSchema = z.object({
  salonId: z.string().min(1),
  name: z.string().min(2).max(60),
  nameHi: z.string().max(100).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  phone: z.string().optional().nullable(),
  addressLine: z.string().min(5).max(120),
  area: z.string().min(2).max(60),
  city: z.string().min(2).max(60),
  pincode: z.string().regex(/^\d{6}$/),
  requiresApproval: z.boolean(),
});

export async function updateSalonProfileAction(data: z.infer<typeof updateSalonProfileSchema>) {
  const parsed = updateSalonProfileSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, code: 'INVALID_INPUT', error: 'Invalid input parameters.' };
  }

  const user = await getCurrentUser();
  if (!user || user.role !== 'OWNER') {
    return { ok: false, code: 'UNAUTHORIZED', error: 'Unauthorized.' };
  }

  const result = await updateSalonProfileStaff(user, parsed.data.salonId, {
    name: parsed.data.name,
    nameHi: parsed.data.nameHi,
    description: parsed.data.description,
    phone: parsed.data.phone,
    addressLine: parsed.data.addressLine,
    area: parsed.data.area,
    city: parsed.data.city,
    pincode: parsed.data.pincode,
    requiresApproval: parsed.data.requiresApproval,
  });

  if (!result.ok) {
    return { ok: false, code: result.code, error: result.message };
  }

  revalidatePath('/dashboard/profile');
  return { ok: true, data: result.data };
}

