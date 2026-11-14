'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { clsx } from 'clsx';
import {
  SalonBarberStaffItem,
  BlockingBookingItem,
} from '@/lib/staff-roster-service';
import {
  addBarberAction,
  removeBarberAction,
  reactivateBarberAction,
} from '../actions';

interface BarbersClientProps {
  salonId: string;
  initialBarbers: SalonBarberStaffItem[];
}

export default function BarbersClient({
  salonId,
  initialBarbers,
}: BarbersClientProps) {
  const t = useTranslations('dashboard');
  const tErr = useTranslations('errors');

  const [barbers, setBarbers] = useState<SalonBarberStaffItem[]>(initialBarbers);
  const [isAdding, setIsAdding] = useState(false);
  const [addName, setAddName] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addExp, setAddExp] = useState(0);
  const [addBio, setAddBio] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Blocking bookings state when removal fails
  const [blockingBookings, setBlockingBookings] = useState<BlockingBookingItem[] | null>(null);
  const [blockingBarberId, setBlockingBarberId] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const res = await addBarberAction({
        salonId,
        displayName: addName,
        phone: addPhone,
        experienceYears: Number(addExp) || 0,
        bio: addBio || null,
      });

      if (!res.ok) {
        const msg = res.code && tErr.has(res.code) ? tErr(res.code) : (res.error || tErr('generic'));
        setErrorMessage(msg);
        return;
      }

      if (res.data) {
        const newBarber: SalonBarberStaffItem = {
          id: res.data.id,
          userId: '',
          displayName: res.data.displayName,
          phone: addPhone,
          bio: addBio || null,
          photoUrl: null,
          experienceYears: Number(addExp) || 0,
          status: 'PENDING',
          isActive: true,
          servicesCount: 0,
        };
        setBarbers((prev) => [...prev, newBarber]);
        setIsAdding(false);
        setAddName('');
        setAddPhone('');
        setAddExp(0);
        setAddBio('');
      }
    } catch {
      setErrorMessage(tErr('generic'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async (barberId: string) => {
    setErrorMessage(null);
    setBlockingBookings(null);
    setBlockingBarberId(null);
    setActionLoadingId(barberId);

    try {
      const res = await removeBarberAction({ salonId, barberId });
      if (!res.ok) {
        if (res.code === 'BARBER_HAS_BOOKINGS' && res.data && 'blockingBookings' in res.data) {
          const typedData = res.data as { blockingBookings?: BlockingBookingItem[] };
          setBlockingBookings(typedData.blockingBookings || []);
          setBlockingBarberId(barberId);
          setErrorMessage(t('barberHasBookingsTitle'));
        } else {
          const msg = res.code && tErr.has(res.code) ? tErr(res.code) : (res.error || tErr('generic'));
          setErrorMessage(msg);
        }
        return;
      }

      setBarbers((prev) =>
        prev.map((b) => (b.id === barberId ? { ...b, isActive: false } : b))
      );
    } catch {
      setErrorMessage(tErr('generic'));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReactivate = async (barberId: string) => {
    setErrorMessage(null);
    setActionLoadingId(barberId);

    try {
      const res = await reactivateBarberAction({ salonId, barberId });
      if (!res.ok) {
        const msg = res.code && tErr.has(res.code) ? tErr(res.code) : (res.error || tErr('generic'));
        setErrorMessage(msg);
        return;
      }

      setBarbers((prev) =>
        prev.map((b) => (b.id === barberId ? { ...b, isActive: true } : b))
      );
    } catch {
      setErrorMessage(tErr('generic'));
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="bg-paper border-2 border-charcoal/20 shadow-[4px_4px_0px_#2B2118] rounded-2xl p-4 sm:p-6 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-sign text-2xl sm:text-3xl text-maroon font-bold">
              {t('barbersTitle')}
            </h1>
            <p className="font-body text-sm sm:text-base text-steel">
              {t('barbersSubtitle')}
            </p>
          </div>

          {!isAdding && barbers.length < 20 && (
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className="min-h-[48px] px-5 py-2.5 bg-maroon text-chalk border-2 border-marigold font-token text-sm font-bold rounded-xl shadow-[3px_3px_0px_#2B2118] hover:bg-maroon/90 transition-colors focus:ring-2 focus:ring-offset-1 focus:ring-maroon self-start sm:self-auto"
            >
              {t('addBarber')}
            </button>
          )}
        </div>

        {barbers.length >= 20 && (
          <div className="p-3 bg-amber-50 border border-amber-300 text-amber-900 rounded-lg text-xs sm:text-sm font-medium">
            {t('barberCapNotice')}
          </div>
        )}
      </div>

      {/* Global Error Notice */}
      {errorMessage && (
        <div
          role="alert"
          className="p-4 bg-red-50 border-2 border-red-300 rounded-xl text-red-900 text-sm font-medium shadow-[2px_2px_0px_#DC2626] space-y-2"
        >
          <div>{errorMessage}</div>
          {blockingBookings && blockingBookings.length > 0 && (
            <div className="mt-3 pt-3 border-t border-red-200 space-y-2">
              <p className="text-xs text-red-800">
                {t('barberHasBookingsDesc', { count: blockingBookings.length })}
              </p>
              <ul className="space-y-1.5 text-xs">
                {blockingBookings.map((bk) => (
                  <li
                    key={bk.id}
                    className="flex items-center justify-between bg-white/80 p-2 rounded border border-red-200"
                  >
                    <span>
                      #{bk.token} • {bk.customerLabel}
                    </span>
                    <Link
                      href={`/dashboard/bookings/${bk.id}`}
                      className="text-maroon font-bold underline hover:text-maroon/80"
                    >
                      {t('viewBooking')}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Inline Add Barber Form */}
      {isAdding && (
        <form
          onSubmit={handleAddSubmit}
          className="bg-paper border-2 border-marigold shadow-[4px_4px_0px_#2B2118] rounded-2xl p-5 sm:p-6 space-y-4"
        >
          <h2 className="font-sign text-xl text-maroon font-bold">
            {t('addBarber')}
          </h2>

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
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                className="w-full min-h-[48px] px-3.5 py-2 rounded-xl bg-chalk border-2 border-charcoal/20 text-ink focus:border-maroon focus:outline-none text-sm"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="phone" className="block text-xs font-token text-ink font-semibold">
                {t('barberPhone')}
              </label>
              <input
                id="phone"
                type="tel"
                required
                placeholder={t('phonePlaceholder')}
                value={addPhone}
                onChange={(e) => setAddPhone(e.target.value)}
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
                value={addExp}
                onChange={(e) => setAddExp(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-full min-h-[48px] px-3.5 py-2 rounded-xl bg-chalk border-2 border-charcoal/20 text-ink focus:border-maroon focus:outline-none text-sm"
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label htmlFor="bio" className="block text-xs font-token text-ink font-semibold">
                {t('barberBio')}
              </label>
              <textarea
                id="bio"
                rows={2}
                maxLength={300}
                placeholder={t('barberBioPlaceholder')}
                value={addBio}
                onChange={(e) => setAddBio(e.target.value)}
                className="w-full p-3 rounded-xl bg-chalk border-2 border-charcoal/20 text-ink focus:border-maroon focus:outline-none text-sm"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setErrorMessage(null);
              }}
              className="min-h-[48px] px-4 py-2 border-2 border-charcoal/20 rounded-xl text-xs sm:text-sm font-token font-medium hover:bg-charcoal/5"
            >
              {t('backToRegister')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="min-h-[48px] px-6 py-2 bg-maroon text-chalk border-2 border-marigold rounded-xl text-xs sm:text-sm font-token font-bold shadow-[2px_2px_0px_#2B2118] hover:bg-maroon/90 disabled:opacity-50"
            >
              {isSubmitting ? t('savingBarber') : t('saveBarber')}
            </button>
          </div>
        </form>
      )}

      {/* Roster Grid / Cards */}
      {barbers.length === 0 ? (
        <div className="bg-paper border-2 border-charcoal/15 rounded-2xl p-8 text-center text-steel font-body">
          {t('noBarbers')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {barbers.map((barber) => {
            const isLoading = actionLoadingId === barber.id;
            const hasConflict = blockingBarberId === barber.id;

            return (
              <div
                key={barber.id}
                className={clsx(
                  'bg-paper border-2 rounded-2xl p-4 sm:p-5 shadow-[4px_4px_0px_#2B2118] flex flex-col justify-between transition-shadow',
                  barber.isActive
                    ? 'border-charcoal/20'
                    : 'border-charcoal/10 bg-paper/60 opacity-80',
                  hasConflict && 'border-red-400 bg-red-50/20'
                )}
              >
                <div className="space-y-3">
                  {/* Card Header: Avatar & Info */}
                  <div className="flex items-start gap-3.5">
                    <div className="w-14 h-14 rounded-xl border-2 border-charcoal/20 bg-charcoal/5 flex items-center justify-center overflow-hidden shrink-0 shadow-[2px_2px_0px_#2B2118]">
                      {barber.photoUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={barber.photoUrl}
                          alt={barber.displayName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="font-token text-xl font-bold text-maroon">
                          {barber.displayName.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-sign text-lg font-bold text-ink truncate">
                          {barber.displayName}
                        </h3>
                        {/* Status Badge */}
                        {barber.status === 'PENDING' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-token font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            {t('awaitingAdminApproval')}
                          </span>
                        ) : barber.isActive ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-token font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                            {t('barberActive')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-token font-bold bg-gray-100 text-gray-700 border border-gray-300">
                            {t('barberInactive')}
                          </span>
                        )}
                      </div>

                      <p className="font-token text-xs text-steel mt-0.5">
                        {t('experienceYearsUnit', { years: barber.experienceYears })}
                      </p>
                    </div>
                  </div>

                  {barber.bio && (
                    <p className="font-body text-xs sm:text-sm text-steel line-clamp-2">
                      {barber.bio}
                    </p>
                  )}
                </div>

                {/* Card Actions */}
                <div className="mt-4 pt-3 border-t border-charcoal/10 flex items-center justify-between gap-2">
                  <Link
                    href={`/dashboard/barbers/${barber.id}`}
                    className="min-h-[48px] px-3 py-2 text-xs font-token font-bold text-maroon hover:text-maroon/80 flex items-center"
                  >
                    {t('editBarber')}
                  </Link>

                  {barber.isActive ? (
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleRemove(barber.id)}
                      className="min-h-[48px] px-3.5 py-2 text-xs font-token font-bold text-red-700 border-2 border-red-300 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      {t('removeBarber')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleReactivate(barber.id)}
                      className="min-h-[48px] px-3.5 py-2 text-xs font-token font-bold text-emerald-800 border-2 border-emerald-400 rounded-xl hover:bg-emerald-50 transition-colors disabled:opacity-50"
                    >
                      {t('reactivateBarber')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
