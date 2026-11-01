import React from 'react';
import { requireRole } from '@/lib/auth-server';
import { Role } from '@prisma/client';
import { db } from '@/lib/db';
import { SignboardHeader, BarberPoleDivider } from '@/components/ui';
import AdminClient from './AdminClient';

export default async function AdminPage() {
  const admin = await requireRole(Role.ADMIN);

  const salons = await db.salon.findMany({
    include: {
      owner: {
        select: {
          name: true,
          phone: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const barbers = await db.barber.findMany({
    include: {
      salon: {
        select: {
          name: true,
        },
      },
      user: {
        select: {
          name: true,
          phone: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      <SignboardHeader />

      <main className="max-w-6xl mx-auto w-full p-4 sm:p-6 flex-1 space-y-6">
        <div className="border-b-2 border-ink/20 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="font-token text-xs uppercase tracking-wider text-tealDeep bg-tile/40 px-2 py-0.5 border border-tealDeep/40 font-bold">
              ★ ADMIN CONSOLE ★
            </span>
            <h1 className="font-sign text-2xl sm:text-4xl text-maroon mt-1">
              Admin Sahab Desk / एडमिन डेस्क
            </h1>
            <p className="font-body text-xs sm:text-sm text-steel">
              Review and verify pending salons and neighbourhood barbers ({admin.phone})
            </p>
          </div>
        </div>

        <AdminClient initialSalons={salons} initialBarbers={barbers} />
      </main>

      <footer className="mt-auto border-t-2 border-ink/20">
        <BarberPoleDivider />
      </footer>
    </div>
  );
}
