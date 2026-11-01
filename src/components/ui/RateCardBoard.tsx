'use client';

import React, { useState } from 'react';
import { Service, ServiceCategory } from '@prisma/client';
import { clsx } from 'clsx';
import { groupServicesByCategory, calculateServicesSummary } from '@/lib/salons';

interface RateCardBoardProps {
  services: Service[];
  selectedServiceIds?: string[];
  onToggleService?: (serviceId: string) => void;
  onBookNow?: (selectedIds: string[]) => void;
  className?: string;
  readOnly?: boolean;
}

const categoryLabels: Record<ServiceCategory, { en: string; hi: string }> = {
  HAIR: { en: 'Hair', hi: 'बाल' },
  BEARD: { en: 'Beard', hi: 'दाढ़ी' },
  SHAVE: { en: 'Shave', hi: 'शेव' },
  FACIAL: { en: 'Facial', hi: 'फेशियल' },
  MASSAGE: { en: 'Head Massage', hi: 'चंपी' },
  KIDS: { en: 'Kids', hi: 'बच्चे' },
  BRIDAL: { en: 'Groom & Bridal', hi: 'विवाह' },
  OTHER: { en: 'Other', hi: 'अन्य' },
};

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
  // Support either controlled or internal state
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
        'relative bg-tealDeep border-8 border-maroon text-chalk p-4 sm:p-7 shadow-[6px_6px_0px_#2B2118]',
        className
      )}
    >
      {/* Decorative Chalk Header */}
      <div className="border-b-2 border-dashed border-marigold/60 pb-3 mb-6 text-center">
        <h3 className="font-sign text-2xl sm:text-3xl text-marigold tracking-wide">
          Rate Card / रेट कार्ड
        </h3>
        <p className="font-body text-xs sm:text-sm text-chalk/80">
          Chalk & Board Price List • All Taxes Included
        </p>
      </div>

      {/* Services List grouped by Category */}
      <div className="space-y-6">
        {categoryOrder.map((catKey) => {
          const catServices = grouped[catKey];
          if (!catServices || catServices.length === 0) return null;
          const labels = categoryLabels[catKey] || { en: catKey, hi: catKey };

          return (
            <div key={catKey} className="space-y-2">
              {/* Category Subhead */}
              <div className="flex items-center gap-2 border-b border-chalk/30 pb-1">
                <span className="font-sign text-lg sm:text-xl text-marigold">
                  {labels.hi}
                </span>
                <span className="font-label text-sm sm:text-base text-chalk/90 font-bold uppercase tracking-wider">
                  / {labels.en}
                </span>
              </div>

              {/* Rows */}
              <div className="space-y-1.5">
                {catServices.map((service) => {
                  const isSelected = currentSelectedIds.includes(service.id);

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
                        'flex items-center justify-between gap-2 p-2 transition-all min-h-[44px]',
                        readOnly ? 'cursor-default' : 'cursor-pointer',
                        isSelected
                          ? 'bg-marigold text-ink shadow-[2px_2px_0px_#2B2118]'
                          : 'hover:bg-chalk/10 text-chalk'
                      )}
                    >
                      {/* Service Name & Duration */}
                      <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-2 flex-shrink-0">
                        <span className="font-label font-bold text-base sm:text-lg leading-tight">
                          {service.name}
                        </span>
                        {service.nameHi && (
                          <span
                            className={clsx(
                              'font-body text-xs sm:text-sm',
                              isSelected ? 'text-ink/80' : 'text-chalk/70'
                            )}
                          >
                            ({service.nameHi})
                          </span>
                        )}
                        <span
                          className={clsx(
                            'font-body text-xs',
                            isSelected ? 'text-ink/70' : 'text-chalk/60'
                          )}
                        >
                          • {service.durationMin} mins
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
                              'font-label font-bold text-xs sm:text-sm px-3 py-1.5 border-2 min-h-[36px] transition-all',
                              isSelected
                                ? 'bg-ink text-marigold border-ink'
                                : 'bg-paper text-maroon border-maroon hover:bg-marigold hover:text-ink hover:border-ink'
                            )}
                          >
                            {isSelected ? '✓ Added' : 'Book / चुनें'}
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

      {/* Selected Services Summary Bar */}
      {summary.serviceCount > 0 && (
        <div className="mt-8 border-t-2 border-dashed border-marigold/60 pt-4 bg-ink/80 -mx-4 -mb-4 sm:-mx-7 sm:-mb-7 p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-chalk">
          <div className="flex flex-col">
            <span className="font-label font-bold text-sm text-chalk/80">
              Selected: {summary.serviceCount} service{summary.serviceCount > 1 ? 's' : ''} ({summary.totalDurationMin} mins)
            </span>
            <div className="flex items-baseline gap-2">
              <span className="font-body text-sm text-marigold">Total / कुल:</span>
              <span className="font-token text-2xl sm:text-3xl text-marigold font-bold">
                ₹{summary.totalPriceRupees}
              </span>
            </div>
          </div>

          {onBookNow && (
            <button
              type="button"
              onClick={() => onBookNow(currentSelectedIds)}
              className="w-full sm:w-auto bg-marigold text-ink font-label font-bold px-6 py-3 border-2 border-ink shadow-[3px_3px_0px_#2B2118] active:translate-x-0.5 active:translate-y-0.5 min-h-[44px]"
            >
              Book Selected / स्लॉट बुक करें →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
