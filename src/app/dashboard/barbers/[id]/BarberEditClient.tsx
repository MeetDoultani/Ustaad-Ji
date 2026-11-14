'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { BarberProfileStaffItem, validatePhotoUrl } from '@/lib/staff-roster-service';
import { updateBarberProfileAction } from '../../actions';

interface BarberEditClientProps {
  barber: BarberProfileStaffItem;
}

export default function BarberEditClient({ barber }: BarberEditClientProps) {
  const t = useTranslations('dashboard');
  const tErr = useTranslations('errors');

  const [displayName, setDisplayName] = useState(barber.displayName);
  const [experienceYears, setExperienceYears] = useState(barber.experienceYears);
  const [bio, setBio] = useState(barber.bio || '');
  const [photoUrl, setPhotoUrl] = useState(barber.photoUrl || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    // Validate photoUrl
    const photoCheck = validatePhotoUrl(photoUrl);
    if (!photoCheck.isValid) {
      setErrorMessage(photoCheck.error || tErr('INVALID_PHOTO_URL'));
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await updateBarberProfileAction({
        barberId: barber.id,
        displayName,
        experienceYears: Number(experienceYears) || 0,
        bio: bio || null,
        photoUrl: photoCheck.value,
      });

      if (!res.ok) {
        const msg = res.code && tErr.has(res.code) ? tErr(res.code) : (res.error || tErr('generic'));
        setErrorMessage(msg);
        return;
      }

      setSuccessMessage(t('profileSaved'));
    } catch {
      setErrorMessage(tErr('generic'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard/barbers"
          className="inline-flex items-center min-h-[48px] px-3 py-2 text-sm font-token font-bold text-maroon hover:text-maroon/80"
        >
          {t('backToBarbers')}
        </Link>
      </div>

      <div className="bg-paper border-2 border-charcoal/20 shadow-[4px_4px_0px_#2B2118] rounded-2xl p-5 sm:p-7 space-y-6">
        <div>
          <h1 className="font-sign text-2xl sm:text-3xl text-maroon font-bold">
            {t('barberProfileTitle')}
          </h1>
          <p className="font-body text-sm sm:text-base text-steel mt-1">
            {t('barberProfileSubtitle')}
          </p>
        </div>

        {errorMessage && (
          <div role="alert" className="p-4 bg-red-50 border-2 border-red-300 rounded-xl text-red-900 text-sm font-medium">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div role="status" className="p-4 bg-emerald-50 border-2 border-emerald-300 rounded-xl text-emerald-900 text-sm font-medium">
            {successMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Photo Preview and URL Input */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-charcoal/5 rounded-xl border border-charcoal/10">
            <div className="w-16 h-16 rounded-xl border-2 border-charcoal/20 bg-paper flex items-center justify-center overflow-hidden shrink-0 shadow-[2px_2px_0px_#2B2118]">
              {photoUrl.trim() && photoUrl.startsWith('https://') ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={photoUrl.trim()}
                  alt={displayName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="font-token text-2xl font-bold text-maroon">
                  {displayName.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>

            <div className="flex-1 space-y-1">
              <label htmlFor="photoUrl" className="block text-xs font-token text-ink font-semibold">
                {t('barberPhoto')}
              </label>
              <input
                id="photoUrl"
                type="url"
                maxLength={300}
                placeholder={t('barberPhotoPlaceholder')}
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                className="w-full min-h-[48px] px-3.5 py-2 rounded-xl bg-chalk border-2 border-charcoal/20 text-ink focus:border-maroon focus:outline-none text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="displayName" className="block text-xs font-token text-ink font-semibold">
                {t('barberDisplayName')}
              </label>
              <input
                id="displayName"
                type="text"
                required
                minLength={2}
                maxLength={40}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full min-h-[48px] px-3.5 py-2 rounded-xl bg-chalk border-2 border-charcoal/20 text-ink focus:border-maroon focus:outline-none text-sm"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="experienceYears" className="block text-xs font-token text-ink font-semibold">
                {t('experienceYears')}
              </label>
              <input
                id="experienceYears"
                type="number"
                min={0}
                max={60}
                value={experienceYears}
                onChange={(e) => setExperienceYears(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-full min-h-[48px] px-3.5 py-2 rounded-xl bg-chalk border-2 border-charcoal/20 text-ink focus:border-maroon focus:outline-none text-sm"
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label htmlFor="bio" className="block text-xs font-token text-ink font-semibold">
                {t('barberBio')}
              </label>
              <textarea
                id="bio"
                rows={3}
                maxLength={300}
                placeholder={t('barberBioPlaceholder')}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full p-3 rounded-xl bg-chalk border-2 border-charcoal/20 text-ink focus:border-maroon focus:outline-none text-sm"
              />
            </div>
          </div>

          <div className="flex items-center justify-end pt-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="min-h-[48px] px-6 py-2.5 bg-maroon text-chalk border-2 border-marigold rounded-xl text-sm font-token font-bold shadow-[2px_2px_0px_#2B2118] hover:bg-maroon/90 disabled:opacity-50"
            >
              {isSubmitting ? t('savingProfile') : t('saveProfile')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
