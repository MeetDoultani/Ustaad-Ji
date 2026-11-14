'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  BarberProfileStaffItem,
  SalonProfileStaffItem,
  validatePhotoUrl,
} from '@/lib/staff-roster-service';
import {
  updateBarberProfileAction,
  updateSalonProfileAction,
} from '../actions';

interface ProfileClientProps {
  role: 'OWNER' | 'BARBER';
  barberProfile?: BarberProfileStaffItem;
  salonProfile?: SalonProfileStaffItem;
}

export default function ProfileClient({
  role,
  barberProfile,
  salonProfile,
}: ProfileClientProps) {
  const t = useTranslations('dashboard');
  const tErr = useTranslations('errors');

  // Barber state
  const [bName, setBName] = useState(barberProfile?.displayName || '');
  const [bExp, setBExp] = useState(barberProfile?.experienceYears || 0);
  const [bBio, setBBio] = useState(barberProfile?.bio || '');
  const [bPhoto, setBPhoto] = useState(barberProfile?.photoUrl || '');

  // Owner salon state
  const [sName, setSName] = useState(salonProfile?.name || '');
  const [sNameHi, setSNameHi] = useState(salonProfile?.nameHi || '');
  const [sDesc, setSDesc] = useState(salonProfile?.description || '');
  const [sPhone, setSPhone] = useState(salonProfile?.phone || '');
  const [sAddress, setSAddress] = useState(salonProfile?.addressLine || '');
  const [sArea, setSArea] = useState(salonProfile?.area || '');
  const [sCity, setSCity] = useState(salonProfile?.city || '');
  const [sPincode, setSPincode] = useState(salonProfile?.pincode || '');
  const [sRequiresApproval, setSRequiresApproval] = useState(
    salonProfile?.requiresApproval || false
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleBarberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barberProfile) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    const photoCheck = validatePhotoUrl(bPhoto);
    if (!photoCheck.isValid) {
      setErrorMessage(photoCheck.error || tErr('INVALID_PHOTO_URL'));
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await updateBarberProfileAction({
        barberId: barberProfile.id,
        displayName: bName,
        experienceYears: Number(bExp) || 0,
        bio: bBio || null,
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

  const handleOwnerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!salonProfile) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    setIsSubmitting(true);
    try {
      const res = await updateSalonProfileAction({
        salonId: salonProfile.id,
        name: sName,
        nameHi: sNameHi || null,
        description: sDesc || null,
        phone: sPhone || null,
        addressLine: sAddress,
        area: sArea,
        city: sCity,
        pincode: sPincode,
        requiresApproval: sRequiresApproval,
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
      <div className="bg-paper border-2 border-charcoal/20 shadow-[4px_4px_0px_#2B2118] rounded-2xl p-5 sm:p-7 space-y-6">
        <div>
          <h1 className="font-sign text-2xl sm:text-3xl text-maroon font-bold">
            {role === 'OWNER' ? t('salonProfileTitle') : t('barberProfileTitle')}
          </h1>
          <p className="font-body text-sm sm:text-base text-steel mt-1">
            {role === 'OWNER' ? t('salonProfileSubtitle') : t('barberProfileSubtitle')}
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

        {role === 'BARBER' && barberProfile && (
          <form onSubmit={handleBarberSubmit} className="space-y-5">
            {/* Photo Preview and URL Input */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-charcoal/5 rounded-xl border border-charcoal/10">
              <div className="w-16 h-16 rounded-xl border-2 border-charcoal/20 bg-paper flex items-center justify-center overflow-hidden shrink-0 shadow-[2px_2px_0px_#2B2118]">
                {bPhoto.trim() && bPhoto.startsWith('https://') ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={bPhoto.trim()}
                    alt={bName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="font-token text-2xl font-bold text-maroon">
                    {bName.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>

              <div className="flex-1 space-y-1">
                <label htmlFor="bPhotoUrl" className="block text-xs font-token text-ink font-semibold">
                  {t('barberPhoto')}
                </label>
                <input
                  id="bPhotoUrl"
                  type="url"
                  maxLength={300}
                  placeholder={t('barberPhotoPlaceholder')}
                  value={bPhoto}
                  onChange={(e) => setBPhoto(e.target.value)}
                  className="w-full min-h-[48px] px-3.5 py-2 rounded-xl bg-chalk border-2 border-charcoal/20 text-ink focus:border-maroon focus:outline-none text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="bDisplayName" className="block text-xs font-token text-ink font-semibold">
                  {t('barberDisplayName')}
                </label>
                <input
                  id="bDisplayName"
                  type="text"
                  required
                  minLength={2}
                  maxLength={40}
                  value={bName}
                  onChange={(e) => setBName(e.target.value)}
                  className="w-full min-h-[48px] px-3.5 py-2 rounded-xl bg-chalk border-2 border-charcoal/20 text-ink focus:border-maroon focus:outline-none text-sm"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="bExperienceYears" className="block text-xs font-token text-ink font-semibold">
                  {t('experienceYears')}
                </label>
                <input
                  id="bExperienceYears"
                  type="number"
                  min={0}
                  max={60}
                  value={bExp}
                  onChange={(e) => setBExp(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-full min-h-[48px] px-3.5 py-2 rounded-xl bg-chalk border-2 border-charcoal/20 text-ink focus:border-maroon focus:outline-none text-sm"
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label htmlFor="bBio" className="block text-xs font-token text-ink font-semibold">
                  {t('barberBio')}
                </label>
                <textarea
                  id="bBio"
                  rows={3}
                  maxLength={300}
                  placeholder={t('barberBioPlaceholder')}
                  value={bBio}
                  onChange={(e) => setBBio(e.target.value)}
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
        )}

        {role === 'OWNER' && salonProfile && (
          <form onSubmit={handleOwnerSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="sName" className="block text-xs font-token text-ink font-semibold">
                  {t('salonName')}
                </label>
                <input
                  id="sName"
                  type="text"
                  required
                  minLength={2}
                  maxLength={60}
                  value={sName}
                  onChange={(e) => setSName(e.target.value)}
                  className="w-full min-h-[48px] px-3.5 py-2 rounded-xl bg-chalk border-2 border-charcoal/20 text-ink focus:border-maroon focus:outline-none text-sm"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="sNameHi" className="block text-xs font-token text-ink font-semibold">
                  {t('salonNameHi')}
                </label>
                <input
                  id="sNameHi"
                  type="text"
                  maxLength={100}
                  value={sNameHi}
                  onChange={(e) => setSNameHi(e.target.value)}
                  className="w-full min-h-[48px] px-3.5 py-2 rounded-xl bg-chalk border-2 border-charcoal/20 text-ink focus:border-maroon focus:outline-none text-sm"
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label htmlFor="sDescription" className="block text-xs font-token text-ink font-semibold">
                  {t('salonDescription')}
                </label>
                <textarea
                  id="sDescription"
                  rows={2}
                  maxLength={500}
                  value={sDesc}
                  onChange={(e) => setSDesc(e.target.value)}
                  className="w-full p-3 rounded-xl bg-chalk border-2 border-charcoal/20 text-ink focus:border-maroon focus:outline-none text-sm"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="sPhone" className="block text-xs font-token text-ink font-semibold">
                  {t('salonPhone')}
                </label>
                <input
                  id="sPhone"
                  type="tel"
                  placeholder={t('phonePlaceholder')}
                  value={sPhone}
                  onChange={(e) => setSPhone(e.target.value)}
                  className="w-full min-h-[48px] px-3.5 py-2 rounded-xl bg-chalk border-2 border-charcoal/20 text-ink focus:border-maroon focus:outline-none text-sm"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="sAddress" className="block text-xs font-token text-ink font-semibold">
                  {t('salonAddressLine')}
                </label>
                <input
                  id="sAddress"
                  type="text"
                  required
                  minLength={5}
                  maxLength={120}
                  value={sAddress}
                  onChange={(e) => setSAddress(e.target.value)}
                  className="w-full min-h-[48px] px-3.5 py-2 rounded-xl bg-chalk border-2 border-charcoal/20 text-ink focus:border-maroon focus:outline-none text-sm"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="sArea" className="block text-xs font-token text-ink font-semibold">
                  {t('salonArea')}
                </label>
                <input
                  id="sArea"
                  type="text"
                  required
                  minLength={2}
                  maxLength={60}
                  value={sArea}
                  onChange={(e) => setSArea(e.target.value)}
                  className="w-full min-h-[48px] px-3.5 py-2 rounded-xl bg-chalk border-2 border-charcoal/20 text-ink focus:border-maroon focus:outline-none text-sm"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="sCity" className="block text-xs font-token text-ink font-semibold">
                  {t('salonCity')}
                </label>
                <input
                  id="sCity"
                  type="text"
                  required
                  minLength={2}
                  maxLength={60}
                  value={sCity}
                  onChange={(e) => setSCity(e.target.value)}
                  className="w-full min-h-[48px] px-3.5 py-2 rounded-xl bg-chalk border-2 border-charcoal/20 text-ink focus:border-maroon focus:outline-none text-sm"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="sPincode" className="block text-xs font-token text-ink font-semibold">
                  {t('salonPincode')}
                </label>
                <input
                  id="sPincode"
                  type="text"
                  required
                  pattern="^\d{6}$"
                  maxLength={6}
                  value={sPincode}
                  onChange={(e) => setSPincode(e.target.value)}
                  className="w-full min-h-[48px] px-3.5 py-2 rounded-xl bg-chalk border-2 border-charcoal/20 text-ink focus:border-maroon focus:outline-none text-sm"
                />
              </div>
            </div>

            {/* Requires Approval Toggle */}
            <div className="p-4 bg-charcoal/5 rounded-xl border border-charcoal/10 flex items-start gap-3">
              <input
                id="sRequiresApproval"
                type="checkbox"
                checked={sRequiresApproval}
                onChange={(e) => setSRequiresApproval(e.target.checked)}
                className="mt-1 h-5 w-5 rounded border-charcoal/20 text-maroon focus:ring-maroon"
              />
              <div className="space-y-0.5">
                <label htmlFor="sRequiresApproval" className="block text-sm font-token font-bold text-ink cursor-pointer">
                  {t('salonRequiresApproval')}
                </label>
                <p className="text-xs text-steel">
                  {t('salonRequiresApprovalDesc')}
                </p>
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
        )}
      </div>
    </div>
  );
}
