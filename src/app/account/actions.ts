'use server';

import { z } from 'zod';
import { getCurrentUser, CurrentUser } from '@/lib/auth-server';
import { db } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { isValidLocale } from '@/i18n/config';

export const ProfileNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name cannot be empty')
    .max(80, 'Name cannot exceed 80 characters'),
  language: z.enum(['en', 'hi']).optional(),
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

  const rawLang =
    formData instanceof FormData
      ? formData.get('language')
      : (formData as { language?: unknown })?.language;

  const parseResult = ProfileNameSchema.safeParse({
    name: rawName,
    language: rawLang || undefined,
  });

  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.errors[0]?.message || 'Invalid input',
    };
  }

  const updateData: { name: string; language?: string } = {
    name: parseResult.data.name,
  };

  if (parseResult.data.language && isValidLocale(parseResult.data.language)) {
    updateData.language = parseResult.data.language;
    try {
      const cookieStore = await cookies();
      cookieStore.set('NEXT_LOCALE', parseResult.data.language, {
        path: '/',
        maxAge: 31536000,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });
    } catch {
      // Ignored if executed in test
    }
  }

  // Only the validated name and language are updated in the database; role/status are completely stripped
  await db.user.update({
    where: { id: user.id },
    data: updateData,
  });

  try {
    revalidatePath('/account');
  } catch {
    // revalidatePath might throw when executed in unit tests outside Next.js request lifecycle
  }

  return { success: true };
}
