import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

export interface PhoneValidationResult {
  isValid: boolean;
  e164?: string;
  error?: string;
}

/**
 * Normalises an Indian phone number to E.164 format (+91XXXXXXXXXX).
 * Accepts 10-digit numbers, numbers starting with +91, 91, or leading 0,
 * with optional spaces and dashes. Rejects invalid or non-mobile numbers.
 */
export function normalizeIndianPhone(rawPhone: string): PhoneValidationResult {
  if (!rawPhone || typeof rawPhone !== 'string') {
    return { isValid: false, error: 'Please enter a valid phone number.' };
  }

  const cleaned = rawPhone.trim();
  if (cleaned.length === 0) {
    return { isValid: false, error: 'Please enter a valid phone number.' };
  }

  // Check for alphabetical characters
  if (/[a-zA-Z]/.test(cleaned)) {
    return { isValid: false, error: 'Phone number cannot contain letters.' };
  }

  const phoneNumber = parsePhoneNumberFromString(cleaned, 'IN');

  if (!phoneNumber || !phoneNumber.isValid()) {
    return { isValid: false, error: 'Invalid 10-digit Indian mobile number.' };
  }

  // Verify mobile number type
  const numberType = phoneNumber.getType();
  if (numberType && numberType !== 'MOBILE' && numberType !== 'FIXED_LINE_OR_MOBILE') {
    return { isValid: false, error: 'Please enter a mobile number, not a landline.' };
  }

  const e164 = phoneNumber.format('E.164');
  return {
    isValid: true,
    e164,
  };
}
