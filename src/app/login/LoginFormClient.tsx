'use client';

import React, { useState, useRef, useEffect, useTransition } from 'react';
import { signIn } from 'next-auth/react';
import { sendOtpAction, getPostLoginRedirect } from './actions';
import { useTranslations } from 'next-intl';

interface LoginFormClientProps {
  callbackUrl?: string;
  showDevHint?: boolean;
}

export default function LoginFormClient({
  callbackUrl,
  showDevHint = false,
}: LoginFormClientProps) {
  const t = useTranslations('auth');
  const tErrors = useTranslations('errors');

  const [step, setStep] = useState<1 | 2>(1);
  const [rawPhone, setRawPhone] = useState('');
  const [normalizedPhone, setNormalizedPhone] = useState('');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [isPending, startTransition] = useTransition();

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // 30-second cooldown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const interval = setInterval(() => {
      setCountdown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [countdown]);

  // Focus first OTP box on entering step 2
  useEffect(() => {
    if (step === 2 && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [step]);

  // Step 1: Send OTP
  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const fullPhone = rawPhone.startsWith('+') ? rawPhone : `+91${rawPhone.replace(/\D/g, '')}`;
      const res = await sendOtpAction(fullPhone);

      if (!res.success) {
        setError(res.error || tErrors('generic'));
        if (res.retryAfterSec) {
          setCountdown(res.retryAfterSec);
        }
        return;
      }

      setNormalizedPhone(res.phone || fullPhone);
      setStep(2);
      setCountdown(30);
    });
  };

  // Step 2: Resend OTP
  const handleResendOtp = () => {
    if (countdown > 0) return;
    setError(null);

    startTransition(async () => {
      const res = await sendOtpAction(normalizedPhone);
      if (!res.success) {
        setError(res.error || tErrors('generic'));
        if (res.retryAfterSec) {
          setCountdown(res.retryAfterSec);
        }
        return;
      }
      setCountdown(30);
    });
  };

  // OTP Box Key Handling
  const handleDigitChange = (index: number, val: string) => {
    const digit = val.replace(/\D/g, '').slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = digit;
    setOtpDigits(newDigits);

    // Auto-advance to next box if digit entered
    if (digit && index < 5 && inputRefs.current[index + 1]) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const newDigits = [...otpDigits];
    for (let i = 0; i < 6; i++) {
      newDigits[i] = pasted[i] || '';
    }
    setOtpDigits(newDigits);

    const focusIndex = Math.min(pasted.length, 5);
    inputRefs.current[focusIndex]?.focus();
  };

  // Step 2: Verify OTP and Login
  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    const code = otpDigits.join('');
    if (code.length !== 6) {
      setError(t('enterFullOtp'));
      return;
    }

    setError(null);
    startTransition(async () => {
      const signInRes = await signIn('phone-otp', {
        phone: normalizedPhone,
        code,
        redirect: false,
      });

      if (!signInRes || signInRes.error) {
        setError(tErrors('OTP_INVALID'));
        return;
      }

      // Login succeeded: determine role-based destination
      const redirectUrl = await getPostLoginRedirect(callbackUrl);
      window.location.href = redirectUrl;
    });
  };

  return (
    <div className="space-y-6">
      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="p-3.5 bg-poleRed/15 border-2 border-poleRed text-poleRed font-body text-sm flex items-start gap-2 rounded-lg"
        >
          <span className="font-token font-bold text-base">⚠</span>
          <span>{error}</span>
        </div>
      )}

      {step === 1 ? (
        /* STEP 1: Phone Input */
        <form onSubmit={handleSendOtp} className="space-y-5">
          <div>
            <label
              htmlFor="phone-input"
              className="block font-label font-bold text-sm text-ink mb-1.5"
            >
              {t('phoneLabel')}
            </label>
            <div className="flex border-2 border-ink bg-paper shadow-[3px_3px_0px_#2B2118] rounded-lg overflow-hidden">
              <span className="font-token font-bold text-base px-3.5 py-3 bg-tile/30 border-r-2 border-ink text-ink select-none flex items-center">
                +91
              </span>
              <input
                id="phone-input"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={rawPhone}
                onChange={(e) => setRawPhone(e.target.value)}
                placeholder={t('phonePlaceholder')}
                required
                className="w-full px-4 py-3 bg-transparent text-ink font-token text-lg focus:outline-none"
              />
            </div>
            <p className="font-body text-xs text-steel mt-2">
              {t('noPasswordNeeded')}
            </p>
          </div>

          <button
            type="submit"
            disabled={isPending || !rawPhone.trim()}
            className="w-full min-h-[48px] bg-marigold text-ink font-label font-bold text-base uppercase tracking-normal py-3 border-2 border-ink shadow-[3px_3px_0px_#2B2118] active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed hover:bg-saffron transition-all rounded-lg"
          >
            {isPending ? t('sending') : `${t('sendOtpButton')} →`}
          </button>
        </form>
      ) : (
        /* STEP 2: 6-Digit OTP Boxes */
        <form onSubmit={handleVerifyOtp} className="space-y-6">
          <div className="bg-tile/20 border border-ink/30 p-3 flex items-center justify-between text-xs font-body rounded-lg">
            <div>
              <span className="text-steel block">
                {t('otpSentTo')}
              </span>
              <span className="font-token font-bold text-ink">{normalizedPhone}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setStep(1);
                setOtpDigits(['', '', '', '', '', '']);
                setError(null);
              }}
              className="font-label font-bold text-maroon hover:underline"
            >
              {t('changeNumber')}
            </button>
          </div>

          <div>
            <label className="block font-label font-bold text-sm text-ink mb-2">
              {t('otpLabel')}
            </label>
            <div className="flex gap-2 sm:gap-3 justify-between">
              {otpDigits.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => {
                    inputRefs.current[index] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  autoComplete={index === 0 ? 'one-time-code' : 'off'}
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={handlePaste}
                  className="w-11 sm:w-14 h-14 sm:h-16 text-center font-token text-2xl sm:text-3xl font-black bg-paper border-2 border-ink shadow-[2px_2px_0px_#2B2118] focus:border-marigold focus:bg-tile/10 focus:outline-none rounded-lg text-maroon"
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs font-body">
            {countdown > 0 ? (
              <span className="font-token text-steel">
                {t('resendCooldown', { seconds: countdown })}
              </span>
            ) : (
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={isPending}
                className="font-label font-bold text-maroon hover:underline"
              >
                {t('resendButton')}
              </button>
            )}

            <span className="font-token text-[11px] text-tealDeep">
              {t('validFor5Mins')}
            </span>
          </div>

          <button
            type="submit"
            disabled={isPending || otpDigits.join('').length !== 6}
            className="w-full min-h-[48px] bg-marigold text-ink font-label font-bold text-base uppercase tracking-normal py-3 border-2 border-ink shadow-[3px_3px_0px_#2B2118] active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed hover:bg-saffron transition-all rounded-lg"
          >
            {isPending ? t('verifying') : `${t('verifyButton')} →`}
          </button>
        </form>
      )}

      {/* Dev test accounts hint */}
      {showDevHint && (
        <div className="border-t border-ink/20 pt-4 text-center">
          <p className="font-token text-xs text-steel">
            💡 {t('devHint')}
          </p>
        </div>
      )}
    </div>
  );
}
