/**
 * OTP Sender interface and implementations.
 */

export interface OtpSender {
  sendOtp(phone: string, code: string): Promise<void>;
}

export class ConsoleOtpSender implements OtpSender {
  async sendOtp(phone: string, code: string): Promise<void> {
    const isProduction =
      process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production';
    if (isProduction) {
      throw new Error('FATAL: ConsoleOtpSender cannot be used in a production environment!');
    }

    // Mask phone for server log hygiene: +91******3210
    const maskedPhone =
      phone.length > 7
        ? `${phone.slice(0, 3)}******${phone.slice(-4)}`
        : phone;

    console.info(`[ConsoleOtpSender] OTP for ${phone} (${maskedPhone}): ${code}`);
  }
}

/**
 * MSG91 SMS Provider Stub.
 * When configuring MSG91 in production:
 * 1. Set MSG91_AUTH_KEY, MSG91_TEMPLATE_ID, MSG91_SENDER_ID in production environment.
 * 2. Send HTTPS POST to https://control.msg91.com/api/v5/otp with phone and OTP code.
 */
export class Msg91OtpSender implements OtpSender {
  async sendOtp(_phone: string, _code: string): Promise<void> {
    void _phone;
    void _code;
    throw new Error('Msg91OtpSender is not configured. Set SMS provider credentials in production.');
  }
}

let activeSender: OtpSender | null = null;

export function getOtpSender(): OtpSender {
  if (activeSender) return activeSender;

  const provider = process.env.OTP_PROVIDER?.toLowerCase();
  if (provider === 'msg91') {
    activeSender = new Msg91OtpSender();
  } else {
    activeSender = new ConsoleOtpSender();
  }

  return activeSender;
}

export function setOtpSenderForTesting(sender: OtpSender | null): void {
  activeSender = sender;
}
