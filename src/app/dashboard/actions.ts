'use server';

import { z } from 'zod';
import { BookingStatus } from '@prisma/client';
import { getCurrentUser } from '@/lib/auth-server';
import {
  updateBookingStatusStaff,
  createWalkInBooking,
} from '@/lib/dashboard-service';
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
