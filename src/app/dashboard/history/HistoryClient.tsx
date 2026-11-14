'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { clsx } from 'clsx';
import { HistoryBookingItem } from '@/lib/staff-roster-service';

interface HistoryClientProps {
  role: 'OWNER' | 'BARBER';
  salonId: string;
  items: HistoryBookingItem[];
  totalCount: number;
  totalCompletedRupees: number;
  currentPage: number;
  totalPages: number;
  barbers: Array<{ id: string; displayName: string }>;
  currentStatus: string;
  currentFromDate: string;
  currentToDate: string;
  currentBarberId: string;
  currentTokenSearch: string;
}

export default function HistoryClient({
  role,
  salonId,
  items,
  totalCount,
  totalCompletedRupees,
  currentPage,
  totalPages,
  barbers,
  currentStatus,
  currentFromDate,
  currentToDate,
  currentBarberId,
  currentTokenSearch,
}: HistoryClientProps) {
  const t = useTranslations('dashboard');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateSearch = (updates: Record<string, string | null>) => {
    const nextParams = new URLSearchParams(searchParams ? searchParams.toString() : '');
    if (salonId) {
      nextParams.set('salonId', salonId);
    }
    for (const [key, val] of Object.entries(updates)) {
      if (val === null || val === '') {
        nextParams.delete(key);
      } else {
        nextParams.set(key, val);
      }
    }
    // Reset to page 1 on filter changes unless changing page itself
    if (!('page' in updates)) {
      nextParams.set('page', '1');
    }
    router.push(`${pathname}?${nextParams.toString()}`);
  };

  const getCustomerDisplay = (
    customerName: string | null,
    source: string,
    phoneMasked: string | null
  ) => {
    if (customerName) return customerName;
    if (source === 'WALK_IN') return t('walkIn');
    return `${t('customer')} ${phoneMasked || ''}`.trim();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-token font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
            {t('filterStatusCompleted')}
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-token font-bold bg-rose-100 text-rose-900 border border-rose-300">
            {t('filterStatusCancelled')}
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-token font-bold bg-amber-100 text-amber-900 border border-amber-300">
            {t('filterStatusRejected')}
          </span>
        );
      case 'NO_SHOW':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-token font-bold bg-gray-100 text-gray-700 border border-gray-300">
            {t('filterStatusNoShow')}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-token font-bold bg-charcoal/10 text-ink">
            {status}
          </span>
        );
    }
  };

  const statusOptions = [
    { key: 'ALL_FINAL', label: t('filterStatusAllFinal') },
    { key: 'COMPLETED', label: t('filterStatusCompleted') },
    { key: 'CANCELLED', label: t('filterStatusCancelled') },
    { key: 'REJECTED', label: t('filterStatusRejected') },
    { key: 'NO_SHOW', label: t('filterStatusNoShow') },
  ];

  return (
    <div className="space-y-6">
      {/* Header and Summary Bar */}
      <div className="bg-paper border-2 border-charcoal/20 shadow-[4px_4px_0px_#2B2118] rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-sign text-2xl sm:text-3xl text-maroon font-bold">
              {t('historyTitle')}
            </h1>
            <p className="font-body text-sm sm:text-base text-steel">
              {t('historySubtitle')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="px-3.5 py-2 rounded-xl bg-chalk border-2 border-charcoal/15 font-token text-xs sm:text-sm font-bold shadow-[2px_2px_0px_#2B2118]">
              {t('totalHistoryRecords', { count: totalCount })}
            </div>
            <div className="px-3.5 py-2 rounded-xl bg-emerald-50 border-2 border-emerald-400 font-token text-xs sm:text-sm font-bold text-emerald-950 shadow-[2px_2px_0px_#2B2118]">
              {t('totalCompletedEarnings', { amount: totalCompletedRupees })}
            </div>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="pt-3 border-t border-charcoal/10 flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Status Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            {statusOptions.map((opt) => {
              const active = currentStatus === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => updateSearch({ status: opt.key })}
                  className={clsx(
                    'min-h-[40px] px-3 py-1.5 rounded-lg font-token text-xs font-bold border transition-colors',
                    active
                      ? 'bg-maroon text-chalk border-marigold shadow-[2px_2px_0px_#2B2118]'
                      : 'bg-paper text-ink border-charcoal/15 hover:border-maroon/60'
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Date Pickers */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              aria-label={t('filterFromDate')}
              value={currentFromDate}
              onChange={(e) => updateSearch({ fromDate: e.target.value })}
              className="min-h-[40px] px-2.5 py-1 rounded-lg bg-chalk border border-charcoal/20 font-token text-xs text-ink focus:outline-none focus:border-maroon"
            />
            <span className="text-steel font-token text-xs">{'–'}</span>
            <input
              type="date"
              aria-label={t('filterToDate')}
              value={currentToDate}
              onChange={(e) => updateSearch({ toDate: e.target.value })}
              className="min-h-[40px] px-2.5 py-1 rounded-lg bg-chalk border border-charcoal/20 font-token text-xs text-ink focus:outline-none focus:border-maroon"
            />
          </div>

          {/* Barber filter (owner only) */}
          {role === 'OWNER' && barbers.length > 0 && (
            <select
              aria-label={t('filterBarber')}
              value={currentBarberId}
              onChange={(e) => updateSearch({ barberId: e.target.value || null })}
              className="min-h-[40px] px-2.5 py-1 rounded-lg bg-chalk border border-charcoal/20 font-token text-xs text-ink focus:outline-none focus:border-maroon"
            >
              <option value="">{t('filterAllBarbers')}</option>
              {barbers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.displayName}
                </option>
              ))}
            </select>
          )}

          {/* Exact Token Search */}
          <div className="flex-1 min-w-[120px]">
            <input
              type="number"
              min={1}
              placeholder={t('searchTokenPlaceholder')}
              value={currentTokenSearch}
              onChange={(e) => updateSearch({ token: e.target.value || null })}
              className="w-full min-h-[40px] px-3 py-1 rounded-lg bg-chalk border border-charcoal/20 font-token text-xs text-ink focus:outline-none focus:border-maroon"
            />
          </div>
        </div>
      </div>

      {/* History Ledger List */}
      {items.length === 0 ? (
        <div className="bg-paper border-2 border-charcoal/15 rounded-2xl p-10 text-center font-body text-steel shadow-[3px_3px_0px_#2B2118]">
          {t('noHistoryRecords')}
        </div>
      ) : (
        <div className="bg-paper border-2 border-charcoal/20 shadow-[4px_4px_0px_#2B2118] rounded-2xl overflow-hidden divide-y divide-charcoal/10">
          {items.map((item) => {
            const customerLabel = getCustomerDisplay(
              item.customerName,
              item.source,
              item.customerPhoneMasked
            );

            return (
              <Link
                key={item.id}
                href={`/dashboard/bookings/${item.id}`}
                className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-marigold/5 transition-colors group block"
              >
                <div className="flex items-start sm:items-center gap-3.5">
                  {/* Token Number Badge */}
                  <div className="w-12 h-12 rounded-xl bg-chalk border-2 border-charcoal/20 flex flex-col items-center justify-center shrink-0 shadow-[2px_2px_0px_#2B2118] group-hover:border-maroon">
                    <span className="text-[10px] font-token text-steel leading-none">{'#'}</span>
                    <span className="font-token font-bold text-base text-ink leading-tight">
                      {item.token}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-sign font-bold text-base text-ink group-hover:text-maroon">
                        {customerLabel}
                      </span>
                      {getStatusBadge(item.status)}
                      <span className="text-[11px] font-token text-steel px-2 py-0.5 rounded bg-charcoal/5 border border-charcoal/10">
                        {item.source === 'WALK_IN' ? t('sourceWalkIn') : t('sourceOnline')}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-token text-steel">
                      <span>
                        {item.dateIst}
                        {' • '}
                        {item.timeIst}
                      </span>
                      {role === 'OWNER' && (
                        <span>
                          {t('historyLedgerBarber')}
                          {':'}
                          {' '}
                          <strong className="text-ink">{item.barberName}</strong>
                        </span>
                      )}
                      <span>
                        {item.servicesSummary.join(', ')}
                      </span>
                    </div>

                    {item.cancelReason && (
                      <p className="text-xs text-rose-800 italic">
                        {item.cancelReason}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-charcoal/10">
                  <span className="font-token font-bold text-base sm:text-lg text-ink">
                    {'₹'}
                    {item.totalRupees}
                  </span>
                  <span className="text-xs font-token text-steel group-hover:text-maroon group-hover:translate-x-0.5 transition-transform">
                    {'→'}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => updateSearch({ page: String(currentPage - 1) })}
            className="min-h-[48px] px-5 py-2 rounded-xl border-2 border-charcoal/20 bg-paper font-token text-xs font-bold text-ink hover:bg-charcoal/5 disabled:opacity-40 shadow-[2px_2px_0px_#2B2118]"
          >
            {t('pagePrev')}
          </button>

          <span className="font-token text-xs text-steel font-medium">
            {t('pageIndicator', { current: currentPage, total: totalPages })}
          </span>

          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => updateSearch({ page: String(currentPage + 1) })}
            className="min-h-[48px] px-5 py-2 rounded-xl border-2 border-charcoal/20 bg-paper font-token text-xs font-bold text-ink hover:bg-charcoal/5 disabled:opacity-40 shadow-[2px_2px_0px_#2B2118]"
          >
            {t('pageNext')}
          </button>
        </div>
      )}
    </div>
  );
}
