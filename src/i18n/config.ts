export const locales = ['en', 'hi'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

export function isValidLocale(locale: unknown): locale is Locale {
  return typeof locale === 'string' && (locales as readonly string[]).includes(locale);
}

/**
 * Pure locale resolution function:
 * 1) Valid cookie takes priority
 * 2) If no valid cookie, user's saved language preference if supported
 * 3) Default locale ('en') fallback
 */
export function resolveLocale(
  cookieLocale?: string | null,
  userLanguage?: string | null
): Locale {
  if (cookieLocale && isValidLocale(cookieLocale)) {
    return cookieLocale;
  }
  if (userLanguage && isValidLocale(userLanguage)) {
    return userLanguage;
  }
  return defaultLocale;
}

export function getLocalizedName(
  entity: { name: string; nameHi?: string | null },
  locale: string
): string {
  if (locale === 'hi' && entity.nameHi && entity.nameHi.trim().length > 0) {
    return entity.nameHi;
  }
  return entity.name;
}
