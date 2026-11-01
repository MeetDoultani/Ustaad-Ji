'use client';

import React, { useState, useTransition } from 'react';
import { Salon, Barber, VerificationStatus } from '@prisma/client';
import { updateSalonStatus, updateBarberStatus } from './actions';
import { clsx } from 'clsx';

interface AdminClientProps {
  initialSalons: (Salon & { owner: { name: string | null; phone: string } })[];
  initialBarbers: (Barber & {
    salon: { name: string };
    user: { name: string | null; phone: string };
  })[];
}

export default function AdminClient({ initialSalons, initialBarbers }: AdminClientProps) {
  const [activeTab, setActiveTab] = useState<'pending' | 'all'>('pending');
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const handleSalonAction = (salonId: string, name: string, status: VerificationStatus) => {
    if (status === VerificationStatus.REJECTED || status === VerificationStatus.SUSPENDED) {
      const confirmed = window.confirm(
        `Are you sure you want to mark salon "${name}" as ${status}?`
      );
      if (!confirmed) return;
    }

    setActionError(null);
    startTransition(async () => {
      const res = await updateSalonStatus(salonId, status);
      if (!res.success) {
        setActionError(res.error || 'Failed to update salon');
      }
    });
  };

  const handleBarberAction = (barberId: string, name: string, status: VerificationStatus) => {
    if (status === VerificationStatus.REJECTED || status === VerificationStatus.SUSPENDED) {
      const confirmed = window.confirm(
        `Are you sure you want to mark barber "${name}" as ${status}?`
      );
      if (!confirmed) return;
    }

    setActionError(null);
    startTransition(async () => {
      const res = await updateBarberStatus(barberId, status);
      if (!res.success) {
        setActionError(res.error || 'Failed to update barber');
      }
    });
  };

  const filteredSalons =
    activeTab === 'pending'
      ? initialSalons.filter((s) => s.status === VerificationStatus.PENDING)
      : initialSalons;

  const filteredBarbers =
    activeTab === 'pending'
      ? initialBarbers.filter((b) => b.status === VerificationStatus.PENDING)
      : initialBarbers;

  return (
    <div className="space-y-8">
      {actionError && (
        <div
          role="alert"
          aria-live="polite"
          className="p-3 bg-poleRed/15 border-2 border-poleRed text-poleRed font-body text-sm"
        >
          {actionError}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b-2 border-ink/40 gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('pending')}
          className={clsx(
            'min-h-[44px] px-5 py-2 font-label font-bold text-sm border-t-2 border-x-2 transition-all',
            activeTab === 'pending'
              ? 'bg-paper text-maroon border-maroon -mb-[2px] z-10'
              : 'bg-steel/15 text-steel border-steel/40 hover:text-ink'
          )}
        >
          Pending Verifications / विचाराधीन ({initialSalons.filter((s) => s.status === VerificationStatus.PENDING).length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={clsx(
            'min-h-[44px] px-5 py-2 font-label font-bold text-sm border-t-2 border-x-2 transition-all',
            activeTab === 'all'
              ? 'bg-paper text-maroon border-maroon -mb-[2px] z-10'
              : 'bg-steel/15 text-steel border-steel/40 hover:text-ink'
          )}
        >
          All Records / सभी रिकॉर्ड ({initialSalons.length})
        </button>
      </div>

      {/* 1. Salons Table */}
      <div className="border-4 border-maroon bg-paper p-4 sm:p-6 shadow-[5px_5px_0px_#7A1F2B] space-y-4">
        <div className="flex items-center justify-between border-b border-ink/20 pb-2">
          <h2 className="font-sign text-xl sm:text-2xl text-maroon">
            Salons Management / सैलून सत्यापन
          </h2>
          <span className="font-token text-xs text-steel">
            Count: {filteredSalons.length}
          </span>
        </div>

        {filteredSalons.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-body text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-ink bg-tile/20 font-label font-bold text-xs uppercase text-ink">
                  <th className="p-2 sm:p-3">Salon Name</th>
                  <th className="p-2 sm:p-3">Area / City</th>
                  <th className="p-2 sm:p-3">Owner Contact</th>
                  <th className="p-2 sm:p-3">Status</th>
                  <th className="p-2 sm:p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/20">
                {filteredSalons.map((salon) => (
                  <tr key={salon.id} className="hover:bg-tile/10">
                    <td className="p-2 sm:p-3">
                      <div className="font-bold text-ink">{salon.name}</div>
                      {salon.nameHi && (
                        <div className="text-xs text-steel">({salon.nameHi})</div>
                      )}
                      <div className="font-token text-xs text-steel">
                        slug: /{salon.slug}
                      </div>
                    </td>
                    <td className="p-2 sm:p-3">
                      {salon.area}, {salon.city}
                    </td>
                    <td className="p-2 sm:p-3">
                      <div>{salon.owner.name || 'Owner'}</div>
                      <div className="font-token text-xs text-steel">
                        {salon.owner.phone}
                      </div>
                    </td>
                    <td className="p-2 sm:p-3">
                      <span
                        className={clsx(
                          'font-token text-xs font-bold px-2 py-0.5 border',
                          salon.status === VerificationStatus.VERIFIED &&
                            'bg-tile text-tealDeep border-tealDeep',
                          salon.status === VerificationStatus.PENDING &&
                            'bg-marigold text-ink border-ink',
                          salon.status === VerificationStatus.REJECTED &&
                            'bg-paper text-poleRed border-poleRed',
                          salon.status === VerificationStatus.SUSPENDED &&
                            'bg-ink text-chalk border-ink'
                        )}
                      >
                        {salon.status}
                      </span>
                    </td>
                    <td className="p-2 sm:p-3 text-right">
                      <div className="flex flex-wrap gap-1 justify-end">
                        {salon.status !== VerificationStatus.VERIFIED && (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() =>
                              handleSalonAction(
                                salon.id,
                                salon.name,
                                VerificationStatus.VERIFIED
                              )
                            }
                            className="bg-tile border border-tealDeep text-tealDeep px-2 py-1 font-label font-bold text-xs hover:bg-tile/80"
                          >
                            Approve
                          </button>
                        )}
                        {salon.status !== VerificationStatus.REJECTED && (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() =>
                              handleSalonAction(
                                salon.id,
                                salon.name,
                                VerificationStatus.REJECTED
                              )
                            }
                            className="bg-paper border border-poleRed text-poleRed px-2 py-1 font-label font-bold text-xs hover:bg-poleRed hover:text-chalk"
                          >
                            Reject
                          </button>
                        )}
                        {salon.status !== VerificationStatus.SUSPENDED && (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() =>
                              handleSalonAction(
                                salon.id,
                                salon.name,
                                VerificationStatus.SUSPENDED
                              )
                            }
                            className="bg-ink border border-ink text-chalk px-2 py-1 font-label font-bold text-xs hover:bg-ink/80"
                          >
                            Suspend
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-center text-steel font-body text-sm bg-tile/10 border border-ink/20">
            Koi pending salon nahi hai (No salons in this tab).
          </div>
        )}
      </div>

      {/* 2. Barbers Table */}
      <div className="border-4 border-maroon bg-paper p-4 sm:p-6 shadow-[5px_5px_0px_#7A1F2B] space-y-4">
        <div className="flex items-center justify-between border-b border-ink/20 pb-2">
          <h2 className="font-sign text-xl sm:text-2xl text-maroon">
            Barbers Management / उस्ताद कारीगर सत्यापन
          </h2>
          <span className="font-token text-xs text-steel">
            Count: {filteredBarbers.length}
          </span>
        </div>

        {filteredBarbers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-body text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-ink bg-tile/20 font-label font-bold text-xs uppercase text-ink">
                  <th className="p-2 sm:p-3">Barber Name</th>
                  <th className="p-2 sm:p-3">Assigned Salon</th>
                  <th className="p-2 sm:p-3">User Phone</th>
                  <th className="p-2 sm:p-3">Status</th>
                  <th className="p-2 sm:p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/20">
                {filteredBarbers.map((barber) => (
                  <tr key={barber.id} className="hover:bg-tile/10">
                    <td className="p-2 sm:p-3">
                      <div className="font-bold text-ink">{barber.displayName}</div>
                      <div className="text-xs text-steel">
                        {barber.experienceYears}+ yrs exp
                      </div>
                    </td>
                    <td className="p-2 sm:p-3">{barber.salon.name}</td>
                    <td className="p-2 sm:p-3 font-token text-xs">
                      {barber.user.phone}
                    </td>
                    <td className="p-2 sm:p-3">
                      <span
                        className={clsx(
                          'font-token text-xs font-bold px-2 py-0.5 border',
                          barber.status === VerificationStatus.VERIFIED &&
                            'bg-tile text-tealDeep border-tealDeep',
                          barber.status === VerificationStatus.PENDING &&
                            'bg-marigold text-ink border-ink',
                          barber.status === VerificationStatus.REJECTED &&
                            'bg-paper text-poleRed border-poleRed',
                          barber.status === VerificationStatus.SUSPENDED &&
                            'bg-ink text-chalk border-ink'
                        )}
                      >
                        {barber.status}
                      </span>
                    </td>
                    <td className="p-2 sm:p-3 text-right">
                      <div className="flex flex-wrap gap-1 justify-end">
                        {barber.status !== VerificationStatus.VERIFIED && (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() =>
                              handleBarberAction(
                                barber.id,
                                barber.displayName,
                                VerificationStatus.VERIFIED
                              )
                            }
                            className="bg-tile border border-tealDeep text-tealDeep px-2 py-1 font-label font-bold text-xs hover:bg-tile/80"
                          >
                            Approve
                          </button>
                        )}
                        {barber.status !== VerificationStatus.REJECTED && (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() =>
                              handleBarberAction(
                                barber.id,
                                barber.displayName,
                                VerificationStatus.REJECTED
                              )
                            }
                            className="bg-paper border border-poleRed text-poleRed px-2 py-1 font-label font-bold text-xs hover:bg-poleRed hover:text-chalk"
                          >
                            Reject
                          </button>
                        )}
                        {barber.status !== VerificationStatus.SUSPENDED && (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() =>
                              handleBarberAction(
                                barber.id,
                                barber.displayName,
                                VerificationStatus.SUSPENDED
                              )
                            }
                            className="bg-ink border border-ink text-chalk px-2 py-1 font-label font-bold text-xs hover:bg-ink/80"
                          >
                            Suspend
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-center text-steel font-body text-sm bg-tile/10 border border-ink/20">
            Koi pending ustaad nahi hai (No barbers in this tab).
          </div>
        )}
      </div>
    </div>
  );
}
