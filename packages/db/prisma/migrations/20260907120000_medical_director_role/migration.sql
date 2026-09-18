-- The medical director is a role, not a flag (ADR 31). Additive for every
-- existing account: no role value changes, and the flag column being dropped
-- was introduced on this branch and held no true value anywhere.
ALTER TYPE "staff_role" ADD VALUE 'medical_director';

-- AlterTable
ALTER TABLE "users" DROP COLUMN "medicalDirector";
