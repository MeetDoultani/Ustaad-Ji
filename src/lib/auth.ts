import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from './auth-config';
import { normalizeIndianPhone } from './phone';
import { verifyOtp } from './otp';
import { db } from './db';
import { Role } from '@prisma/client';
import { cookies } from 'next/headers';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      id: 'phone-otp',
      name: 'Phone OTP',
      credentials: {
        phone: { label: 'Phone', type: 'text' },
        code: { label: 'Code', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.phone || !credentials?.code) {
          return null;
        }

        const phoneResult = normalizeIndianPhone(String(credentials.phone));
        if (!phoneResult.isValid || !phoneResult.e164) {
          return null;
        }

        const phone = phoneResult.e164;
        const code = String(credentials.code).trim();

        // 1. Verify OTP code
        const verification = await verifyOtp(phone, code);
        if (!verification.success) {
          return null;
        }

        // 2. Fetch or create User
        let user = await db.user.findUnique({
          where: { phone },
        });

        if (!user) {
          let userLanguage = 'en';
          try {
            const cookieStore = await cookies();
            const localeCookie = cookieStore.get('NEXT_LOCALE')?.value;
            if (localeCookie === 'hi' || localeCookie === 'en') {
              userLanguage = localeCookie;
            }
          } catch {
            userLanguage = 'en';
          }

          // First-time login: create CUSTOMER role user defaulting to 'en' (or NEXT_LOCALE cookie)
          user = await db.user.create({
            data: {
              phone,
              role: Role.CUSTOMER,
              language: userLanguage,
              isActive: true,
            },
          });
        } else if (!user.isActive) {
          // Deactivated user: reject login
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
});
