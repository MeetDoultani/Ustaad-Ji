'use client';

import React, { useActionState } from 'react';
import { updateProfileName } from './actions';

interface AccountFormClientProps {
  initialName?: string | null;
}

export default function AccountFormClient({ initialName }: AccountFormClientProps) {
  const [state, formAction, isPending] = useActionState(updateProfileName, null);

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && (
        <div
          role="alert"
          aria-live="polite"
          className="p-3 bg-poleRed/15 border-2 border-poleRed text-poleRed font-body text-sm"
        >
          {state.error}
        </div>
      )}

      {state?.success && (
        <div
          role="status"
          aria-live="polite"
          className="p-3 bg-tile/40 border-2 border-tealDeep text-tealDeep font-body text-sm"
        >
          Aapka naam safaltapoorvak update ho gaya! (Name updated successfully)
        </div>
      )}

      <div>
        <label htmlFor="name-input" className="block font-label font-bold text-sm text-ink mb-1">
          Aapka Naam / Your Name:
        </label>
        <input
          id="name-input"
          name="name"
          type="text"
          maxLength={80}
          defaultValue={initialName || ''}
          placeholder="e.g. Ramesh Kumar"
          required
          className="w-full min-h-[44px] px-4 py-2 bg-paper border-2 border-ink text-ink font-body focus:border-marigold focus:outline-none"
        />
        <span className="text-xs text-steel mt-1 block">Maximum 80 characters.</span>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="min-h-[44px] bg-marigold text-ink font-label font-bold px-6 py-2.5 border-2 border-ink shadow-[3px_3px_0px_#2B2118] active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed hover:bg-saffron transition-all"
      >
        {isPending ? 'Saving / सहेज रहे हैं...' : 'Save Name / नाम सहेजें'}
      </button>
    </form>
  );
}
