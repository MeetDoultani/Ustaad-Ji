import { Role } from '@prisma/client';

export interface PolicyUser {
  id: string;
  role: Role;
  isActive: boolean;
}

export interface PolicyBooking {
  id?: string;
  customerId: string;
  barberId?: string;
  barberUserId?: string;
  salonId?: string;
  salonOwnerId?: string;
}

export interface PolicySalon {
  id?: string;
  ownerId: string;
}

export interface PolicyBarber {
  id?: string;
  userId?: string;
  salonId?: string;
  salonOwnerId?: string;
}

function isValidUser(user: PolicyUser | null | undefined): user is PolicyUser {
  return (
    !!user &&
    typeof user.id === 'string' &&
    user.isActive === true &&
    Object.values(Role).includes(user.role)
  );
}

/**
 * Authorization: View a booking.
 * Allowed: The customer who owns it, assigned barber, owner of the booking's salon, ADMIN.
 */
export function canViewBooking(
  user: PolicyUser | null | undefined,
  booking: PolicyBooking | null | undefined
): boolean {
  if (!isValidUser(user) || !booking) return false;

  if (user.role === Role.ADMIN) return true;

  if (user.role === Role.CUSTOMER && user.id === booking.customerId) {
    return true;
  }

  if (
    user.role === Role.BARBER &&
    (user.id === booking.barberUserId || user.id === booking.barberId)
  ) {
    return true;
  }

  if (user.role === Role.OWNER && user.id === booking.salonOwnerId) {
    return true;
  }

  return false;
}

/**
 * Authorization: Update a booking status (check-in, in-progress, completed, no-show).
 * Allowed: Assigned barber, salon owner, ADMIN. Customers CANNOT.
 */
export function canUpdateBookingStatus(
  user: PolicyUser | null | undefined,
  booking: PolicyBooking | null | undefined
): boolean {
  if (!isValidUser(user) || !booking) return false;

  if (user.role === Role.ADMIN) return true;

  if (
    user.role === Role.BARBER &&
    (user.id === booking.barberUserId || user.id === booking.barberId)
  ) {
    return true;
  }

  if (user.role === Role.OWNER && user.id === booking.salonOwnerId) {
    return true;
  }

  return false;
}

/**
 * Authorization: Cancel a booking.
 * Allowed: Customer who owns it, assigned barber, salon owner, ADMIN.
 */
export function canCancelBooking(
  user: PolicyUser | null | undefined,
  booking: PolicyBooking | null | undefined
): boolean {
  if (!isValidUser(user) || !booking) return false;

  if (user.role === Role.ADMIN) return true;

  if (user.role === Role.CUSTOMER && user.id === booking.customerId) {
    return true;
  }

  if (
    user.role === Role.BARBER &&
    (user.id === booking.barberUserId || user.id === booking.barberId)
  ) {
    return true;
  }

  if (user.role === Role.OWNER && user.id === booking.salonOwnerId) {
    return true;
  }

  return false;
}

/**
 * Authorization: Edit salon profile, hours, services, etc.
 * Allowed: Salon owner, ADMIN.
 */
export function canManageSalon(
  user: PolicyUser | null | undefined,
  salon: PolicySalon | null | undefined
): boolean {
  if (!isValidUser(user) || !salon) return false;

  if (user.role === Role.ADMIN) return true;

  if (user.role === Role.OWNER && user.id === salon.ownerId) {
    return true;
  }

  return false;
}

/**
 * Authorization: Manage barber profile, status, commission, and salon assignment.
 * Allowed: Owner of the barber's salon, ADMIN.
 * Denied: Barbers (barbers cannot manage their own profile/status), other salon owners, customers.
 */
export function canManageBarber(
  user: PolicyUser | null | undefined,
  barber: PolicyBarber | null | undefined
): boolean {
  if (!isValidUser(user) || !barber) return false;

  if (user.role === Role.ADMIN) return true;

  if (user.role === Role.OWNER && user.id === barber.salonOwnerId) {
    return true;
  }

  return false;
}

/**
 * Authorization: Manage barber availability, working shifts, and time off.
 * Allowed: The barber themselves (own schedule only), owner of the barber's salon, ADMIN.
 * Denied: Barber A trying to edit Barber B's availability, other salon owners, customers.
 */
export function canManageBarberAvailability(
  user: PolicyUser | null | undefined,
  barber: PolicyBarber | null | undefined
): boolean {
  if (!isValidUser(user) || !barber) return false;

  if (user.role === Role.ADMIN) return true;

  if (user.role === Role.OWNER && user.id === barber.salonOwnerId) {
    return true;
  }

  if (
    user.role === Role.BARBER &&
    (user.id === barber.userId || user.id === barber.id)
  ) {
    return true;
  }

  return false;
}

/**
 * Authorization: Approve, reject, or suspend a salon.
 * Allowed: ADMIN only.
 */
export function canApproveSalon(user: PolicyUser | null | undefined): boolean {
  if (!isValidUser(user)) return false;
  return user.role === Role.ADMIN;
}

/**
 * Authorization: Approve, reject, or suspend a barber.
 * Allowed: ADMIN only.
 */
export function canApproveBarber(user: PolicyUser | null | undefined): boolean {
  if (!isValidUser(user)) return false;
  return user.role === Role.ADMIN;
}

/**
 * Authorization: Access admin area.
 * Allowed: ADMIN only.
 */
export function canViewAdminArea(user: PolicyUser | null | undefined): boolean {
  if (!isValidUser(user)) return false;
  return user.role === Role.ADMIN;
}

/**
 * Authorization: Create a booking.
 * Allowed: Active CUSTOMER only.
 */
export function canCreateBooking(user: PolicyUser | null | undefined): boolean {
  if (!isValidUser(user)) return false;
  return user.role === Role.CUSTOMER;
}

/**
 * Authorization: Reschedule a booking.
 * Allowed: Active CUSTOMER who owns the booking, or ADMIN.
 */
export function canRescheduleBooking(
  user: PolicyUser | null | undefined,
  booking: PolicyBooking | null | undefined
): boolean {
  if (!isValidUser(user) || !booking) return false;

  if (user.role === Role.ADMIN) return true;

  if (user.role === Role.CUSTOMER && user.id === booking.customerId) {
    return true;
  }

  return false;
}

/**
 * Authorization: Access staff dashboard.
 * Allowed: Active BARBER or OWNER.
 */
export function canViewStaffDashboard(user: PolicyUser | null | undefined): boolean {
  if (!isValidUser(user)) return false;
  return user.role === Role.BARBER || user.role === Role.OWNER;
}

/**
 * Authorization: Create a walk-in booking.
 * Allowed: A barber for their own profile, an owner for barbers of their own salon.
 * Denied: Admins (admins do not operate chairs), customers, other staff.
 */
export function canCreateWalkIn(
  user: PolicyUser | null | undefined,
  barber: PolicyBarber | null | undefined
): boolean {
  if (!isValidUser(user) || !barber) return false;

  if (
    user.role === Role.BARBER &&
    (user.id === barber.userId || user.id === barber.id)
  ) {
    return true;
  }

  if (user.role === Role.OWNER && user.id === barber.salonOwnerId) {
    return true;
  }

  return false;
}
