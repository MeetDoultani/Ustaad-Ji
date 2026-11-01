'use server';

import { z } from 'zod';
import { getCurrentUser, CurrentUser } from '@/lib/auth-server';
import { db } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export const ProfileNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name cannot be empty')
    .max(80, 'Name cannot exceed 80 characters'),
});

export async function updateProfileName(
  prevState: { success?: boolean; error?: string } | null,
  formData: FormData | Record<string, unknown>,
  userOverride?: CurrentUser | null
) {
  const user = userOverride !== undefined ? userOverride : await getCurrentUser();
  if (!user) {
    return { success: false, error: 'Unauthorized. Please login again.' };
  }

  const rawName =
    formData instanceof FormData
      ? formData.get('name')
      : (formData as { name?: unknown })?.name;
  const parseResult = ProfileNameSchema.safeParse({ name: rawName });

  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.errors[0]?.message || 'Invalid name',
    };
  }

  // Only the validated name is updated in the database; any other fields (such as role) are stripped
  await db.user.update({
    where: { id: user.id },
    data: {
      name: parseResult.data.name,
    },
  });

  try {
    revalidatePath('/account');
  } catch {
    // revalidatePath might throw when executed in unit tests outside Next.js request lifecycle
  }

  return { success: true };
}
