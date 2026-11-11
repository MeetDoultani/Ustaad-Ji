'use client';

import React, { useState, useTransition } from 'react';
import { ServiceCategory, VerificationStatus } from '@prisma/client';
import { clsx } from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import {
  createServiceAction,
  updateServiceAction,
  toggleServiceActiveAction,
  reorderServiceAction,
} from '../actions';

interface StaffServiceItem {
  id: string;
  salonId: string;
  category: ServiceCategory;
  name: string;
  nameHi: string | null;
  durationMin: number;
  priceRupees: number;
  isActive: boolean;
  sortOrder: number;
  barberIds: string[];
}

interface ActiveBarberItem {
  id: string;
  displayName: string;
  isActive: boolean;
  status: VerificationStatus;
}

interface ServicesClientProps {
  salonId: string;
  initialServices: StaffServiceItem[];
  activeBarbers: ActiveBarberItem[];
}

const CATEGORY_ORDER: ServiceCategory[] = [
  ServiceCategory.HAIR,
  ServiceCategory.BEARD,
  ServiceCategory.SHAVE,
  ServiceCategory.FACIAL,
  ServiceCategory.MASSAGE,
  ServiceCategory.KIDS,
  ServiceCategory.BRIDAL,
  ServiceCategory.OTHER,
];

const DURATION_OPTIONS = [
  15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240,
];

