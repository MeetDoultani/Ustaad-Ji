'use server';

import { getCurrentUser } from '@/lib/auth-server';
import { canApproveSalon, canApproveBarber } from '@/lib/policies';
import { db } from '@/lib/db';
import { VerificationStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';

export interface AdminActionResult {
  success: boolean;
  error?: string;
}

export async function updateSalonStatus(
  salonId: string,
  newStatus: VerificationStatus
): Promise<AdminActionResult> {
  const user = await getCurrentUser();
  if (!user || !canApproveSalon(user)) {
    return { success: false, error: 'Unauthorized: Admin role required' };
  }

  const existing = await db.salon.findUnique({
    where: { id: salonId },
    select: { id: true, status: true, name: true },
  });

  if (!existing) {
    return { success: false, error: 'Salon not found' };
  }

  const oldStatus = existing.status;
  await db.salon.update({
    where: { id: salonId },
    data: { status: newStatus },
  });

  console.info(
    JSON.stringify({
      event: 'ADMIN_SALON_STATUS_CHANGE',
      adminId: user.id,
      targetId: salonId,
      salonName: existing.name,
      oldStatus,
      newStatus,
      timestamp: new Date().toISOString(),
    })
  );

  revalidatePath('/admin');
  revalidatePath('/salons');
  revalidatePath('/');
  return { success: true };
}

export async function updateBarberStatus(
  barberId: string,
  newStatus: VerificationStatus
): Promise<AdminActionResult> {
  const user = await getCurrentUser();
  if (!user || !canApproveBarber(user)) {
    return { success: false, error: 'Unauthorized: Admin role required' };
  }

  const existing = await db.barber.findUnique({
    where: { id: barberId },
    select: { id: true, status: true, displayName: true },
  });

  if (!existing) {
    return { success: false, error: 'Barber not found' };
  }

  const oldStatus = existing.status;
  await db.barber.update({
    where: { id: barberId },
    data: { status: newStatus },
  });

  console.info(
    JSON.stringify({
      event: 'ADMIN_BARBER_STATUS_CHANGE',
      adminId: user.id,
      targetId: barberId,
      barberName: existing.displayName,
      oldStatus,
      newStatus,
      timestamp: new Date().toISOString(),
    })
  );

  revalidatePath('/admin');
  revalidatePath('/salons');
  revalidatePath('/');
  return { success: true };
}
