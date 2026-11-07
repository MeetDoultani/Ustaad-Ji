import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { resolveLocale, isValidLocale, getLocalizedName, locales, defaultLocale } from '../i18n/config';
import enMessages from '../messages/en.json';
import hiMessages from '../messages/hi.json';

describe('Phase 3B: Internationalization (i18n) Suite', () => {
  describe('1. Dictionary Key & Placeholder Parity (en.json vs hi.json)', () => {
    function flattenKeys(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          Object.assign(result, flattenKeys(value as Record<string, unknown>, fullKey));
        } else {
          result[fullKey] = String(value);
        }
      }
      return result;
    }

    const enFlat = flattenKeys(enMessages as Record<string, unknown>);
    const hiFlat = flattenKeys(hiMessages as Record<string, unknown>);

    it('en.json and hi.json must have the exact same message keys', () => {
      const enKeys = Object.keys(enFlat).sort();
      const hiKeys = Object.keys(hiFlat).sort();

      const missingInHi = enKeys.filter((k) => !(k in hiFlat));
      const missingInEn = hiKeys.filter((k) => !(k in enFlat));

      expect(missingInHi, `Keys in en.json missing from hi.json: ${missingInHi.join(', ')}`).toEqual([]);
      expect(missingInEn, `Keys in hi.json missing from en.json: ${missingInEn.join(', ')}`).toEqual([]);
      expect(enKeys.length).toBe(hiKeys.length);
      expect(enKeys.length).toBeGreaterThan(60);
    });

    it('all message values must be non-empty strings', () => {
      for (const [key, val] of Object.entries(enFlat)) {
        expect(val.trim().length, `en.json key "${key}" is empty`).toBeGreaterThan(0);
      }
      for (const [key, val] of Object.entries(hiFlat)) {
        expect(val.trim().length, `hi.json key "${key}" is empty`).toBeGreaterThan(0);
      }
    });

    it('any {placeholder} variables must match between en.json and hi.json', () => {
      const extractPlaceholders = (str: string): string[] => {
        const matches = str.match(/\{[a-zA-Z0-9_]+\}/g) || [];
        return matches.sort();
      };

      for (const key of Object.keys(enFlat)) {
        const enPlaceholders = extractPlaceholders(enFlat[key]);
        const hiPlaceholders = extractPlaceholders(hiFlat[key]);
        expect(
          hiPlaceholders,
          `Placeholders mismatch for key "${key}": EN=${JSON.stringify(enPlaceholders)} vs HI=${JSON.stringify(hiPlaceholders)}`
        ).toEqual(enPlaceholders);
      }
    });
  });

  describe('2. Locale Resolution & Validation', () => {
    it('locales array contains only "en" and "hi"', () => {
      expect(locales).toEqual(['en', 'hi']);
      expect(defaultLocale).toBe('en');
    });

    it('isValidLocale() correctly identifies valid and invalid locales', () => {
      expect(isValidLocale('en')).toBe(true);
      expect(isValidLocale('hi')).toBe(true);
      expect(isValidLocale('es')).toBe(false);
      expect(isValidLocale('fr')).toBe(false);
      expect(isValidLocale('')).toBe(false);
      expect(isValidLocale(null)).toBe(false);
      expect(isValidLocale(undefined)).toBe(false);
    });

    it('resolveLocale() prioritizes valid cookie over user preference', () => {
      expect(resolveLocale('hi', 'en')).toBe('hi');
      expect(resolveLocale('en', 'hi')).toBe('en');
    });

    it('resolveLocale() falls back to user language when cookie is missing or invalid', () => {
      expect(resolveLocale(null, 'hi')).toBe('hi');
      expect(resolveLocale(undefined, 'hi')).toBe('hi');
      expect(resolveLocale('invalid', 'hi')).toBe('hi');
      expect(resolveLocale(null, 'en')).toBe('en');
    });

    it('resolveLocale() falls back to defaultLocale ("en") when both are missing or invalid', () => {
      expect(resolveLocale(null, null)).toBe('en');
      expect(resolveLocale(undefined, undefined)).toBe('en');
      expect(resolveLocale('invalid', 'unknown')).toBe('en');
    });
  });

  describe('3. Single-field Entity Fallback (getLocalizedName)', () => {
    const bilingualSalon = {
      name: 'Deluxe Salon & Spa',
      nameHi: 'डीलक्स सैलून एवं स्पा',
    };

    const englishOnlySalon = {
      name: 'Royal Heritage Barber',
      nameHi: null,
    };

    const emptyHindiSalon = {
      name: 'Star Cut Parlour',
      nameHi: '   ',
    };

    it('returns nameHi when locale is "hi" and nameHi exists', () => {
      expect(getLocalizedName(bilingualSalon, 'hi')).toBe('डीलक्स सैलून एवं स्पा');
    });

    it('returns English name when locale is "en" even if nameHi exists', () => {
      expect(getLocalizedName(bilingualSalon, 'en')).toBe('Deluxe Salon & Spa');
    });

    it('falls back to English name when locale is "hi" but nameHi is null or whitespace', () => {
      expect(getLocalizedName(englishOnlySalon, 'hi')).toBe('Royal Heritage Barber');
      expect(getLocalizedName(emptyHindiSalon, 'hi')).toBe('Star Cut Parlour');
    });

    it('handles entity without nameHi field gracefully', () => {
      expect(getLocalizedName({ name: 'Simple Shop' }, 'hi')).toBe('Simple Shop');
    });
  });

  describe('4. Server Error Codes Dictionary Coverage', () => {
    const errorCodes = [
      'generic',
      'SLOT_TAKEN',
      'PAST_TIME',
      'OUTSIDE_WINDOW',
      'OUTSIDE_SALON_HOURS',
      'OUTSIDE_BARBER_HOURS',
      'OFF_GRID',
      'CUSTOMER_OVERLAP',
      'ACTIVE_LIMIT_EXCEEDED',
      'RATE_LIMIT_EXCEEDED',
      'CUTOFF_EXCEEDED',
      'CUTOFF_PASSED',
      'NOT_FOUND',
      'INVALID_STATUS',
      'UNKNOWN_ERROR',
      'EMPTY_REASON',
      'UNAUTHORIZED',
      'INVALID_INPUT',
      'BARBER_NOT_FOUND',
      'SALON_NOT_FOUND',
      'SERVICE_MISMATCH',
      'SERVICE_INACTIVE',
      'BARBER_SERVICE_MISMATCH',
      'INVALID_LOCALE',
      'OTP_INVALID',
      'OTP_EXPIRED',
      'OTP_MAX_ATTEMPTS',
      'OTP_RATE_LIMITED',
    ];

    it('all system error codes have entries in both en.json and hi.json', () => {
      const enErrors = (enMessages as Record<string, Record<string, string>>).errors || {};
      const hiErrors = (hiMessages as Record<string, Record<string, string>>).errors || {};

      for (const code of errorCodes) {
        expect(enErrors[code], `Missing en.json error translation for: ${code}`).toBeDefined();
        expect(enErrors[code].length).toBeGreaterThan(0);

        expect(hiErrors[code], `Missing hi.json error translation for: ${code}`).toBeDefined();
        expect(hiErrors[code].length).toBeGreaterThan(0);
      }
    });
  });

  describe('5. Component Audit: Zero Hardcoded Bilingual Slash Pairs & Old Branding', () => {
    function getAllFiles(dir: string, ext: string[]): string[] {
      let results: string[] = [];
      if (!fs.existsSync(dir)) return results;
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
          results = results.concat(getAllFiles(fullPath, ext));
        } else if (ext.some((e) => file.endsWith(e))) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const componentFiles = [
      ...getAllFiles(path.resolve(__dirname, '../components/ui'), ['.tsx']),
      ...getAllFiles(path.resolve(__dirname, '../app'), ['.tsx']),
    ];

    it('contains no forbidden bilingual slash pairings (e.g. " / ") in UI component files', () => {
      // Forbidden patterns representing old bilingual slash combinations
      const forbiddenSlashPatterns = [
        /Salons Dekhein \/ सैलून देखें/i,
        /Ghar Wapas \/ Home/i,
        /Pravesh Nishedh \/ No Entry/i,
        /Dobara Koshish Karein \/ Try Again/i,
        /Rate Card \/ रेट कार्ड/i,
        /Admin Sahab Desk \/ एडमिन डेस्क/i,
        /Aap Offline Hain \/ आप ऑफलाइन हैं/i,
      ];

      const violations: string[] = [];

      for (const file of componentFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        for (const pattern of forbiddenSlashPatterns) {
          if (pattern.test(content)) {
            violations.push(`${path.basename(file)} matches forbidden pattern ${pattern}`);
          }
        }
      }

      expect(violations).toEqual([]);
    });

    it('contains no obsolete branding "Indian Salon Booking" in UI component files', () => {
      const violations: string[] = [];

      for (const file of componentFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        if (/Indian Salon Booking/i.test(content)) {
          violations.push(`${path.basename(file)} contains obsolete brand name "Indian Salon Booking"`);
        }
      }

      expect(violations).toEqual([]);
    });
  });
});
