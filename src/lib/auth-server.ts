import { auth } from './auth';
import { db } from './db';
import { User, Role } from '@prisma/client';
import { redirect } from 'next/navigation';

export type CurrentUser = Pick<
  User,
  'id' | 'phone' | 'name' | 'email' | 'role' | 'language' | 'isActive'
>;

/**
 * Returns the currently authenticated user by reading the active session
 * and querying the database directly by ID. Never trusts the role or active state
 * inside the JWT token.
 * Returns null if unauthenticated, user deleted, or user is deactivated.
 */
export async function getCurrentUser(
  sessionOverride?: { user?: { id?: string } } | null
): Promise<CurrentUser | null> {
  const session =
    sessionOverride !== undefined ? sessionOverride : await auth();
  if (!session?.user?.id) {
    return null;
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      phone: true,
      name: true,
      email: true,
      role: true,
      language: true,
      isActive: true,
    },
  });

  if (!user || !user.isActive) {
    return null;
  }

  return user;
}

/**
 * Enforces authentication. If unauthenticated or deactivated, redirects to /login.
 */
export async function requireUser(callbackUrl?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    const target = callbackUrl
      ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`
      : '/login';
    redirect(target);
  }
  return user;
}

/**
 * Enforces role authorization. If user does not have one of the required roles,
 * redirects to /forbidden.
 */
export async function requireRole(...allowedRoles: Role[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!allowedRoles.includes(user.role)) {
    redirect('/forbidden');
  }
  return user;
}