export default function ServicesClient({
  salonId,
  initialServices,
  activeBarbers,
}: ServicesClientProps) {
  const locale = useLocale();
  const t = useTranslations('dashboard');
  const tCat = useTranslations('categories');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');

  const [services, setServices] = useState<StaffServiceItem[]>(initialServices);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Form states
  const [formCategory, setFormCategory] = useState<ServiceCategory>(ServiceCategory.HAIR);
  const [formName, setFormName] = useState('');
  const [formNameHi, setFormNameHi] = useState('');
  const [formPrice, setFormPrice] = useState(100);
  const [formDuration, setFormDuration] = useState(30);
  const [formIsActive, setFormIsActive] = useState(true);
  const [formBarberIds, setFormBarberIds] = useState<string[]>([]);

  const openAddModal = () => {
    setEditingServiceId(null);
    setFormCategory(ServiceCategory.HAIR);
    setFormName('');
    setFormNameHi('');
    setFormPrice(100);
    setFormDuration(30);
    setFormIsActive(true);
    setFormBarberIds(activeBarbers.map((b) => b.id));
    setErrorMessage(null);
    setModalOpen(true);
  };

  const openEditModal = (service: StaffServiceItem) => {
    setEditingServiceId(service.id);
    setFormCategory(service.category);
    setFormName(service.name);
    setFormNameHi(service.nameHi || '');
    setFormPrice(service.priceRupees);
    setFormDuration(service.durationMin);
    setFormIsActive(service.isActive);
    setFormBarberIds(service.barberIds);
    setErrorMessage(null);
    setModalOpen(true);
  };

  const handleBarberToggle = (barberId: string) => {
    setFormBarberIds((prev) =>
      prev.includes(barberId) ? prev.filter((id) => id !== barberId) : [...prev, barberId]
    );
  };

  const handleSave = () => {
    setErrorMessage(null);
    startTransition(async () => {
      if (editingServiceId) {
        const res = await updateServiceAction({
          salonId,
          serviceId: editingServiceId,
          category: formCategory,
          name: formName,
          nameHi: formNameHi.trim() ? formNameHi.trim() : null,
          priceRupees: Number(formPrice),
          durationMin: Number(formDuration),
          isActive: formIsActive,
          barberIds: formBarberIds,
        });

        if (!res.ok) {
          const errKey = res.code && tErrors.has(res.code) ? tErrors(res.code as never) : (res.error || tErrors('generic'));
          setErrorMessage(errKey);
          return;
        }

        setServices((prev) =>
          prev.map((s) =>
            s.id === editingServiceId
              ? {
                  ...s,
                  category: formCategory,
                  name: formName,
                  nameHi: formNameHi.trim() ? formNameHi.trim() : null,
                  priceRupees: Number(formPrice),
                  durationMin: Number(formDuration),
                  isActive: formIsActive,
                  barberIds: formBarberIds,
                }
              : s
          )
        );
      } else {
        const res = await createServiceAction({
          salonId,
          category: formCategory,
          name: formName,
          nameHi: formNameHi.trim() ? formNameHi.trim() : null,
          priceRupees: Number(formPrice),
          durationMin: Number(formDuration),
          isActive: formIsActive,
          barberIds: formBarberIds,
        });

        if (!res.ok) {
          const errKey = res.code && tErrors.has(res.code) ? tErrors(res.code as never) : (res.error || tErrors('generic'));
          setErrorMessage(errKey);
          return;
        }

        if (res.data?.id) {
          const newService: StaffServiceItem = {
            id: res.data.id,
            salonId,
            category: formCategory,
            name: formName,
            nameHi: formNameHi.trim() ? formNameHi.trim() : null,
            priceRupees: Number(formPrice),
            durationMin: Number(formDuration),
            isActive: formIsActive,
            sortOrder: services.length + 1,
            barberIds: formBarberIds,
          };
          setServices((prev) => [...prev, newService]);
        }
      }

      setModalOpen(false);
    });
  };

  const handleToggleActive = (service: StaffServiceItem) => {
    startTransition(async () => {
      const targetState = !service.isActive;
      const res = await toggleServiceActiveAction({
        salonId,
        serviceId: service.id,
        isActive: targetState,
      });

      if (res.ok) {
        setServices((prev) =>
          prev.map((s) => (s.id === service.id ? { ...s, isActive: targetState } : s))
        );
      }
    });
  };

  const handleReorder = (serviceId: string, direction: 'UP' | 'DOWN') => {
    startTransition(async () => {
      const res = await reorderServiceAction({
        salonId,
        serviceId,
        direction,
      });

      if (res.ok) {
        setServices((prev) => {
          const list = [...prev];
          const idx = list.findIndex((s) => s.id === serviceId);
          if (idx === -1) return prev;
          const targetIdx = direction === 'UP' ? idx - 1 : idx + 1;
          if (targetIdx < 0 || targetIdx >= list.length) return prev;

          const temp = list[idx];
          list[idx] = list[targetIdx];
          list[targetIdx] = temp;
          return list;
        });
      }
    });
  };

  // Group services by category
  const servicesByCategory = new Map<ServiceCategory, StaffServiceItem[]>();
  for (const s of services) {
    const list = servicesByCategory.get(s.category) || [];
    list.push(s);
    servicesByCategory.set(s.category, list);
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-paper border-4 border-maroon p-5 shadow-[4px_4px_0px_#7A1F2B] rounded-xl">
        <div>
          <h1 className="font-sign text-2xl sm:text-3xl text-maroon font-bold">
            {t('servicesTitle')}
          </h1>
          <p className="font-body text-sm text-steel mt-0.5">
            {t('servicesSubtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="min-h-[48px] px-5 py-2.5 bg-marigold text-ink font-label font-bold text-sm border-2 border-ink rounded-lg shadow-[3px_3px_0px_#2B2118] hover:bg-marigold/90 active:translate-x-0.5 active:translate-y-0.5 transition-all select-none self-start sm:self-auto"
        >
          {t('addService')}
        </button>
      </div>

      {/* Painted Rate Card Board Visual Metaphor */}
      <div className="relative bg-tealDeep border-8 border-maroon text-chalk p-4 sm:p-7 shadow-[6px_6px_0px_#2B2118] rounded-xl space-y-6">
        {/* Chalkboard Header */}
        <div className="border-b-2 border-dashed border-marigold/60 pb-3 text-center">
          <h2 className="font-sign text-2xl sm:text-3xl text-marigold tracking-normal">
            {t('servicesTitle')}
          </h2>
          <p className="font-body text-xs sm:text-sm text-chalk/80 mt-1">
            {t('servicesSubtitle')}
          </p>
        </div>

        {services.length === 0 ? (
          <div className="text-center py-12 text-chalk/70 font-body">
            {t('noServices')}
          </div>
        ) : (
          <div className="space-y-8">
            {CATEGORY_ORDER.map((category) => {
              const catServices = servicesByCategory.get(category);
              if (!catServices || catServices.length === 0) return null;

              return (
                <div key={category} className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-marigold/40 pb-1.5">
                    <span className="font-sign text-xl text-marigold font-bold">
                      {tCat(category)}
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {catServices.map((service, index) => {
                      const displayName =
                        locale === 'hi' && service.nameHi ? service.nameHi : service.name;
                      const hasActiveBarbers = service.barberIds.length > 0;

                      return (
                        <div
                          key={service.id}
                          className={clsx(
                            'p-3.5 sm:p-4 rounded-lg border-2 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3',
                            service.isActive
                              ? 'bg-ink/40 border-marigold/40'
                              : 'bg-charcoal/40 border-steel/30 opacity-70'
                          )}
                        >
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-sign text-lg text-chalk font-semibold truncate">
                                {displayName}
                              </span>

                              {/* Status Badge */}
                              <span
                                className={clsx(
                                  'font-token text-xs px-2 py-0.5 rounded border select-none',
                                  service.isActive
                                    ? 'bg-forest/20 text-marigold border-marigold/40'
                                    : 'bg-charcoal/50 text-steel border-steel/40'
                                )}
                              >
                                {service.isActive ? t('serviceActive') : t('serviceHidden')}
                              </span>

                              {/* Unassigned Barber Warning Chip */}
                              {service.isActive && !hasActiveBarbers && (
                                <span className="font-body text-xs bg-amber-900/60 text-amber-200 border border-amber-400/60 px-2.5 py-0.5 rounded-full select-none">
                                  {t('noActiveBarbersWarning')}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-4 text-xs font-token text-chalk/80">
                              <span className="font-bold text-marigold text-sm">
                                {tCommon('price', { price: service.priceRupees })}
                              </span>
                              <span>•</span>
                              <span>
                                {t('serviceDurationMins', { duration: service.durationMin })}
                              </span>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center gap-2 flex-wrap self-end md:self-auto">
                            {/* Reorder Buttons */}
                            <button
                              type="button"
                              disabled={isPending || index === 0}
                              onClick={() => handleReorder(service.id, 'UP')}
                              aria-label={t('moveUp')}
                              className="min-h-[48px] min-w-[48px] px-3 py-2 bg-ink/70 hover:bg-ink text-chalk text-xs border border-marigold/40 rounded flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed select-none transition-colors"
                            >
                              {t('moveUp')}
                            </button>
                            <button
                              type="button"
                              disabled={isPending || index === catServices.length - 1}
                              onClick={() => handleReorder(service.id, 'DOWN')}
                              aria-label={t('moveDown')}
                              className="min-h-[48px] min-w-[48px] px-3 py-2 bg-ink/70 hover:bg-ink text-chalk text-xs border border-marigold/40 rounded flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed select-none transition-colors"
                            >
                              {t('moveDown')}
                            </button>

                            {/* Edit Button */}
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => openEditModal(service)}
                              aria-label={t('edit')}
                              className="min-h-[48px] px-3.5 py-2 bg-marigold text-ink font-bold text-xs border border-ink rounded flex items-center justify-center select-none hover:bg-marigold/90 transition-colors"
                            >
                              {t('edit')}
                            </button>

                            {/* Soft-Delete / Reactivate Button */}
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => handleToggleActive(service)}
                              aria-label={service.isActive ? t('hideService') : t('showService')}
                              className={clsx(
                                'min-h-[48px] px-3.5 py-2 font-bold text-xs rounded border flex items-center justify-center select-none transition-colors',
                                service.isActive
                                  ? 'bg-rose-950/60 hover:bg-rose-900/80 text-rose-200 border-rose-400/50'
                                  : 'bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-200 border-emerald-400/50'
                              )}
                            >
                              {service.isActive ? t('hideService') : t('showService')}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add / Edit Service Modal */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-ink/70 flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-paper border-4 border-maroon text-ink p-6 max-w-lg w-full rounded-2xl shadow-[6px_6px_0px_#2B2118] space-y-5 my-8">
            <div className="flex items-center justify-between border-b-2 border-charcoal/20 pb-3">
              <h3 className="font-sign text-2xl text-maroon font-bold">
                {editingServiceId ? t('editService') : t('addService')}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label={t('close')}
                className="min-h-[48px] min-w-[48px] flex items-center justify-center text-ink font-bold text-lg hover:text-maroon select-none"
              >
                ✕
              </button>
            </div>

            {errorMessage && (
              <div className="p-3 bg-rose-100 border border-rose-400 text-rose-900 text-sm rounded-lg font-body">
                {errorMessage}
              </div>
            )}

            <div className="space-y-4">
              {/* Category */}
              <div>
                <label className="block font-label text-xs uppercase font-bold text-steel mb-1">
                  {t('serviceCategory')}
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value as ServiceCategory)}
                  className="w-full min-h-[48px] px-3 bg-chalk border-2 border-charcoal/30 rounded-lg text-ink font-body text-sm focus:outline-none focus:border-maroon"
                >
                  {CATEGORY_ORDER.map((c) => (
                    <option key={c} value={c}>
                      {tCat(c)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Name */}
              <div>
                <label className="block font-label text-xs uppercase font-bold text-steel mb-1">
                  {t('serviceName')}
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  maxLength={60}
                  className="w-full min-h-[48px] px-3 bg-chalk border-2 border-charcoal/30 rounded-lg text-ink font-body text-sm focus:outline-none focus:border-maroon"
                />
              </div>

              {/* Hindi Name */}
              <div>
                <label className="block font-label text-xs uppercase font-bold text-steel mb-1">
                  {t('serviceNameHi')}
                </label>
                <input
                  type="text"
                  value={formNameHi}
                  onChange={(e) => setFormNameHi(e.target.value)}
                  maxLength={100}
                  className="w-full min-h-[48px] px-3 bg-chalk border-2 border-charcoal/30 rounded-lg text-ink font-body text-sm focus:outline-none focus:border-maroon"
                />
              </div>

              {/* Price and Duration Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-label text-xs uppercase font-bold text-steel mb-1">
                    {t('servicePrice')}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50000}
                    step={1}
                    value={formPrice}
                    onChange={(e) => setFormPrice(Number(e.target.value))}
                    className="w-full min-h-[48px] px-3 bg-chalk border-2 border-charcoal/30 rounded-lg text-ink font-body text-sm focus:outline-none focus:border-maroon"
                  />
                </div>
                <div>
                  <label className="block font-label text-xs uppercase font-bold text-steel mb-1">
                    {t('serviceDuration')}
                  </label>
                  <select
                    value={formDuration}
                    onChange={(e) => setFormDuration(Number(e.target.value))}
                    className="w-full min-h-[48px] px-3 bg-chalk border-2 border-charcoal/30 rounded-lg text-ink font-body text-sm focus:outline-none focus:border-maroon"
                  >
                    {DURATION_OPTIONS.map((min) => (
                      <option key={min} value={min}>
                        {t('serviceDurationMins', { duration: min })}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Active Toggle */}
              <div className="flex items-center gap-3 pt-1">
                <input
                  type="checkbox"
                  id="serviceActiveToggle"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="w-5 h-5 accent-maroon rounded"
                />
                <label htmlFor="serviceActiveToggle" className="font-body text-sm font-semibold text-ink select-none">
                  {t('serviceActive')}
                </label>
              </div>

              {/* Assigned Barbers */}
              {activeBarbers.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-charcoal/15">
                  <span className="block font-label text-xs uppercase font-bold text-steel">
                    {t('assignedBarbers')}
                  </span>
                  <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                    {activeBarbers.map((barber) => (
                      <label
                        key={barber.id}
                        className="flex items-center gap-3 p-2 rounded-lg bg-chalk border border-charcoal/15 hover:border-maroon/50 cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={formBarberIds.includes(barber.id)}
                          onChange={() => handleBarberToggle(barber.id)}
                          className="w-5 h-5 accent-maroon rounded"
                        />
                        <span className="font-body text-sm text-ink font-medium">
                          {barber.displayName}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t-2 border-charcoal/20">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={isPending}
                className="min-h-[48px] px-4 py-2 border-2 border-charcoal/30 text-ink rounded-lg font-label font-bold text-sm hover:bg-charcoal/10 transition-colors select-none"
              >
                {tCommon('cancel')}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending}
                className="min-h-[48px] px-6 py-2 bg-maroon text-chalk rounded-lg font-label font-bold text-sm border-2 border-marigold shadow-[3px_3px_0px_#2B2118] hover:bg-maroon/90 active:translate-x-0.5 active:translate-y-0.5 transition-all select-none disabled:opacity-50"
              >
                {isPending ? t('saving') : t('saveService')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
