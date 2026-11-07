-- Partial unique index to enforce at most one IN_PROGRESS booking per barber at the database level
CREATE UNIQUE INDEX "barber_single_in_progress" 
ON "Booking"("barberId") 
WHERE status = 'IN_PROGRESS';