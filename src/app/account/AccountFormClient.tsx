'use client';

import React, { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { updateProfileName } from './actions';
import { Locale } from '@/i18n/config';

interface AccountFormClientProps {
  initialName?: string | null;
  initialLanguage?: string | null;
}

export default function AccountFormClient({
  initialName,
  initialLanguage,
}: AccountFormClientProps) {
  const t = useTranslations('account');
  const tCommon = useTranslations('common');
  const activeLocale = useLocale();
  const router = useRouter();

  const [selectedLanguage, setSelectedLanguage] = useState<Locale>(
    (initialLanguage === 'hi' || initialLanguage === 'en')
      ? initialLanguage
      : (activeLocale === 'hi' ? 'hi' : 'en')
  );

  const [state, formAction, isPending] = useActionState(async (prev: { success?: boolean; error?: string } | null, formData: FormData) => {
    formData.set('language', selectedLanguage);
    const result = await updateProfileName(prev, formData);
    if (result.success) {
      router.refresh();
    }
    return result;
  }, null);

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <div
          role="alert"
          aria-live="polite"
          className="p-3 bg-poleRed/15 border-2 border-poleRed text-poleRed font-body text-sm rounded-lg"
        >
          {state.error}
        </div>
      )}

      {state?.success && (
        <div
          role="status"
          aria-live="polite"
          className="p-3 bg-tile/40 border-2 border-tealDeep text-tealDeep font-body text-sm rounded-lg"
        >
          {t('savedSuccess')}
        </div>
      )}

      {/* Name Field */}
      <div>
        <label htmlFor="name-input" className="block font-label font-bold text-sm text-ink mb-1">
          {t('nameLabel')}:
        </label>
        <input
          id="name-input"
          name="name"
          type="text"
          maxLength={80}
          defaultValue={initialName || ''}
          placeholder={t('namePlaceholder')}
          required
          className="w-full min-h-[44px] px-4 py-2 bg-paper border-2 border-ink text-ink font-body focus:border-marigold focus:outline-none rounded-lg"
        />
        <span className="text-xs text-steel mt-1 block">{t('max80Chars')}</span>
      </div>

      {/* Language Preference Control */}
      <div className="border-t-2 border-ink/10 pt-4">
        <label className="block font-label font-bold text-sm text-ink mb-1">
          {t('languageSection')}:
        </label>
        <p className="text-xs text-steel mb-3">{t('languageHelp')}</p>

        <div className="grid grid-cols-2 gap-3 max-w-sm">
          <button
            type="button"
            onClick={() => setSelectedLanguage('en')}
            className={`min-h-[48px] px-4 py-2 rounded-xl font-sign text-base border-2 transition-all flex items-center justify-center gap-2 ${
              selectedLanguage === 'en'
                ? 'bg-tile text-tealDeep border-tealDeep shadow-md font-bold'
                : 'bg-paper text-ink/70 border-ink/30 hover:border-ink'
            }`}
          >
            <span>{tCommon('english')}</span>
            {selectedLanguage === 'en' && <span>✓</span>}
          </button>

          <button
            type="button"
            onClick={() => setSelectedLanguage('hi')}
            className={`min-h-[48px] px-4 py-2 rounded-xl font-sign text-base border-2 transition-all flex items-center justify-center gap-2 ${
              selectedLanguage === 'hi'
                ? 'bg-marigold text-ink border-maroon shadow-md font-bold'
                : 'bg-paper text-ink/70 border-ink/30 hover:border-ink'
            }`}
          >
            <span>{tCommon('hindi')}</span>
            {selectedLanguage === 'hi' && <span>✓</span>}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="min-h-[44px] bg-marigold text-ink font-label font-bold px-6 py-2.5 border-2 border-ink shadow-[3px_3px_0px_#2B2118] active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed hover:bg-saffron transition-all rounded-lg"
      >
        {isPending ? t('saving') : t('saveButton')}
      </button>
    </form>
  );
}
