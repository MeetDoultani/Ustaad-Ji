/**
 * Environment configuration and startup safety validation.
 */

export function validateEnv(overrides?: Record<string, string | undefined>) {
  const env = overrides ? { ...process.env, ...overrides } : process.env;
  const isTest = overrides?.NODE_ENV !== undefined
    ? overrides.NODE_ENV === 'test'
    : process.env.NODE_ENV === 'test';

  const authSecret = env.AUTH_SECRET;
  const otpPepper = env.OTP_PEPPER;
  const appEnv = env.APP_ENV;
  const nodeEnv = env.NODE_ENV;
  const allowTestOtp = env.ALLOW_TEST_OTP;

  // In production, ALLOW_TEST_OTP must never be true
  const isProduction = appEnv === 'production' || nodeEnv === 'production';
  if (isProduction && allowTestOtp === 'true') {
    throw new Error('SECURITY VIOLATION: ALLOW_TEST_OTP cannot be enabled in a production environment!');
  }

  // Outside tests, AUTH_SECRET and OTP_PEPPER must be defined
  if (!isTest) {
    if (!authSecret || authSecret.trim() === '') {
      throw new Error('FATAL: AUTH_SECRET is missing. Generate one using `openssl rand -base64 32`.');
    }
    if (!otpPepper || otpPepper.trim() === '') {
      throw new Error('FATAL: OTP_PEPPER is missing. Generate one using `openssl rand -base64 32`.');
    }
  }

  return {
    AUTH_SECRET: authSecret,
    OTP_PEPPER: otpPepper,
    APP_ENV: appEnv || 'development',
    NODE_ENV: nodeEnv || 'development',
    ALLOW_TEST_OTP: allowTestOtp === 'true',
  };
}

// Run validation on module initialization (fails fast on startup)
validateEnv();
