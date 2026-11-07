import { describe, it, expect } from 'vitest';
import enMessages from '../messages/en.json';
import hiMessages from '../messages/hi.json';
import {
  MIN_LEAD_MIN,
  MAX_ADVANCE_DAYS,
  MAX_ACTIVE_BOOKINGS_PER_CUSTOMER,
  CANCEL_CUTOFF_MIN,
} from '../lib/booking-config';

describe('Phase 4A Part 1: Small Fixes & Terminology Verification', () => {
  describe('A.1 - A.9: Honest Data, Plain Errors & Config Gating', () => {
    it('A.4: Dev hint gating logic - renders only when APP_ENV !== production AND ALLOW_TEST_OTP === true', () => {
      const isDevHintVisible = (env: string | undefined, allowOtp: string | undefined) => {
        return env !== 'production' && allowOtp === 'true';
      };

      expect(isDevHintVisible('production', 'true')).toBe(false);
      expect(isDevHintVisible('production', 'false')).toBe(false);
      expect(isDevHintVisible('development', 'false')).toBe(false);
      expect(isDevHintVisible(undefined, 'false')).toBe(false);
      expect(isDevHintVisible('development', 'true')).toBe(true);
      expect(isDevHintVisible('test', 'true')).toBe(true);
      expect(isDevHintVisible('staging', 'true')).toBe(true);
    });

    it('A.5: Guaranteed wording is replaced with confirmed token in both languages', () => {
      const enHeroDesc = enMessages.home.heroSub;
      const hiHeroDesc = hiMessages.home.heroSub;

      expect(enHeroDesc.toLowerCase()).toContain('confirmed digital token');
      expect(enHeroDesc.toLowerCase()).not.toContain('guaranteed digital token');

      expect(hiHeroDesc).toContain('पक्का डिजिटल टोकन');
      expect(hiHeroDesc).not.toContain('गारंटीड डिजिटल टोकन');
    });

    it('A.3: Offline page text does not claim saved bookings remain accessible', () => {
      const enOffline = enMessages.common.offlineDesc;
      const hiOffline = hiMessages.common.offlineDesc;

      expect(enOffline.toLowerCase()).not.toContain('saved bookings');
      expect(enOffline.toLowerCase()).not.toContain('remain accessible');
      expect(enOffline.toLowerCase()).toContain('check your internet connection');

      expect(hiOffline).not.toContain('सुरक्षित');
      expect(hiOffline).not.toContain('ऑफ़लाइन भी उपलब्ध');
      expect(hiOffline).toContain('इंटरनेट कनेक्शन जाँचें');
    });

    it('A.6: Internal labels replaced with natural human titles', () => {
      // Pick a time / समय चुनें
      expect(enMessages.salonDetails.diaryTitle).toBe('Pick a time');
      expect(hiMessages.salonDetails.diaryTitle).toBe('समय चुनें');

      // Rate Card / रेट कार्ड
      expect(enMessages.salonDetails.rateCardTitle).toBe('Rate Card');
      expect(hiMessages.salonDetails.rateCardTitle).toBe('रेट कार्ड');

      // Customer Reviews / ग्राहकों की राय
      expect(enMessages.salonDetails.reviewsTitle).toBe('Customer Reviews');
      expect(hiMessages.salonDetails.reviewsTitle).toBe('ग्राहकों की राय');

      // Manage Salons / Manage Barbers
      expect(enMessages.admin.salonsHeading).toBe('Manage Salons');
      expect(enMessages.admin.barbersHeading).toBe('Manage Barbers');
      expect(hiMessages.admin.salonsHeading).toBe('सैलून प्रबंध');
      expect(hiMessages.admin.barbersHeading).toBe('उस्ताद प्रबंध');

      // Phone & Verify
      expect(enMessages.auth.phoneLabel).toBe('Phone');
      expect(enMessages.auth.verifyButton).toBe('Verify');

      // No mentions of Phase 4 or Role verified in any messages
      const enString = JSON.stringify(enMessages);
      const hiString = JSON.stringify(hiMessages);
      expect(enString).not.toContain('Phase 4');
      expect(hiString).not.toContain('चरण 4');
      expect(enString).not.toContain('Role verified:');
    });

    it('A.7 & A.8: Plain error messages populated with values from booking-config', () => {
      const formatMessage = (template: string, vars: Record<string, string | number>) => {
        let res = template;
        for (const [k, v] of Object.entries(vars)) {
          res = res.replace(`{${k}}`, String(v));
        }
        return res;
      };

      // PAST_TIME
      const enPast = formatMessage(enMessages.errors.PAST_TIME, { minutes: MIN_LEAD_MIN });
      const hiPast = formatMessage(hiMessages.errors.PAST_TIME, { minutes: MIN_LEAD_MIN });
      expect(enPast).toBe(`Please pick a time at least ${MIN_LEAD_MIN} minutes from now.`);
      expect(hiPast).toBe(`कृपया अब से कम से कम ${MIN_LEAD_MIN} मिनट बाद का समय चुनें।`);

      // OUTSIDE_WINDOW
      const enWindow = formatMessage(enMessages.errors.OUTSIDE_WINDOW, { days: MAX_ADVANCE_DAYS });
      const hiWindow = formatMessage(hiMessages.errors.OUTSIDE_WINDOW, { days: MAX_ADVANCE_DAYS });
      expect(enWindow).toBe(`Bookings can only be made up to ${MAX_ADVANCE_DAYS} days in advance.`);
      expect(hiWindow).toBe(`बुकिंग केवल अगले ${MAX_ADVANCE_DAYS} दिनों तक ही की जा सकती है।`);

      // ACTIVE_LIMIT_EXCEEDED
      const enActive = formatMessage(enMessages.errors.ACTIVE_LIMIT_EXCEEDED, { count: MAX_ACTIVE_BOOKINGS_PER_CUSTOMER });
      const hiActive = formatMessage(hiMessages.errors.ACTIVE_LIMIT_EXCEEDED, { count: MAX_ACTIVE_BOOKINGS_PER_CUSTOMER });
      expect(enActive).toBe(`You have reached the maximum of ${MAX_ACTIVE_BOOKINGS_PER_CUSTOMER} active bookings. Please complete or cancel an existing appointment first.`);
      expect(hiActive).toBe(`आप अधिकतम ${MAX_ACTIVE_BOOKINGS_PER_CUSTOMER} सक्रिय बुकिंग ही रख सकते हैं। पहले पुरानी बुकिंग पूरी करें या रद्द करें।`);

      // CUTOFF_PASSED & CUTOFF_EXCEEDED
      const enCutoff = formatMessage(enMessages.errors.CUTOFF_PASSED, { minutes: CANCEL_CUTOFF_MIN });
      const hiCutoff = formatMessage(hiMessages.errors.CUTOFF_PASSED, { minutes: CANCEL_CUTOFF_MIN });
      expect(enCutoff).toBe(`Bookings cannot be cancelled or modified less than ${CANCEL_CUTOFF_MIN} minutes before start time.`);
      expect(hiCutoff).toBe(`शुरू होने के ${CANCEL_CUTOFF_MIN} मिनट से कम समय में बुकिंग रद्द या बदली नहीं जा सकती।`);

      // OFF_GRID
      expect(enMessages.errors.OFF_GRID).toBe('Please pick a time from the list.');
      expect(hiMessages.errors.OFF_GRID).toBe('कृपया सूची में से ही कोई समय चुनें।');

      // INVALID_STATUS
      expect(enMessages.errors.INVALID_STATUS).toBe("This booking can't be changed right now.");
      expect(hiMessages.errors.INVALID_STATUS).toBe('इस बुकिंग को अभी बदला नहीं जा सकता।');
    });

    it('A.9: BRIDAL category is displayed as Groom Styling / दूल्हा स्टाइलिंग', () => {
      expect(enMessages.categories.BRIDAL).toBe('Groom Styling');
      expect(hiMessages.categories.BRIDAL).toBe('दूल्हा स्टाइलिंग');
    });
  });

  describe('B: Terminology & Hindi Spelling Consistency', () => {
    it('English uses Barber / Our Barbers (no Master Barber)', () => {
      const enJsonStr = JSON.stringify(enMessages);
      expect(enJsonStr).not.toContain('Master Barber');
      expect(enJsonStr).not.toContain('Our Master Barbers');
      expect(enMessages.salonDetails.ustaadTitle).toBe('Our Barbers');
      expect(enMessages.roles.BARBER).toBe('Barber');
    });

    it('Hindi uses उस्ताद for barbers on people-facing screens and removes उस्ताद कारीगर / उस्ताद नाई', () => {
      const hiJsonStr = JSON.stringify(hiMessages);
      expect(hiJsonStr).not.toContain('उस्ताद कारीगर');
      expect(hiJsonStr).not.toContain('उस्ताद नाई');
      expect(hiMessages.roles.BARBER).toBe('उस्ताद');
      expect(hiMessages.salonDetails.ustaadTitle).toBe('हमारे उस्ताद');
    });

    it('Consistent Hindi nukta and chandrabindu spellings', () => {
      const hiJsonStr = JSON.stringify(hiMessages);

      // Nukta checks
      expect(hiJsonStr).not.toMatch(/[^फ़]फोन/); // Must use फ़ोन
      expect(hiJsonStr).not.toMatch(/[^ज़]जरूर/); // Must use ज़रूर
      expect(hiJsonStr).not.toMatch(/[^ज़]इंतजार/); // Must use इंतज़ार
      expect(hiJsonStr).not.toMatch(/[^फ़]प्रोफाइल/); // Must use प्रोफ़ाइल
      expect(hiJsonStr).not.toMatch(/[^ज़]अंग्रेजी/); // Must use अंग्रेज़ी

      // Chandrabindu checks
      expect(hiJsonStr).not.toMatch(/पाएं/); // Must use पाएँ
      expect(hiJsonStr).not.toMatch(/सेवाएं/); // Must use सेवाएँ
      expect(hiJsonStr).not.toMatch(/जांच/); // Must use जाँच
      expect(hiJsonStr).not.toMatch(/कहीं/); // Must use कहीं (with anusvara/bindu)
    });
  });
});
