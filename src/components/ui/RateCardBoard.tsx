'use client';

import React, { useState } from 'react';
import { Service, ServiceCategory } from '@prisma/client';
import { clsx } from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { groupServicesByCategory, calculateServicesSummary } from '@/lib/salons';
import { getLocalizedName } from '@/i18n/config';

interface RateCardBoardProps {
  services: Service[];
  selectedServiceIds?: string[];
  onToggleService?: (serviceId: string) => void;
  onBookNow?: (selectedIds: string[]) => void;
  className?: string;
  readOnly?: boolean;
}

const categoryOrder: ServiceCategory[] = [
  ServiceCategory.HAIR,
  ServiceCategory.BEARD,
  ServiceCategory.SHAVE,
  ServiceCategory.FACIAL,
  ServiceCategory.MASSAGE,
  ServiceCategory.KIDS,
  ServiceCategory.BRIDAL,
  ServiceCategory.OTHER,
];

export default function RateCardBoard({
  services,
  selectedServiceIds: externalSelectedIds,
  onToggleService,
  onBookNow,
  className,
  readOnly = false,
}: RateCardBoardProps) {
  const locale = useLocale();
  const tCard = useTranslations('rateCard');
  const tDetails = useTranslations('salonDetails');
  const tCommon = useTranslations('common');
  const tCat = useTranslations('categories');

  const [internalSelectedIds, setInternalSelectedIds] = useState<string[]>([]);
  const isControlled = externalSelectedIds !== undefined;
  const currentSelectedIds = isControlled ? externalSelectedIds : internalSelectedIds;

  const handleToggle = (serviceId: string) => {
    if (readOnly) return;
    if (onToggleService) {
      onToggleService(serviceId);
    }
    if (!isControlled) {
      setInternalSelectedIds((prev) =>
        prev.includes(serviceId)
          ? prev.filter((id) => id !== serviceId)
          : [...prev, serviceId]
      );
    }
  };

  const grouped = groupServicesByCategory(services);
  const summary = calculateServicesSummary(services, currentSelectedIds);

  return (
    <div
      className={clsx(
        'relative bg-tealDeep border-8 border-maroon text-chalk p-4 sm:p-7 shadow-[6px_6px_0px_#2B2118] rounded-xl',
        className
      )}
    >
      {/* Decorative Chalk Header */}
      <div className="border-b-2 border-dashed border-marigold/60 pb-3 mb-6 text-center">
        <h3 className="font-sign text-2xl sm:text-3xl text-marigold tracking-normal">
          {tDetails('rateCardTitle')}
        </h3>
        <p className="font-body text-xs sm:text-sm text-chalk/80 mt-1">
          {tCard('subtitle')}
        </p>
      </div>

      {/* Services List grouped by Category */}
      <div className="space-y-6">
        {categoryOrder.map((catKey) => {
          const catServices = grouped[catKey];
          if (!catServices || catServices.length === 0) return null;
          const categoryName = tCat(catKey);

          return (
            <div key={catKey} className="space-y-2">
              {/* Category Subhead: Single language */}
              <div className="flex items-center gap-2 border-b border-chalk/30 pb-1">
                <span className="font-sign text-lg sm:text-xl text-marigold tracking-normal">
                  {categoryName}
                </span>
              </div>

              {/* Rows */}
              <div className="space-y-1.5">
                {catServices.map((service) => {
                  const isSelected = currentSelectedIds.includes(service.id);
                  const localizedName = getLocalizedName(service, locale);

                  return (
                    <div
                      key={service.id}
                      onClick={() => handleToggle(service.id)}
                      role={readOnly ? 'presentation' : 'checkbox'}
                      aria-checked={isSelected}
                      tabIndex={readOnly ? -1 : 0}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault();
                          handleToggle(service.id);
                        }
                      }}
                      className={clsx(
                        'flex items-center justify-between gap-2 p-2 transition-all min-h-[44px] rounded-lg',
                        readOnly ? 'cursor-default' : 'cursor-pointer',
                        isSelected
                          ? 'bg-marigold text-ink shadow-[2px_2px_0px_#2B2118]'
                          : 'hover:bg-chalk/10 text-chalk'
                      )}
                    >
                      {/* Service Name & Duration */}
                      <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-2 flex-shrink-0">
                        <span className="font-label font-bold text-base sm:text-lg leading-tight">
                          {localizedName}
                        </span>
                        <span
                          className={clsx(
                            'font-body text-xs',
                            isSelected ? 'text-ink/80' : 'text-chalk/70'
                          )}
                        >
                          • {service.durationMin} {tCard('mins')}
                        </span>
                      </div>

                      {/* Dotted Leader Line */}
                      <div
                        className={clsx(
                          'flex-1 border-b-2 border-dotted hidden xs:block mx-2 self-baseline mb-1.5',
                          isSelected ? 'border-ink/40' : 'border-chalk/40'
                        )}
                        aria-hidden="true"
                      />

                      {/* Price & Selection Button */}
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span
                          className={clsx(
                            'font-token text-lg sm:text-xl font-bold tracking-tight',
                            isSelected ? 'text-ink' : 'text-marigold'
                          )}
                        >
                          ₹{service.priceRupees}
                        </span>

                        {!readOnly && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggle(service.id);
                            }}
                            className={clsx(
                              'px-3 py-1 text-xs font-label font-bold border-2 transition-all min-h-[36px] rounded',
                              isSelected
                                ? 'bg-ink text-marigold border-ink hover:bg-ink/80'
                                : 'bg-chalk/10 text-chalk border-chalk/40 hover:bg-marigold hover:text-ink hover:border-marigold'
                            )}
                          >
                            {isSelected ? tCard('selected') : tCard('book')}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Sticky Bottom Summary if items selected */}
      {summary.serviceCount > 0 && !readOnly && (
        <div className="mt-6 pt-4 border-t-2 border-marigold/60 flex flex-col sm:flex-row items-center justify-between gap-4 bg-tealDeep/80 p-3 rounded-lg">
          <div className="flex items-baseline gap-4">
            <div>
              <span className="text-xs text-chalk/70 block uppercase font-label">
                {tCard('total')}
              </span>
              <span className="font-token text-2xl font-bold text-marigold">
                ₹{summary.totalPriceRupees}
              </span>
            </div>
            <div>
              <span className="text-xs text-chalk/70 block uppercase font-label">
                {tCard('duration')}
              </span>
              <span className="font-body text-base font-bold text-chalk">
                {summary.totalDurationMin} {tCard('mins')}
              </span>
            </div>
          </div>

          {onBookNow && (
            <button
              type="button"
              onClick={() => onBookNow(currentSelectedIds)}
              className="w-full sm:w-auto min-h-[44px] bg-marigold text-ink font-label font-bold px-6 py-2 border-2 border-ink shadow-[3px_3px_0px_#2B2118] active:translate-x-0.5 active:translate-y-0.5 hover:bg-saffron transition-all rounded-lg"
            >
              {tCommon('bookSlot')} ({summary.serviceCount})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
