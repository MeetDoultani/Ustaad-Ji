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
