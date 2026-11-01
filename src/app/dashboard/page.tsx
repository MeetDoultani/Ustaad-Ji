import React from 'react';
import { requireRole } from '@/lib/auth-server';
import { Role } from '@prisma/client';
import { db } from '@/lib/db';
import { SignboardHeader, BarberPoleDivider } from '@/components/ui';

export default async function DashboardPage() {
  const user = await requireRole(Role.BARBER, Role.OWNER);

  let salonName = 'Your Salon';
  if (user.role === Role.OWNER) {
    const salon = await db.salon.findFirst({
      where: { ownerId: user.id },
    });
    if (salon) salonName = salon.name;
  } else if (user.role === Role.BARBER) {
    const barber = await db.barber.findUnique({
      where: { userId: user.id },
      include: { salon: true },
    });
    if (barber?.salon) salonName = barber.salon.name;
  }

  const roleTitle = user.role === Role.OWNER ? 'Malik / मालिक (Owner)' : 'Ustaad / उस्ताद (Barber)';

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      <SignboardHeader />

      <main className="max-w-5xl mx-auto w-full p-4 sm:p-6 flex-1 space-y-6">
        {/* Welcome Board */}
        <div className="bg-tealDeep text-chalk p-6 border-4 border-maroon shadow-[5px_5px_0px_#2B2118]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-marigold/40 pb-4 mb-4">
            <div>
              <span className="font-token text-xs uppercase tracking-wider text-marigold bg-ink/50 px-2 py-0.5 border border-marigold/30">
                {roleTitle}
              </span>
              <h1 className="font-sign text-2xl sm:text-4xl text-chalk mt-1">
                Namaste, {user.name || user.phone}
              </h1>
            </div>
            <div className="text-right sm:self-center">
              <span className="font-label font-bold text-xs uppercase text-chalk/70 block">
                Salon / दुकान
              </span>
              <span className="font-sign text-xl text-marigold">
                {salonName}
              </span>
            </div>
          </div>

          <p className="font-body text-sm text-chalk/85">
            Yeh aapka digital register aur shop management panel hai.
          </p>
        </div>

        <BarberPoleDivider />

        {/* Phase 4 Coming Soon Placeholder */}
        <div className="border-4 border-dashed border-maroon bg-paper p-8 sm:p-12 text-center shadow-[4px_4px_0px_#7A1F2B]">
          <div className="font-token text-5xl text-maroon mb-3">📋</div>
          <h2 className="font-sign text-2xl text-maroon mb-1">
            Dainik Register &amp; Live Counter (Phase 4)
          </h2>
          <p className="font-body text-sm sm:text-base text-steel max-w-md mx-auto mb-4">
            Today&apos;s walk-in tokens, status management, customer queue, and price adjustments will be available in Phase 4.
          </p>
          <div className="inline-block font-token text-xs text-ink bg-tile/40 border border-ink px-4 py-2">
            Role verified: {user.role} • Status: Active
          </div>
        </div>
      </main>
    </div>
  );
}
